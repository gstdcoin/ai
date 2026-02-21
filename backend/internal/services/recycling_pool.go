package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// RecyclingPoolService implements the closed-loop token circulation economy.
// Fixed supply of 1 billion GSTD — tokens never leave the system, they recycle:
//
//   User pays GSTD for query → Recycling Pool → Miner earns GSTD for work
//   (minus 2% to Golden Reserve, 5% burned)
//
// The pool ensures:
//   1. All spent tokens return to miner reward pool (93% of payment)
//   2. 2% goes to Golden Reserve (XAUt backing)
//   3. 5% is permanently burned (deflationary)
//   4. Real-time balance tracking for economic health monitoring
type RecyclingPoolService struct {
	db *sql.DB
}

// PoolTransaction represents a single token flow through the recycling pool
type PoolTransaction struct {
	ID              string  `json:"id"`
	FromWallet      string  `json:"from_wallet"`
	TotalAmount     float64 `json:"total_amount"`
	MinerReward     float64 `json:"miner_reward"`     // 93% → recycled to miners
	GoldenReserve   float64 `json:"golden_reserve"`   // 2% → XAUt backing
	BurnedAmount    float64 `json:"burned_amount"`     // 5% → permanently destroyed
	TaskID          string  `json:"task_id"`
	TransactionType string  `json:"transaction_type"` // inference, training, validation
	CreatedAt       time.Time `json:"created_at"`
}

// PoolStats represents the overall recycling pool statistics
type PoolStats struct {
	TotalRecycled     float64 `json:"total_recycled"`     // Total GSTD flowing through pool
	TotalToMiners     float64 `json:"total_to_miners"`    // Total paid out to miners
	TotalToReserve    float64 `json:"total_to_reserve"`   // Total sent to Golden Reserve
	TotalBurned       float64 `json:"total_burned"`       // Total permanently destroyed
	CurrentPoolSize   float64 `json:"current_pool_size"`  // Available for miner rewards
	CirculationRate   float64 `json:"circulation_rate"`   // Tokens/hour flowing
	FixedSupply       float64 `json:"fixed_supply"`       // 1,000,000,000
	EffectiveSupply   float64 `json:"effective_supply"`   // Supply minus burned
}

func NewRecyclingPoolService(db *sql.DB) *RecyclingPoolService {
	svc := &RecyclingPoolService{db: db}
	svc.ensureSchema()
	return svc
}

func (s *RecyclingPoolService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS recycling_pool (
			id BIGSERIAL PRIMARY KEY,
			from_wallet VARCHAR(128),
			total_amount DECIMAL(18,8) DEFAULT 0,
			miner_reward DECIMAL(18,8) DEFAULT 0,
			golden_reserve DECIMAL(18,8) DEFAULT 0,
			burned_amount DECIMAL(18,8) DEFAULT 0,
			task_id VARCHAR(64),
			transaction_type VARCHAR(32),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_recycling_pool_time ON recycling_pool(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_recycling_pool_wallet ON recycling_pool(from_wallet);
		
		-- Pool balance tracking (single row, updated atomically)
		CREATE TABLE IF NOT EXISTS recycling_pool_balance (
			id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
			available_for_miners DECIMAL(18,8) DEFAULT 0,
			total_recycled DECIMAL(18,8) DEFAULT 0,
			total_to_miners DECIMAL(18,8) DEFAULT 0,
			total_to_reserve DECIMAL(18,8) DEFAULT 0,
			total_burned DECIMAL(18,8) DEFAULT 0,
			updated_at TIMESTAMP DEFAULT NOW()
		);
		INSERT INTO recycling_pool_balance (id) VALUES (1) ON CONFLICT DO NOTHING;
	`)
	log.Println("✅ RecyclingPool schema ensured")
}

// ProcessPayment splits a user payment through the recycling pool
// Returns the breakdown of how tokens are distributed
func (s *RecyclingPoolService) ProcessPayment(ctx context.Context, fromWallet string, amount float64, taskID string, txType string) (*PoolTransaction, error) {
	// Calculate distribution (total = 100%) — Burn disabled: 5% → Golden Reserve
	burnRate := 0.0      // Burn disabled (supply low)
	reserveRate := 0.07  // 7% to golden reserve (2% + former 5% burn)
	minerRate := 1.0 - burnRate - reserveRate // 93% to miners

	tx := &PoolTransaction{
		FromWallet:      fromWallet,
		TotalAmount:     amount,
		MinerReward:     amount * minerRate,
		GoldenReserve:   amount * reserveRate,
		BurnedAmount:    0,
		TaskID:          taskID,
		TransactionType: txType,
		CreatedAt:       time.Now(),
	}

	// Record transaction
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO recycling_pool (from_wallet, total_amount, miner_reward, golden_reserve, burned_amount, task_id, transaction_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, tx.FromWallet, tx.TotalAmount, tx.MinerReward, tx.GoldenReserve, tx.BurnedAmount, tx.TaskID, tx.TransactionType)
	if err != nil {
		return nil, err
	}

	// Atomically update pool balance
	_, err = s.db.ExecContext(ctx, `
		UPDATE recycling_pool_balance SET
			available_for_miners = available_for_miners + $1,
			total_recycled = total_recycled + $2,
			total_to_reserve = total_to_reserve + $3,
			total_burned = total_burned + $4,
			updated_at = NOW()
		WHERE id = 1
	`, tx.MinerReward, tx.TotalAmount, tx.GoldenReserve, tx.BurnedAmount)
	if err != nil {
		log.Printf("RecyclingPool: Failed to update balance: %v", err)
	}

	log.Printf("♻️ Recycled %.4f GSTD: %.4f→miners, %.4f→reserve, %.4f→burned",
		amount, tx.MinerReward, tx.GoldenReserve, tx.BurnedAmount)

	return tx, nil
}

// PayMiner deducts from the recycling pool to pay a miner
func (s *RecyclingPoolService) PayMiner(ctx context.Context, minerWallet string, amount float64, taskID string) error {
	// Deduct from pool
	res, err := s.db.ExecContext(ctx, `
		UPDATE recycling_pool_balance SET
			available_for_miners = available_for_miners - $1,
			total_to_miners = total_to_miners + $1,
			updated_at = NOW()
		WHERE id = 1 AND available_for_miners >= $1
	`, amount)
	if err != nil {
		return err
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows // Insufficient pool funds
	}

	// Credit miner's pending balance
	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1
		WHERE wallet_address = $2
	`, amount, minerWallet)

	log.Printf("♻️ Paid miner %s: %.4f GSTD from recycling pool (task: %s)", minerWallet, amount, taskID)
	return err
}

// GetPoolStats returns current recycling pool statistics
func (s *RecyclingPoolService) GetPoolStats(ctx context.Context) (*PoolStats, error) {
	stats := &PoolStats{
		FixedSupply: 1_000_000_000,
	}

	err := s.db.QueryRowContext(ctx, `
		SELECT available_for_miners, total_recycled, total_to_miners, total_to_reserve, total_burned
		FROM recycling_pool_balance WHERE id = 1
	`).Scan(&stats.CurrentPoolSize, &stats.TotalRecycled, &stats.TotalToMiners, &stats.TotalToReserve, &stats.TotalBurned)
	if err != nil {
		return stats, nil // Return defaults
	}

	stats.EffectiveSupply = stats.FixedSupply - stats.TotalBurned

	// Calculate circulation rate (tokens recycled per hour, last 24h)
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(total_amount), 0) / 24.0 FROM recycling_pool
		WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&stats.CirculationRate)

	return stats, nil
}
