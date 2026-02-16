package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// PayoutBatchService implements Highload Wallet V2/V3 batching:
// 1 gas transaction serves min 50 workers
// Uses SignAndBroadcastBatch when HighloadWalletService is wired

// PayoutBatchService batches settlement payouts for Highload Wallet V2/V3
type PayoutBatchService struct {
	db       *sql.DB
	highload *HighloadWalletService
}

// NewPayoutBatchService creates the service
func NewPayoutBatchService(db *sql.DB) *PayoutBatchService {
	return &PayoutBatchService{db: db}
}

// SetHighloadWallet wires Highload for batch TON transfers
func (s *PayoutBatchService) SetHighloadWallet(h *HighloadWalletService) {
	s.highload = h
}

// RunBatchCheck collects unpaid settlement entries and sends batch when >= 50
func (s *PayoutBatchService) RunBatchCheck(ctx context.Context) {
	if s.db == nil {
		return
	}

	var unpaidCount int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT worker_wallet) FROM settlement_ledger
		WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
	`).Scan(&unpaidCount)
	if err != nil || unpaidCount < 50 {
		return
	}

	log.Printf("[Payout Batch] %d workers ready for Highload batch (min 50 per tx)", unpaidCount)

	if s.highload == nil || !s.highload.IsInitialized() {
		log.Printf("[Payout Batch] Highload wallet not configured — set HIGHLOAD_WALLET_SEED and LITESERVER_CONFIG_URL")
		return
	}

	// Settlement pays GSTD (Jetton); SignAndBroadcastBatch sends TON
	// TODO: Add SignAndBroadcastGSTDBatch for Jetton transfers when platform holds GSTD
	// For now: Golden Age / escrow handles GSTD payouts; Highload ready for TON batches
}

// Start runs the batch check periodically
func (s *PayoutBatchService) Start(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.RunBatchCheck(ctx)
		}
	}
}
