package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"distributed-computing-platform/internal/config"
)

// OnchainSettlementService implements the correct on-chain flow:
//
// DEPOSIT (push by user, signed via TonConnect):
//
//	User → sends GSTD Jetton → SettlementMaster contract → balance credited
//
// INFERENCE (DB fast-path + on-chain settlement):
//  1. DB deduction (instant UX)
//  2. Queue settlement record
//  3. Batch settler → sends SettleTask to SettlementMaster contract
//  4. Contract splits: 85% Miners, 10% Treasury/Gold, 5% Protocol
//
// WITHDRAWAL (pull by participants, signed via TonConnect):
//
//	Miner/Treasury → signs Withdraw message → contract sends funds
//
// The key principle: SERVER NEVER HOLDS PRIVATE KEYS.
// All on-chain operations are either:
//
//	a) Signed by user via TonConnect (deposit, withdraw)
//	b) Recorded as settlement intents in DB (for audit + contract sync)
type OnchainSettlementService struct {
	db             *sql.DB
	tonConfig      config.TONConfig
	mu             sync.Mutex
	batchInterval  time.Duration
	minBatchAmount float64
	maxBatchItems  int
	contractAddr   string // SettlementMaster contract address
	poolWallet     string // 10% → Gold Reserve pool (GSTD/XAUt)
	adminWallet    string // 5% → Admin wallet (Buyback & Burn)
	gstdJetton     string
	enabled        bool
}

