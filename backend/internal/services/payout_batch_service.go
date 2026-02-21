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
	db               *sql.DB
	highload         *HighloadWalletService
	gstdJettonMaster string
}

// NewPayoutBatchService creates the service
func NewPayoutBatchService(db *sql.DB) *PayoutBatchService {
	return &PayoutBatchService{db: db}
}

// SetHighloadWallet wires Highload for batch transfers
func (s *PayoutBatchService) SetHighloadWallet(h *HighloadWalletService) {
	s.highload = h
}

// SetGSTDJettonMaster sets the GSTD jetton master address for Jetton batch payouts
func (s *PayoutBatchService) SetGSTDJettonMaster(addr string) {
	s.gstdJettonMaster = addr
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
	if s.gstdJettonMaster == "" {
		log.Printf("[Payout Batch] GSTD jetton master not configured — set GSTD_JETTON_ADDRESS")
		return
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT worker_wallet, SUM(worker_amount)::float8 as total
		FROM settlement_ledger
		WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
		GROUP BY worker_wallet
		LIMIT 255
	`)
	if err != nil {
		log.Printf("[Payout Batch] query error: %v", err)
		return
	}
	defer rows.Close()

	var transfers []GSTDBatchTransfer
	for rows.Next() {
		var wallet string
		var amountGSTD float64
		if err := rows.Scan(&wallet, &amountGSTD); err != nil {
			continue
		}
		amountNano := int64(amountGSTD * 1e9)
		if amountNano <= 0 {
			continue
		}
		transfers = append(transfers, GSTDBatchTransfer{RecipientAddr: wallet, AmountNano: amountNano})
	}
	if len(transfers) < 50 {
		return
	}

	txHash, err := s.highload.SignAndBroadcastGSTDBatch(ctx, s.gstdJettonMaster, transfers)
	if err != nil {
		log.Printf("[Payout Batch] GSTD batch send error: %v", err)
		return
	}

	// Mark as paid
	_, _ = s.db.ExecContext(ctx, `
		UPDATE settlement_ledger SET paid_at = NOW(), payout_wave_id = $1
		WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
	`, txHash)
	log.Printf("[Payout Batch] GSTD batch sent: tx=%s (%d workers)", txHash, len(transfers))
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
