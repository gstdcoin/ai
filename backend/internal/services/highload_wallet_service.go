package services

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/liteclient"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/ton/jetton"
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// BatchTransfer represents a single TON transfer in a batch
type BatchTransfer struct {
	RecipientAddr string
	AmountNano    int64
	Comment       string
}

// GSTDBatchTransfer represents a single GSTD Jetton transfer (TEP-74)
type GSTDBatchTransfer struct {
	RecipientAddr string // Worker's wallet address (destination_address)
	AmountNano    int64  // GSTD amount in nano (9 decimals)
}

// HighloadWalletService implements SignAndBroadcastBatch for Wallet V2/V3
// Uses tonutils-go with Liteserver; 1 gas tx serves 50+ workers
type HighloadWalletService struct {
	hlWallet      *wallet.Wallet
	api           ton.APIClientWrapped
	configURL     string
	initialized   bool
	mu            sync.Mutex
	telegramAlert func(ctx context.Context, msg string) error
}

// NewHighloadWalletService creates service from seed and liteserver config
// seedWords: 24-word mnemonic
// liteserverConfigURL: e.g. https://ton-blockchain.github.io/global.config.json (mainnet)
func NewHighloadWalletService(seedWords []string, liteserverConfigURL string) (*HighloadWalletService, error) {
	if len(seedWords) < 12 {
		return nil, fmt.Errorf("seed must have at least 12 words")
	}
	if liteserverConfigURL == "" {
		liteserverConfigURL = "https://ton-blockchain.github.io/global.config.json"
	}

	client := liteclient.NewConnectionPool()
	if err := client.AddConnectionsFromConfigUrl(context.Background(), liteserverConfigURL); err != nil {
		return nil, fmt.Errorf("liteserver config: %w", err)
	}

	api := ton.NewAPIClient(client, ton.ProofCheckPolicyFast).WithRetry()

	// Query ID: use timestamp-based, max 1<<23 per highload spec
	var lastID uint32
	msgBuilder := func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
		createdAt = time.Now().Unix() - 30 // LS emulation quirk
		id = uint32(createdAt % (1 << 23))
		if id == lastID {
			id = (id + 1) % (1 << 23)
		}
		lastID = id
		return id, createdAt, nil
	}

	hlWallet, err := wallet.FromSeedWithOptions(api, seedWords, wallet.ConfigHighloadV3{
		MessageTTL:     60 * 5,
		MessageBuilder: msgBuilder,
	})
	if err != nil {
		return nil, fmt.Errorf("highload wallet init: %w", err)
	}

	log.Printf("[Highload] Wallet initialized: %s", hlWallet.WalletAddress().String())
	return &HighloadWalletService{
		hlWallet:    hlWallet,
		api:         api,
		configURL:   liteserverConfigURL,
		initialized: true,
	}, nil
}

// SignAndBroadcastBatch sends multiple TON transfers in a single transaction
// Returns tx hash (base64) or error
func (s *HighloadWalletService) SignAndBroadcastBatch(ctx context.Context, transfers []BatchTransfer) (txHash string, err error) {
	if !s.initialized || s.hlWallet == nil {
		return "", fmt.Errorf("highload wallet not initialized")
	}
	if len(transfers) == 0 {
		return "", fmt.Errorf("no transfers to send")
	}
	if len(transfers) > 255 {
		return "", fmt.Errorf("max 255 transfers per batch (Highload limit)")
	}

	var messages []*wallet.Message
	for _, t := range transfers {
		addr, err := address.ParseAddr(t.RecipientAddr)
		if err != nil {
			preview := t.RecipientAddr
			if len(preview) > 16 {
				preview = preview[:16]
			}
			return "", fmt.Errorf("invalid recipient %s: %w", preview, err)
		}
		amount := tlb.FromNanoTON(big.NewInt(t.AmountNano))
		var body *cell.Cell
		if t.Comment != "" {
			body, err = wallet.CreateCommentCell(t.Comment)
			if err != nil {
				return "", fmt.Errorf("comment cell: %w", err)
			}
		}
		msg := &wallet.Message{
			Mode: wallet.PayGasSeparately + wallet.IgnoreErrors,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      addr.IsBounceable(),
				DstAddr:     addr,
				Amount:      amount,
				Body:        body,
			},
		}
		messages = append(messages, msg)
	}

	hash, err := s.hlWallet.SendManyWaitTxHash(ctx, messages)
	if err != nil {
		return "", fmt.Errorf("send batch: %w", err)
	}

	txHash = base64.URLEncoding.EncodeToString(hash)
	log.Printf("[Highload] Batch sent: %d transfers, tx=%s", len(transfers), txHash)
	return txHash, nil
}

// WalletAddress returns the highload wallet address
func (s *HighloadWalletService) WalletAddress() string {
	if s.hlWallet == nil {
		return ""
	}
	return s.hlWallet.WalletAddress().String()
}