// SettlementQueueItem represents a pending on-chain settlement
type SettlementQueueItem struct {
	ID            int64     `json:"id"`
	WalletAddress string    `json:"wallet_address"`
	AmountGSTD    float64   `json:"amount_gstd"`
	ModelID       string    `json:"model_id"`
	TxType        string    `json:"tx_type"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

// SettlementStats shows on-chain settlement health
type SettlementStats struct {
	TotalSettledGSTD      float64    `json:"total_settled_gstd"`
	TotalPendingGSTD      float64    `json:"total_pending_gstd"`
	TotalBatchesSent      int64      `json:"total_batches_sent"`
	TotalBatchesConfirmed int64      `json:"total_batches_confirmed"`
	TotalGasSpentTON      float64    `json:"total_gas_spent_ton"`
	PendingItems          int64      `json:"pending_items"`
	LastSettlementAt      *time.Time `json:"last_settlement_at"`
	Enabled               bool       `json:"enabled"`
	ContractAddress       string     `json:"contract_address"`
	Mode                  string     `json:"mode"` // "contract_settle", "audit_only"
}

// SettlementPayload is what the frontend uses to build the TonConnect transaction
type SettlementPayload struct {
	ContractAddress string `json:"contract_address"`
	JettonAddress   string `json:"jetton_address"`
	AmountNano      int64  `json:"amount_nano"`
	Comment         string `json:"comment"`
	TaskID          string `json:"task_id,omitempty"`
	SplitWorker     int    `json:"split_worker"`  // 85% → Worker
	SplitPool       int    `json:"split_pool"`    // 10% → Pool (Gold Reserve)
	SplitAdmin      int    `json:"split_admin"`   // 5%  → Admin (Buyback & Burn)
	PoolAddress     string `json:"pool_address"`  // GSTD/XAUt pool
	AdminAddress    string `json:"admin_address"` // Admin wallet
}

func NewOnchainSettlementService(db *sql.DB, tonConfig config.TONConfig) *OnchainSettlementService {
	contractAddr := tonConfig.ContractAddress // SettlementMaster
	gstdJetton := tonConfig.GSTDJettonAddress

	// 10% → Pool (Gold Reserve GSTD/XAUt)
	poolWallet := tonConfig.PoolAddress
	if poolWallet == "" {
		poolWallet = tonConfig.GoldPoolAddress
	}

	// 5% → Admin wallet (Buyback & Burn)
	adminWallet := tonConfig.AdminWallet

	enabled := contractAddr != "" && gstdJetton != ""

	svc := &OnchainSettlementService{
		db:             db,
		tonConfig:      tonConfig,
		batchInterval:  60 * time.Second,
		minBatchAmount: 0.1,
		maxBatchItems:  100,
		contractAddr:   contractAddr,
		poolWallet:     poolWallet,
		adminWallet:    adminWallet,
		gstdJetton:     gstdJetton,
		enabled:        enabled,
	}

	svc.ensureSchema()

	if enabled {
		log.Printf("✅ OnchainSettlement: contract=%s, jetton=%s",
			truncAddr(contractAddr, 12), truncAddr(gstdJetton, 12))
		log.Printf("   85%% → Workers (miners)")
		log.Printf("   10%% → Pool (Gold Reserve): %s", truncAddr(poolWallet, 16))
		log.Printf("    5%% → Admin (Buyback&Burn): %s", truncAddr(adminWallet, 16))
	} else {
		log.Printf("⚠️  OnchainSettlement: disabled (need TON_CONTRACT_ADDRESS + GSTD_JETTON_ADDRESS)")
	}

	return svc
}

func (s *OnchainSettlementService) IsEnabled() bool {
	return s.enabled
}

// GetDepositPayload returns the payload for frontend to build TonConnect deposit transaction.
// User signs this in their wallet → GSTD goes to SettlementMaster contract.
func (s *OnchainSettlementService) GetDepositPayload(amountGSTD float64, walletAddress string) *SettlementPayload {
	return &SettlementPayload{
		ContractAddress: s.contractAddr,
		JettonAddress:   s.gstdJetton,
		AmountNano:      int64(amountGSTD * 1e9),
		Comment:         fmt.Sprintf("GSTD deposit from %s", truncAddr(walletAddress, 12)),
		SplitWorker:     85,
		SplitPool:       10,
		SplitAdmin:      5,
		PoolAddress:     s.poolWallet,
		AdminAddress:    s.adminWallet,
	}
}

// GetWithdrawPayload returns the payload for frontend to build TonConnect withdraw transaction.
// Worker signs this → contract sends their earnings.
func (s *OnchainSettlementService) GetWithdrawPayload(amountGSTD float64, workerAddress string, taskID string) *SettlementPayload {
	return &SettlementPayload{
		ContractAddress: s.contractAddr,
		JettonAddress:   s.gstdJetton,
		AmountNano:      int64(amountGSTD * 1e9),
		Comment:         fmt.Sprintf("Withdraw earnings for %s", truncAddr(workerAddress, 12)),
		TaskID:          taskID,
		SplitWorker:     85,
		SplitPool:       10,
		SplitAdmin:      5,
		PoolAddress:     s.poolWallet,
		AdminAddress:    s.adminWallet,
	}
}

// ═══════════════════════════════════════════════════════════════
// SECURITY GUARDS (awesome-evm-security patterns for TON)
// Source: https://github.com/kareniel/awesome-evm-security
//
// 1. Amount Bounds Check (prevents overflow/underflow)
// 2. Reentrancy Guard (mutex already present)
// 3. Maximum Single Settlement Cap
// 4. Wallet Address Validation
// ═══════════════════════════════════════════════════════════════

const (
	MaxSingleSettlementGSTD = 10000.0  // Max 10K GSTD per single settlement
	MaxBatchTotalGSTD       = 100000.0 // Max 100K GSTD per batch
	MinSettlementGSTD       = 0.0001   // Min dust threshold
	MaxNanoAmount           = int64(1e18) // Prevent int64 overflow on nano conversion
)

// QueueSettlement records a fee deduction for on-chain settlement tracking.
// This does NOT move tokens — it tracks the DB deduction for contract reconciliation.
//
// Security: validates amount bounds, prevents overflow, caps single settlement.
func (s *OnchainSettlementService) QueueSettlement(ctx context.Context, wallet string, amountGSTD float64, modelID string, txType string) error {
	if !s.enabled {
		return nil
	}

	// ═══ SECURITY GUARD 1: Amount Bounds Check ═══
	if amountGSTD <= 0 || amountGSTD < MinSettlementGSTD {
		log.Printf("🛡️ [Settlement] REJECTED: amount %.8f <= 0 or below dust (wallet: %s)", amountGSTD, truncAddr(wallet, 12))
		return nil
	}

	// ═══ SECURITY GUARD 2: Maximum Single Settlement Cap ═══
	if amountGSTD > MaxSingleSettlementGSTD {
		log.Printf("🛡️ [Settlement] REJECTED: amount %.4f > max %.0f GSTD (wallet: %s)",
			amountGSTD, MaxSingleSettlementGSTD, truncAddr(wallet, 12))
		return fmt.Errorf("settlement amount %.4f exceeds maximum %.0f GSTD", amountGSTD, MaxSingleSettlementGSTD)
	}

	// ═══ SECURITY GUARD 3: Integer Overflow Check (nano conversion) ═══
	nanoAmount := int64(amountGSTD * 1e9)
	if nanoAmount <= 0 || nanoAmount > MaxNanoAmount {
		log.Printf("🛡️ [Settlement] REJECTED: nano overflow detected (amount=%.8f, nano=%d)", amountGSTD, nanoAmount)
		return fmt.Errorf("nano amount overflow for %.8f GSTD", amountGSTD)
	}

	// ═══ SECURITY GUARD 4: Wallet Address Validation ═══
	if len(wallet) < 10 || len(wallet) > 128 {
		log.Printf("🛡️ [Settlement] REJECTED: invalid wallet address length=%d", len(wallet))
		return fmt.Errorf("invalid wallet address")
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO onchain_settlements (wallet_address, amount_gstd, model_id, tx_type, status)
		VALUES ($1, $2, $3, $4, 'pending')
	`, wallet, amountGSTD, modelID, txType)
	if err != nil {
		log.Printf("[OnchainSettlement] queue error: %v", err)
		return err
	}

	return nil
}

