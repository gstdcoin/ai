package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// BurnService handles the deflationary token burn mechanism
// 5% of every transaction is permanently burned
type BurnService struct {
	db          *sql.DB
	burnRate    float64
	burnAddress string
}

// BurnConfig configuration for burn mechanism
type BurnConfig struct {
	BurnRate    float64 // Default: 0.05 (5%)
	BurnAddress string  // TON Black Hole address
}

// NewBurnService creates a new burn service
func NewBurnService(db *sql.DB, config *BurnConfig) *BurnService {
	if config == nil {
		config = &BurnConfig{
			BurnRate:    0.05,                                               // 5%
			BurnAddress: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c", // TON Black Hole
		}
	}

	return &BurnService{
		db:          db,
		burnRate:    config.BurnRate,
		burnAddress: config.BurnAddress,
	}
}

// CalculateBurnAmount calculates how much should be burned for a transaction
func (s *BurnService) CalculateBurnAmount(transactionAmount float64) float64 {
	return transactionAmount * s.burnRate
}

// RecordBurn records a burn event in the database
func (s *BurnService) RecordBurn(ctx context.Context, burnRecord *BurnRecord) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO token_burns (
			transaction_id, 
			transaction_type,
			original_amount,
			burn_amount,
			burn_address,
			source_wallet,
			created_at
		) VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`, burnRecord.TransactionID,
		burnRecord.TransactionType,
		burnRecord.OriginalAmount,
		burnRecord.BurnAmount,
		s.burnAddress,
		burnRecord.SourceWallet)

	if err != nil {
		log.Printf("⚠️  Failed to record burn: %v", err)
		return err
	}

	log.Printf("🔥 BURN: %.6f GSTD from %s (tx: %s)",
		burnRecord.BurnAmount, burnRecord.TransactionType, burnRecord.TransactionID)

	return nil
}

// ProcessTransactionWithBurn handles a transaction with automatic burn
// Returns the breakdown of amounts
func (s *BurnService) ProcessTransactionWithBurn(ctx context.Context, req *TransactionRequest) (*TransactionBreakdown, error) {
	totalAmount := req.Amount

	// Calculate breakdown
	burnAmount := s.CalculateBurnAmount(totalAmount)
	platformFee := totalAmount * 0.05                      // 5% platform fee
	workerReward := totalAmount - burnAmount - platformFee // 90%

	breakdown := &TransactionBreakdown{
		TotalAmount:         totalAmount,
		WorkerReward:        workerReward,
		PlatformFee:         platformFee,
		BurnAmount:          burnAmount,
		WorkerRewardPercent: 90.0,
		PlatformFeePercent:  5.0,
		BurnPercent:         5.0,
	}

	// Record the burn
	burnRecord := &BurnRecord{
		TransactionID:   req.TransactionID,
		TransactionType: req.TransactionType,
		OriginalAmount:  totalAmount,
		BurnAmount:      burnAmount,
		SourceWallet:    req.SourceWallet,
	}

	if err := s.RecordBurn(ctx, burnRecord); err != nil {
		// Log but don't fail - burn is recorded for analytics, not critical path
		log.Printf("⚠️  Burn recording failed: %v", err)
	}

	// Update total supply tracking
	s.updateTotalBurned(ctx, burnAmount)

	return breakdown, nil
}

// GetBurnStats returns overall burn statistics
func (s *BurnService) GetBurnStats(ctx context.Context) (*BurnStats, error) {
	stats := &BurnStats{}

	// Total burned all time
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns
	`).Scan(&stats.TotalBurned)
	if err != nil {
		return nil, err
	}

	// Burns today
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns
		WHERE created_at >= CURRENT_DATE
	`).Scan(&stats.BurnedToday)
	if err != nil {
		stats.BurnedToday = 0
	}

	// Burns this week
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns
		WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
	`).Scan(&stats.BurnedThisWeek)
	if err != nil {
		stats.BurnedThisWeek = 0
	}

	// Burns this month
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns
		WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
	`).Scan(&stats.BurnedThisMonth)
	if err != nil {
		stats.BurnedThisMonth = 0
	}

	// Total transactions with burns
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM token_burns
	`).Scan(&stats.TotalBurnTransactions)
	if err != nil {
		stats.TotalBurnTransactions = 0
	}

	// Current supply (initial - burned)
	stats.InitialSupply = 1_000_000_000 // 1B max supply (TON emission)
	stats.CurrentSupply = stats.InitialSupply - stats.TotalBurned
	stats.BurnRate = s.burnRate * 100 // 5%

	// Calculate deflation rate
	if stats.InitialSupply > 0 {
		stats.DeflationPercent = (stats.TotalBurned / stats.InitialSupply) * 100
	}

	return stats, nil
}

