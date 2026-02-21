package services

import (
	"context"
	"database/sql"
	"math"
)

// GoldHashRateService - Cosmic Genesis: Gold-to-Hash Rate Link
// More gold in reserve = higher base mining reward (physical anchoring)
type GoldHashRateService struct {
	db *sql.DB
}

func NewGoldHashRateService(db *sql.DB) *GoldHashRateService {
	return &GoldHashRateService{db: db}
}

// GetGoldMultiplier returns reward multiplier based on gold reserve (1.0 = base, up to 1.5)
func (s *GoldHashRateService) GetGoldMultiplier(ctx context.Context) float64 {
	var goldBalance float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(balance_gstd, 0) FROM platform_funds WHERE fund_type = 'gold_reserve'
	`).Scan(&goldBalance)
	if err != nil || goldBalance <= 0 {
		return 1.0
	}
	// Scale: 10k GSTD in gold = 1.0, 100k = 1.25, 1M = 1.5
	mult := 1.0 + 0.5*math.Log10(1+goldBalance/10000)
	if mult > 1.5 {
		mult = 1.5
	}
	return mult
}