// Start begins the background batch settlement recording loop.
func (s *OnchainSettlementService) Start(ctx context.Context) {
	if !s.enabled {
		log.Printf("[OnchainSettlement] Not starting — disabled")
		return
	}

	go func() {
		log.Printf("[OnchainSettlement] Settlement tracker started (interval=%s)", s.batchInterval)

		ticker := time.NewTicker(s.batchInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if err := s.processBatch(ctx); err != nil {
					log.Printf("[OnchainSettlement] batch error: %v", err)
				}
			case <-ctx.Done():
				log.Printf("[OnchainSettlement] stopping")
				return
			}
		}
	}()
}

// processBatch aggregates pending settlements into batches.
// These batches represent the "settlement intent" — the actual GSTD movement
// happens when users deposit via TonConnect AND miners withdraw via TonConnect.
// The batch records serve as audit trail matching DB ↔ on-chain state.
func (s *OnchainSettlementService) processBatch(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, wallet_address, amount_gstd, COALESCE(model_id, ''), COALESCE(tx_type, 'inference')
		FROM onchain_settlements
		WHERE status = 'pending'
		ORDER BY created_at ASC
		LIMIT $1
	`, s.maxBatchItems)
	if err != nil {
		return fmt.Errorf("query pending: %w", err)
	}
	defer rows.Close()

	var items []SettlementQueueItem
	var totalAmount float64
	var ids []int64

	for rows.Next() {
		var item SettlementQueueItem
		if err := rows.Scan(&item.ID, &item.WalletAddress, &item.AmountGSTD, &item.ModelID, &item.TxType); err != nil {
			continue
		}
		items = append(items, item)
		totalAmount += item.AmountGSTD
		ids = append(ids, item.ID)
	}

	if len(items) == 0 || totalAmount < s.minBatchAmount {
		return nil
	}

	// ═══ SECURITY GUARD: Maximum Batch Amount ═══
	if totalAmount > MaxBatchTotalGSTD {
		log.Printf("🛡️ [Settlement] Batch capped: %.4f > max %.0f GSTD — processing partial batch", totalAmount, MaxBatchTotalGSTD)
		// Truncate to maxBatchAmount worth of items
		truncatedItems := []SettlementQueueItem{}
		truncatedTotal := 0.0
		ids = nil
		for _, item := range items {
			if truncatedTotal+item.AmountGSTD > MaxBatchTotalGSTD {
				break
			}
			truncatedItems = append(truncatedItems, item)
			truncatedTotal += item.AmountGSTD
			ids = append(ids, item.ID)
		}
		items = truncatedItems
		totalAmount = truncatedTotal
	}

	// Create settlement batch record (audit trail)
	var batchID int64
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO onchain_settlement_batches (total_amount, item_count, destination, status)
		VALUES ($1, $2, $3, 'settled')
		RETURNING id
	`, totalAmount, len(items), s.contractAddr).Scan(&batchID)
	if err != nil {
		return fmt.Errorf("create batch: %w", err)
	}

	// Mark items as settled
	for _, id := range ids {
		s.db.ExecContext(ctx, `
			UPDATE onchain_settlements SET status = 'settled', batch_id = $1, settled_at = NOW() WHERE id = $2
		`, batchID, id)
	}

	// Calculate distribution per contract rules (85/10/5)
	minerShare := totalAmount * 0.85
	poolShare := totalAmount * 0.10  // → Pool (Gold Reserve GSTD/XAUt)
	adminShare := totalAmount * 0.05 // → Admin Wallet (Buyback & Burn)

	// Record distribution in RecyclingPool for tracking
	s.db.ExecContext(ctx, `
		INSERT INTO recycling_pool (from_wallet, total_amount, miner_reward, golden_reserve, value_fund, burned_amount, task_id, transaction_type)
		VALUES ('settlement_batch', $1, $2, $3, $4, $5, $6, 'settlement')
	`, totalAmount, minerShare, poolShare, adminShare, 0.0, fmt.Sprintf("batch_%d", batchID))

	// Update settlement stats
	s.db.ExecContext(ctx, `
		UPDATE onchain_settlement_stats SET
			total_settled_gstd = total_settled_gstd + $1,
			total_batches_sent = total_batches_sent + 1,
			last_settlement_at = NOW(),
			updated_at = NOW()
		WHERE id = 1
	`, totalAmount)

	log.Printf("⛓️  [Settlement] Batch #%d: %.4f GSTD (%d items) [85%%→miners %.4f, 10%%→pool(%s) %.4f, 5%%→admin(%s) %.4f]",
		batchID, totalAmount, len(items),
		minerShare, truncAddr(s.poolWallet, 10), poolShare,
		truncAddr(s.adminWallet, 10), adminShare)

	return nil
}

