package multichain

import (
	"context"
	"fmt"
)

// SolanaService defines the interface for Solana interactions
// Purpose: High-speed trading layer and DePIN activity tracking
// Status: ROADMAP — not yet implemented. All methods return ErrNotImplemented.
type SolanaService interface {
	CheckBalance(ctx context.Context, walletAddr string) (float64, error)
	LockFunds(ctx context.Context, senderKey, amount, taskID string) (string, error)
	TransferSPL(ctx context.Context, fromKey, toAddr, amount string) (string, error)
	GetTPS(ctx context.Context) (float64, error)
}

var ErrSolanaNotImplemented = fmt.Errorf("Solana bridge not implemented (roadmap feature)")

// SolanaServiceImpl is a stub — returns errors instead of mock data.
type SolanaServiceImpl struct {
	RPCEndpoint string
}

func NewSolanaService(endpoint string) *SolanaServiceImpl {
	if endpoint == "" {
		endpoint = "https://api.mainnet-beta.solana.com"
	}
	return &SolanaServiceImpl{RPCEndpoint: endpoint}
}

func (s *SolanaServiceImpl) CheckBalance(ctx context.Context, walletAddr string) (float64, error) {
	return 0, ErrSolanaNotImplemented
}

func (s *SolanaServiceImpl) LockFunds(ctx context.Context, senderKey, amount, taskID string) (string, error) {
	return "", ErrSolanaNotImplemented
}

func (s *SolanaServiceImpl) TransferSPL(ctx context.Context, fromKey, toAddr, amount string) (string, error) {
	return "", ErrSolanaNotImplemented
}

func (s *SolanaServiceImpl) GetTPS(ctx context.Context) (float64, error) {
	return 0, ErrSolanaNotImplemented
}