// IsInitialized returns whether the service is ready
func (s *HighloadWalletService) IsInitialized() bool {
	return s.initialized && s.hlWallet != nil
}

// SetTelegramAlert sets callback for critical alerts (e.g. gas reserve low)
func (s *HighloadWalletService) SetTelegramAlert(fn func(ctx context.Context, msg string) error) {
	s.telegramAlert = fn
}

// SignAndBroadcastGSTDBatch sends multiple GSTD Jetton transfers (TEP-74) in a single Highload tx
// Each internal_message goes to platform's Jetton wallet with transfer payload (destination_address = worker)
func (s *HighloadWalletService) SignAndBroadcastGSTDBatch(ctx context.Context, jettonMasterAddr string, transfers []GSTDBatchTransfer) (txHash string, err error) {
	if !s.initialized || s.hlWallet == nil || s.api == nil {
		return "", fmt.Errorf("highload wallet not initialized")
	}
	if jettonMasterAddr == "" || len(transfers) == 0 {
		return "", fmt.Errorf("jetton master and transfers required")
	}
	if len(transfers) > 255 {
		return "", fmt.Errorf("max 255 transfers per batch (Highload limit)")
	}

	masterAddr, err := address.ParseAddr(jettonMasterAddr)
	if err != nil {
		return "", fmt.Errorf("invalid jetton master: %w", err)
	}

	token := jetton.NewJettonMasterClient(s.api, masterAddr)
	ourJettonWallet, err := token.GetJettonWallet(ctx, s.hlWallet.WalletAddress())
	if err != nil {
		return "", fmt.Errorf("get jetton wallet: %w", err)
	}

	responseTo := s.hlWallet.WalletAddress()
	gasPerTransfer := tlb.MustFromTON("0.02")

	var messages []*wallet.Message
	for _, t := range transfers {
		destAddr, err := address.ParseAddr(t.RecipientAddr)
		if err != nil {
			return "", fmt.Errorf("invalid recipient %s: %w", t.RecipientAddr, err)
		}
		amountCoins := tlb.FromNanoTON(big.NewInt(t.AmountNano))
		payload, err := jetton.BuildTransferPayload(destAddr, responseTo, amountCoins, tlb.ZeroCoins, nil, nil)
		if err != nil {
			return "", fmt.Errorf("build transfer payload: %w", err)
		}
		msg := &wallet.Message{
			Mode: wallet.PayGasSeparately + wallet.IgnoreErrors,
			InternalMessage: &tlb.InternalMessage{
				IHRDisabled: true,
				Bounce:      ourJettonWallet.Address().IsBounceable(),
				DstAddr:     ourJettonWallet.Address(),
				Amount:      gasPerTransfer,
				Body:        payload,
			},
		}
		messages = append(messages, msg)
	}

	hash, err := s.hlWallet.SendManyWaitTxHash(ctx, messages)
	if err != nil {
		return "", fmt.Errorf("send GSTD batch: %w", err)
	}

	txHash = base64.URLEncoding.EncodeToString(hash)
	log.Printf("[Highload] GSTD batch sent: %d transfers, tx=%s", len(transfers), txHash)
	return txHash, nil
}

// GetBalance returns TON balance of the Highload wallet in nano
func (s *HighloadWalletService) GetBalance(ctx context.Context) (nano int64, err error) {
	if !s.initialized || s.hlWallet == nil || s.api == nil {
		return 0, fmt.Errorf("highload wallet not initialized")
	}
	block, err := s.api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return 0, err
	}
	balance, err := s.hlWallet.GetBalance(ctx, block)
	if err != nil {
		return 0, err
	}
	return balance.Nano().Int64(), nil
}

// CheckGasReserveAndAlert checks balance; if < 1 TON, sends Critical Alert to Telegram admin
func (s *HighloadWalletService) CheckGasReserveAndAlert(ctx context.Context) {
	nano, err := s.GetBalance(ctx)
	if err != nil {
		log.Printf("[Highload] Gas reserve check failed: %v", err)
		return
	}
	tonAmount := float64(nano) / 1e9
	if tonAmount < 1.0 && s.telegramAlert != nil {
		msg := fmt.Sprintf("🚨 <b>Critical: Gas Reserve Low</b>\n\nHighload wallet %s has <b>%.4f TON</b>.\nTop up immediately to avoid payout failures.", s.WalletAddress(), tonAmount)
		if err := s.telegramAlert(ctx, msg); err != nil {
			log.Printf("[Highload] Telegram alert failed: %v", err)
		} else {
			log.Printf("[Highload] Critical alert sent: balance %.4f TON", tonAmount)
		}
	}
}

// ParseSeedFromEnv parses seed from env (space or comma separated)
func ParseSeedFromEnv(seedStr string) []string {
	if seedStr == "" {
		return nil
	}
	seedStr = strings.TrimSpace(seedStr)
	parts := strings.FieldsFunc(seedStr, func(r rune) bool {
		return r == ' ' || r == ','
	})
	return parts
}