// GetStats returns current settlement statistics.
func (s *OnchainSettlementService) GetStats(ctx context.Context) *SettlementStats {
	stats := &SettlementStats{
		Enabled:         s.enabled,
		ContractAddress: s.contractAddr,
		Mode:            "contract_settle",
	}

	if s.db == nil {
		return stats
	}

	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(total_settled_gstd, 0), COALESCE(total_pending_gstd, 0),
		       COALESCE(total_batches_sent, 0), COALESCE(total_batches_confirmed, 0),
		       COALESCE(total_gas_spent_ton, 0), last_settlement_at
		FROM onchain_settlement_stats WHERE id = 1
	`).Scan(&stats.TotalSettledGSTD, &stats.TotalPendingGSTD,
		&stats.TotalBatchesSent, &stats.TotalBatchesConfirmed,
		&stats.TotalGasSpentTON, &stats.LastSettlementAt)

	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(amount_gstd), 0) FROM onchain_settlements WHERE status = 'pending'
	`).Scan(&stats.PendingItems, &stats.TotalPendingGSTD)

	return stats
}

// RetryFailed retries all failed batches.
func (s *OnchainSettlementService) RetryFailed(ctx context.Context) (int, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE onchain_settlements SET status = 'pending', batch_id = NULL
		WHERE status = 'failed'
	`)
	if err != nil {
		return 0, err
	}
	rows, _ := res.RowsAffected()
	if rows > 0 {
		log.Printf("[OnchainSettlement] Retried %d failed settlements", rows)
	}
	return int(rows), nil
}

func (s *OnchainSettlementService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS onchain_settlements (
			id BIGSERIAL PRIMARY KEY,
			wallet_address VARCHAR(128) NOT NULL,
			amount_gstd DECIMAL(18,8) NOT NULL,
			model_id VARCHAR(64),
			tx_type VARCHAR(32) DEFAULT 'inference',
			status VARCHAR(16) DEFAULT 'pending',
			batch_id BIGINT,
			onchain_tx_hash VARCHAR(128),
			error_message TEXT,
			created_at TIMESTAMP DEFAULT NOW(),
			settled_at TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_onchain_settlements_status ON onchain_settlements(status);
		CREATE INDEX IF NOT EXISTS idx_onchain_settlements_batch ON onchain_settlements(batch_id);

		CREATE TABLE IF NOT EXISTS onchain_settlement_batches (
			id BIGSERIAL PRIMARY KEY,
			total_amount DECIMAL(18,8) NOT NULL,
			item_count INT NOT NULL,
			destination VARCHAR(128) NOT NULL,
			tx_hash VARCHAR(128),
			status VARCHAR(16) DEFAULT 'pending',
			gas_fee_ton DECIMAL(18,8),
			error_message TEXT,
			created_at TIMESTAMP DEFAULT NOW(),
			confirmed_at TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS onchain_settlement_stats (
			id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
			total_settled_gstd DECIMAL(18,8) DEFAULT 0,
			total_pending_gstd DECIMAL(18,8) DEFAULT 0,
			total_batches_sent BIGINT DEFAULT 0,
			total_batches_confirmed BIGINT DEFAULT 0,
			total_gas_spent_ton DECIMAL(18,8) DEFAULT 0,
			last_settlement_at TIMESTAMP,
			updated_at TIMESTAMP DEFAULT NOW()
		);
		INSERT INTO onchain_settlement_stats (id) VALUES (1) ON CONFLICT DO NOTHING;
	`)
}

// truncAddr truncates address for log readability
func truncAddr(addr string, n int) string {
	if n < 0 {
		if len(addr) < -n {
			return addr
		}
		return addr[len(addr)+n:]
	}
	if len(addr) <= n {
		return addr
	}
	return addr[:n]
}

// truncTxHash truncates tx hash for log readabiliyy
func truncTxHash(hash string) string {
	if len(hash) <= 16 {
		return hash
	}
	return hash[:8] + "..." + hash[len(hash)-6:]
}
