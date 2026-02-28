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
//	User pays GSTD for query → Recycling Pool:
//	85% → Miner rewards (network support)
//	 7% → Golden Reserve (XAUt backing)
//	 5% → Value Fund (free query subsidy → growth flywheel)
//	 3% → Burn (deflationary pressure)
//
// Value Fund flywheel: paid queries fund free queries → more users → more paid queries
type RecyclingPoolService struct {
	db *sql.DB
}

// PoolTransaction represents a single token flow through the recycling pool
type PoolTransaction struct {
	ID              string    `json:"id"`
	FromWallet      string    `json:"from_wallet"`
	TotalAmount     float64   `json:"total_amount"`
	MinerReward     float64   `json:"miner_reward"`   // 85% → recycled to miners
	GoldenReserve   float64   `json:"golden_reserve"` // 7%  → XAUt backing
	ValueFund       float64   `json:"value_fund"`     // 5%  → free query subsidy fund
	BurnedAmount    float64   `json:"burned_amount"`  // 3%  → permanently destroyed
	TaskID          string    `json:"task_id"`
	TransactionType string    `json:"transaction_type"` // inference, training, validation
	CreatedAt       time.Time `json:"created_at"`
}

// PoolStats represents the overall recycling pool statistics
type PoolStats struct {
	TotalRecycled     float64 `json:"total_recycled"`      // Total GSTD flowing through pool
	TotalToMiners     float64 `json:"total_to_miners"`     // Total paid out to miners
	TotalToReserve    float64 `json:"total_to_reserve"`    // Total sent to Golden Reserve
	TotalToValueFund  float64 `json:"total_to_value_fund"` // Total sent to Value Fund
	TotalBurned       float64 `json:"total_burned"`        // Total permanently destroyed
	CurrentPoolSize   float64 `json:"current_pool_size"`   // Available for miner rewards
	ValueFundBalance  float64 `json:"value_fund_balance"`  // Available for free query subsidy
	CirculationRate   float64 `json:"circulation_rate"`    // Tokens/hour flowing
	FreeQueriesFunded int64   `json:"free_queries_funded"` // Total free queries subsidized
	FixedSupply       float64 `json:"fixed_supply"`        // 1,000,000,000
	EffectiveSupply   float64 `json:"effective_supply"`    // Supply minus burned
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
			value_fund DECIMAL(18,8) DEFAULT 0,
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
			total_to_value_fund DECIMAL(18,8) DEFAULT 0,
			value_fund_balance DECIMAL(18,8) DEFAULT 0,
			free_queries_funded BIGINT DEFAULT 0,
			total_burned DECIMAL(18,8) DEFAULT 0,
			updated_at TIMESTAMP DEFAULT NOW()
		);
		INSERT INTO recycling_pool_balance (id) VALUES (1) ON CONFLICT DO NOTHING;
	`)
	// Add columns if they don't exist (idempotent migration)
	s.db.Exec(`ALTER TABLE recycling_pool ADD COLUMN IF NOT EXISTS value_fund DECIMAL(18,8) DEFAULT 0`)
	s.db.Exec(`ALTER TABLE recycling_pool_balance ADD COLUMN IF NOT EXISTS total_to_value_fund DECIMAL(18,8) DEFAULT 0`)
	s.db.Exec(`ALTER TABLE recycling_pool_balance ADD COLUMN IF NOT EXISTS value_fund_balance DECIMAL(18,8) DEFAULT 0`)
	s.db.Exec(`ALTER TABLE recycling_pool_balance ADD COLUMN IF NOT EXISTS free_queries_funded BIGINT DEFAULT 0`)
	log.Println("✅ RecyclingPool schema ensured (Value Fund enabled)")
}

// ProcessPayment splits a user payment through the recycling pool.
// Returns the breakdown of how tokens are distributed.
// Distribution: 85% miners, 7% golden reserve, 5% value fund, 3% burn.
func (s *RecyclingPoolService) ProcessPayment(ctx context.Context, fromWallet string, amount float64, taskID string, txType string) (*PoolTransaction, error) {
	// Distribution rates (total = 100%)
	minerRate := 0.85     // 85% → network support (miners/nodes)
	reserveRate := 0.07   // 7%  → Golden Reserve (XAUt backing)
	valueFundRate := 0.05 // 5% → Value Fund (free query subsidy flywheel)
	burnRate := 0.03      // 3%  → burn (deflationary pressure)

	tx := &PoolTransaction{
		FromWallet:      fromWallet,
		TotalAmount:     amount,
		MinerReward:     amount * minerRate,
		GoldenReserve:   amount * reserveRate,
		ValueFund:       amount * valueFundRate,
		BurnedAmount:    amount * burnRate,
		TaskID:          taskID,
		TransactionType: txType,
		CreatedAt:       time.Now(),
	}

	// Record transaction
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO recycling_pool (from_wallet, total_amount, miner_reward, golden_reserve, value_fund, burned_amount, task_id, transaction_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, tx.FromWallet, tx.TotalAmount, tx.MinerReward, tx.GoldenReserve, tx.ValueFund, tx.BurnedAmount, tx.TaskID, tx.TransactionType)
	if err != nil {
		return nil, err
	}

	// Atomically update pool balance
	_, err = s.db.ExecContext(ctx, `
		UPDATE recycling_pool_balance SET
			available_for_miners = available_for_miners + $1,
			total_recycled = total_recycled + $2,
			total_to_reserve = total_to_reserve + $3,
			total_to_value_fund = total_to_value_fund + $4,
			value_fund_balance = value_fund_balance + $4,
			total_burned = total_burned + $5,
			updated_at = NOW()
		WHERE id = 1
	`, tx.MinerReward, tx.TotalAmount, tx.GoldenReserve, tx.ValueFund, tx.BurnedAmount)
	if err != nil {
		log.Printf("RecyclingPool: Failed to update balance: %v", err)
	}

	log.Printf("♻️ Recycled %.4f GSTD: %.4f→miners, %.4f→reserve, %.4f→valueFund, %.4f→burned",
		amount, tx.MinerReward, tx.GoldenReserve, tx.ValueFund, tx.BurnedAmount)

	return tx, nil
}

// SubsidizeFreeQuery uses Value Fund to cover compute cost for a free-tier query.
// Returns true if subsidy was granted (fund has balance), false if fund depleted.
func (s *RecyclingPoolService) SubsidizeFreeQuery(ctx context.Context, computeCost float64, model string) bool {
	if s.db == nil || computeCost <= 0 {
		return false
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE recycling_pool_balance SET
			value_fund_balance = value_fund_balance - $1,
			available_for_miners = available_for_miners + $1,
			free_queries_funded = free_queries_funded + 1,
			updated_at = NOW()
		WHERE id = 1 AND value_fund_balance >= $1
	`, computeCost)
	if err != nil {
		log.Printf("ValueFund: subsidy error: %v", err)
		return false
	}
	rows, _ := res.RowsAffected()
	if rows > 0 {
		log.Printf("💎 ValueFund: subsidized %.4f GSTD for free %s query → miners", computeCost, model)
		return true
	}
	return false // Fund depleted
}

// GetValueFundBalance returns the current balance available for free query subsidies.
func (s *RecyclingPoolService) GetValueFundBalance(ctx context.Context) (balance float64, funded int64) {
	if s.db == nil {
		return 0, 0
	}
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(value_fund_balance, 0), COALESCE(free_queries_funded, 0)
		FROM recycling_pool_balance WHERE id = 1
	`).Scan(&balance, &funded)
	return
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
		SELECT available_for_miners, total_recycled, total_to_miners, total_to_reserve,
		       COALESCE(total_to_value_fund, 0), COALESCE(value_fund_balance, 0),
		       COALESCE(free_queries_funded, 0), total_burned
		FROM recycling_pool_balance WHERE id = 1
	`).Scan(&stats.CurrentPoolSize, &stats.TotalRecycled, &stats.TotalToMiners, &stats.TotalToReserve,
		&stats.TotalToValueFund, &stats.ValueFundBalance, &stats.FreeQueriesFunded, &stats.TotalBurned)
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
