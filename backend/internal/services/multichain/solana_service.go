package multichain

import (
	"context"
	"fmt"
	"strconv"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/programs/token"
	"github.com/gagliardetto/solana-go/rpc"
)

// SolanaService defines the interface for Solana interactions
type SolanaService interface {
	CheckBalance(ctx context.Context, walletAddr string) (float64, error)
	LockFunds(ctx context.Context, senderKey, amount, taskID string) (string, error)
	TransferSPL(ctx context.Context, fromKey, toAddr, amount string) (string, error)
	GetTPS(ctx context.Context) (float64, error)
}

// SolanaServiceImpl implements real interactions with Solana Mainnet
type SolanaServiceImpl struct {
	client *rpc.Client
}

func NewSolanaService(endpoint string) *SolanaServiceImpl {
	if endpoint == "" {
		endpoint = rpc.MainNetBeta_RPC
	}
	return &SolanaServiceImpl{
		client: rpc.New(endpoint),
	}
}

// CheckBalance checks the native SOL balance
func (s *SolanaServiceImpl) CheckBalance(ctx context.Context, walletAddr string) (float64, error) {
	pubKey, err := solana.PublicKeyFromBase58(walletAddr)
	if err != nil {
		return 0, fmt.Errorf("invalid solana address: %w", err)
	}

	balance, err := s.client.GetBalance(ctx, pubKey, rpc.CommitmentFinalized)
	if err != nil {
		return 0, fmt.Errorf("failed to get balance: %w", err)
	}

	// 1 SOL = 1_000_000_000 lamports
	solBalance := float64(balance.Value) / 1e9
	return solBalance, nil
}

// LockFunds locks native SOL by transferring to a bridge vault. Note: this is a mock representation
// of interacting with a bridge contract or vault directly
func (s *SolanaServiceImpl) LockFunds(ctx context.Context, senderKey, amountStr, taskID string) (string, error) {
	// Parse amount
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %w", err)
	}
	lamports := uint64(amount * 1e9)

	sender, err := solana.PrivateKeyFromBase58(senderKey)
	if err != nil {
		return "", fmt.Errorf("invalid base58 private key: %w", err)
	}

	vaultAddr := solana.MustPublicKeyFromBase58("GstdBridgeRouter11111111111111111111111111111")

	recent, err := s.client.GetRecentBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return "", fmt.Errorf("failed to get blockhash: %w", err)
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{
			system.NewTransferInstruction(
				lamports,
				sender.PublicKey(),
				vaultAddr,
			).Build(),
		},
		recent.Value.Blockhash,
		solana.TransactionPayer(sender.PublicKey()),
	)
	if err != nil {
		return "", err
	}

	if _, err := tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if sender.PublicKey().Equals(key) {
			return &sender
		}
		return nil
	}); err != nil {
		return "", fmt.Errorf("sign failed: %w", err)
	}

	sig, err := s.client.SendTransaction(ctx, tx)
	if err != nil {
		return "", fmt.Errorf("send tx failed: %w", err)
	}

	return sig.String(), nil
}

// TransferSPL transfers SPL tokens (e.g., GSTD on Solana or USDC)
func (s *SolanaServiceImpl) TransferSPL(ctx context.Context, fromKey, toAddr, amountStr string) (string, error) {
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %w", err)
	}
	splAmount := uint64(amount * 1e9) // assuming 9 decimals

	sender, err := solana.PrivateKeyFromBase58(fromKey)
	if err != nil {
		return "", fmt.Errorf("invalid private key: %w", err)
	}

	toPub, err := solana.PublicKeyFromBase58(toAddr)
	if err != nil {
		return "", fmt.Errorf("invalid destination address: %w", err)
	}

	// Assuming a well-known GSTD token mint on Solana for bridge functionality
	mintPub := solana.MustPublicKeyFromBase58("GSTDmint1111111111111111111111111111111111")

	// Get associated token accounts (ATA)
	fromATA, _, err := solana.FindAssociatedTokenAddress(sender.PublicKey(), mintPub)
	if err != nil {
		return "", err
	}
	toATA, _, err := solana.FindAssociatedTokenAddress(toPub, mintPub)
	if err != nil {
		return "", err
	}

	recent, err := s.client.GetRecentBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return "", fmt.Errorf("failed to get blockhash: %w", err)
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{
			token.NewTransferInstruction(
				splAmount,
				fromATA,
				toATA,
				sender.PublicKey(),
				[]solana.PublicKey{},
			).Build(),
		},
		recent.Value.Blockhash,
		solana.TransactionPayer(sender.PublicKey()),
	)
	if err != nil {
		return "", err
	}

	if _, err := tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if sender.PublicKey().Equals(key) {
			return &sender
		}
		return nil
	}); err != nil {
		return "", fmt.Errorf("sign failed: %w", err)
	}

	sig, err := s.client.SendTransactionWithOpts(ctx, tx, rpc.TransactionOpts{
		SkipPreflight:       false,
		PreflightCommitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		return "", fmt.Errorf("send tx failed: %w", err)
	}

	return sig.String(), nil
}

// GetTPS calculates current Solana TPS using recent performance samples
func (s *SolanaServiceImpl) GetTPS(ctx context.Context) (float64, error) {
	samples, err := s.client.GetRecentPerformanceSamples(ctx, nil)
	if err != nil || len(samples) == 0 {
		return 0, fmt.Errorf("failed to get performance samples: %v", err)
	}

	// Calculate TPS for the most recent sample window
	sample := samples[0]
	if sample.SamplePeriodSecs == 0 {
		return 0, fmt.Errorf("invalid sample period")
	}

	tps := float64(sample.NumTransactions) / float64(sample.SamplePeriodSecs)
	return tps, nil
}
