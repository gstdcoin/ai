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
	"github.com/xssnick/tonutils-go/ton/wallet"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

// BatchTransfer represents a single transfer in a batch
type BatchTransfer struct {
	RecipientAddr string
	AmountNano    int64
	Comment       string
}

// HighloadWalletService implements SignAndBroadcastBatch for Wallet V2/V3
// Uses tonutils-go with Liteserver; 1 gas tx serves 50+ workers
type HighloadWalletService struct {
	hlWallet    *wallet.Wallet
	configURL   string
	initialized bool
	mu          sync.Mutex
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
