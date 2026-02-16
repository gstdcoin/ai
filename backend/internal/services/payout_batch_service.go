package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// PayoutBatchService implements Highload Wallet V2 batching:
// 1 gas transaction serves min 50 workers
// Uses payout_batch_queue; actual transfer requires Highload contract

// PayoutBatchService batches settlement payouts for Highload Wallet V2
type PayoutBatchService struct {
	db *sql.DB
}

// NewPayoutBatchService creates the service
func NewPayoutBatchService(db *sql.DB) *PayoutBatchService {
	return &PayoutBatchService{db: db}
}

// RunBatchCheck collects unpaid settlement entries and queues for batch when >= 50
func (s *PayoutBatchService) RunBatchCheck(ctx context.Context) {
	if s.db == nil {
		return
	}

	// Count unpaid workers in settlement_ledger
	var unpaidCount int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT worker_wallet) FROM settlement_ledger
		WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
	`).Scan(&unpaidCount)
	if err != nil || unpaidCount < 50 {
		return
	}

	// Queue batch for Highload (min 50 workers per tx)
	// In production: use Highload Wallet V2 contract to send 50+ transfers in 1 tx
	// Format: batch of (recipient, amount) pairs; single signed message
	log.Printf("[Payout Batch] %d workers ready for Highload batch (min 50 per tx)", unpaidCount)

	// TODO: Integrate with Highload Wallet V2 contract
	// 1. Fetch unpaid entries, limit 255 (Highload V2 max per tx)
	// 2. Build batch transfer message
	// 3. Sign and send via Highload wallet
	// 4. Update settlement_ledger with payout_tx_id
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