// GetBurnHistory returns recent burn transactions
func (s *BurnService) GetBurnHistory(ctx context.Context, limit int) ([]BurnRecord, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			transaction_id,
			transaction_type,
			original_amount,
			burn_amount,
			source_wallet,
			created_at
		FROM token_burns
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []BurnRecord
	for rows.Next() {
		var r BurnRecord
		var createdAt time.Time
		err := rows.Scan(
			&r.TransactionID,
			&r.TransactionType,
			&r.OriginalAmount,
			&r.BurnAmount,
			&r.SourceWallet,
			&createdAt,
		)
		if err != nil {
			continue
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		records = append(records, r)
	}

	return records, nil
}

// GetBurnsByType returns burn statistics grouped by transaction type
func (s *BurnService) GetBurnsByType(ctx context.Context) ([]BurnByType, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			transaction_type,
			COUNT(*) as count,
			SUM(burn_amount) as total_burned,
			AVG(burn_amount) as avg_burn
		FROM token_burns
		GROUP BY transaction_type
		ORDER BY total_burned DESC
	`)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []BurnByType
	for rows.Next() {
		var r BurnByType
		err := rows.Scan(&r.Type, &r.Count, &r.TotalBurned, &r.AvgBurn)
		if err != nil {
			continue
		}
		results = append(results, r)
	}

	return results, nil
}

// ProjectFutureBurn projects burn at given transaction volumes
func (s *BurnService) ProjectFutureBurn(avgTransactionSize float64, dailyTransactions int) *BurnProjection {
	dailyBurn := avgTransactionSize * float64(dailyTransactions) * s.burnRate
	monthlyBurn := dailyBurn * 30
	yearlyBurn := dailyBurn * 365

	return &BurnProjection{
		AvgTransactionSize:      avgTransactionSize,
		DailyTransactions:       dailyTransactions,
		ProjectedDailyBurn:      dailyBurn,
		ProjectedMonthlyBurn:    monthlyBurn,
		ProjectedYearlyBurn:     yearlyBurn,
		YearlyBurnPercentSupply: (yearlyBurn / 1_000_000_000) * 100,
	}
}

// updateTotalBurned updates the running total (for quick access)
func (s *BurnService) updateTotalBurned(ctx context.Context, amount float64) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO burn_totals (id, total_burned, last_updated)
		VALUES (1, $1, NOW())
		ON CONFLICT (id) DO UPDATE SET
			total_burned = burn_totals.total_burned + $1,
			last_updated = NOW()
	`, amount)

	if err != nil {
		log.Printf("⚠️  Failed to update burn totals: %v", err)
	}
}

// ============================================================================
// TYPES
// ============================================================================

// BurnRecord represents a single burn event
type BurnRecord struct {
	TransactionID   string  `json:"transaction_id"`
	TransactionType string  `json:"transaction_type"` // task_payment, marketplace_fee, etc.
	OriginalAmount  float64 `json:"original_amount"`
	BurnAmount      float64 `json:"burn_amount"`
	SourceWallet    string  `json:"source_wallet"`
	CreatedAt       string  `json:"created_at,omitempty"`
}

// TransactionRequest input for processing a transaction
type TransactionRequest struct {
	TransactionID   string
	TransactionType string
	Amount          float64
	SourceWallet    string
}

// TransactionBreakdown shows how a transaction is split
type TransactionBreakdown struct {
	TotalAmount         float64 `json:"total_amount"`
	WorkerReward        float64 `json:"worker_reward"`
	PlatformFee         float64 `json:"platform_fee"`
	BurnAmount          float64 `json:"burn_amount"`
	WorkerRewardPercent float64 `json:"worker_reward_percent"`
	PlatformFeePercent  float64 `json:"platform_fee_percent"`
	BurnPercent         float64 `json:"burn_percent"`
}

// BurnStats overall burn statistics
type BurnStats struct {
	TotalBurned           float64 `json:"total_burned"`
	BurnedToday           float64 `json:"burned_today"`
	BurnedThisWeek        float64 `json:"burned_this_week"`
	BurnedThisMonth       float64 `json:"burned_this_month"`
	TotalBurnTransactions int     `json:"total_burn_transactions"`
	InitialSupply         float64 `json:"initial_supply"`
	CurrentSupply         float64 `json:"current_supply"`
	BurnRate              float64 `json:"burn_rate_percent"`
	DeflationPercent      float64 `json:"deflation_percent"`
}

// BurnByType statistics grouped by transaction type
type BurnByType struct {
	Type        string  `json:"type"`
	Count       int     `json:"count"`
	TotalBurned float64 `json:"total_burned"`
	AvgBurn     float64 `json:"avg_burn"`
}

// BurnProjection future burn projections
type BurnProjection struct {
	AvgTransactionSize      float64 `json:"avg_transaction_size"`
	DailyTransactions       int     `json:"daily_transactions"`
	ProjectedDailyBurn      float64 `json:"projected_daily_burn"`
	ProjectedMonthlyBurn    float64 `json:"projected_monthly_burn"`
	ProjectedYearlyBurn     float64 `json:"projected_yearly_burn"`
	YearlyBurnPercentSupply float64 `json:"yearly_burn_percent_of_supply"`
}

// GetBurnAddress returns the burn address for frontend display
func (s *BurnService) GetBurnAddress() string {
	return s.burnAddress
}

// GetBurnRate returns the current burn rate
func (s *BurnService) GetBurnRate() float64 {
	return s.burnRate
}

// SimulateBurn shows what would be burned for a given amount (for UI preview)
func (s *BurnService) SimulateBurn(amount float64) *TransactionBreakdown {
	burnAmount := s.CalculateBurnAmount(amount)
	platformFee := amount * 0.05
	workerReward := amount - burnAmount - platformFee

	return &TransactionBreakdown{
		TotalAmount:         amount,
		WorkerReward:        workerReward,
		PlatformFee:         platformFee,
		BurnAmount:          burnAmount,
		WorkerRewardPercent: 90.0,
		PlatformFeePercent:  5.0,
		BurnPercent:         5.0,
	}
}
