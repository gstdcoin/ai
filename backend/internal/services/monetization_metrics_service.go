package services

import (
	"context"
	"database/sql"
	"sync"
	"time"
)

// MonetizationMetrics aggregates all platform revenue streams for the autonomous financial system
type MonetizationMetrics struct {
	// Platform Funds (GSTD)
	ProtocolFund  float64 `json:"protocol_fund"`
	DevFund       float64 `json:"dev_fund"`
	GoldReserve   float64 `json:"gold_reserve"`
	TotalPlatform float64 `json:"total_platform"`

	// Revenue Streams (24h)
	EscrowFees24h     float64 `json:"escrow_fees_24h"`     // Task escrow 5%
	SkillPurchases24h float64 `json:"skill_purchases_24h"` // Skill marketplace
	SettlementFees24h float64 `json:"settlement_fees_24h"` // Proxy inference 5%
	InferenceFees24h float64 `json:"inference_fees_24h"`  // Brain/Hive API
	TotalRevenue24h   float64 `json:"total_revenue_24h"`

	// Velocity
	RevenueTPS     float64 `json:"revenue_tps"`     // Revenue events per second
	GoldConverted  float64 `json:"gold_converted"`   // GSTD→XAUt last 24h
	LastUpdatedAt  string  `json:"last_updated_at"`
}

// MonetizationMetricsService provides centralized revenue tracking for the sovereign organism
type MonetizationMetricsService struct {
	db    *sql.DB
	escrow *EscrowService
	mu    sync.RWMutex
	cache MonetizationMetrics
	at    time.Time
}

// NewMonetizationMetricsService creates the service
func NewMonetizationMetricsService(db *sql.DB, escrow *EscrowService) *MonetizationMetricsService {
	return &MonetizationMetricsService{
		db:     db,
		escrow: escrow,
	}
}

// GetMetrics returns current monetization metrics (cached, refreshed every 10s)
func (s *MonetizationMetricsService) GetMetrics(ctx context.Context) MonetizationMetrics {
	s.mu.RLock()
	if time.Since(s.at) < 10*time.Second && !s.at.IsZero() {
		m := s.cache
		s.mu.RUnlock()
		return m
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()

	// Double-check after lock
	if time.Since(s.at) < 10*time.Second {
		return s.cache
	}

	m := s.refresh(ctx)
	s.cache = m
	s.at = time.Now()
	return m
}

func (s *MonetizationMetricsService) refresh(ctx context.Context) MonetizationMetrics {
	m := MonetizationMetrics{}

	// 1. Platform funds
	rows, err := s.db.QueryContext(ctx, `SELECT fund_type, COALESCE(balance_gstd, 0) FROM platform_funds`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ft string
			var bal float64
			if rows.Scan(&ft, &bal) == nil {
				switch ft {
				case "protocol_fund":
					m.ProtocolFund = bal
				case "dev_fund":
					m.DevFund = bal
				case "development":
					m.DevFund += bal
				case "gold_reserve":
					m.GoldReserve = bal
				}
			}
		}
	}
	m.TotalPlatform = m.ProtocolFund + m.DevFund + m.GoldReserve

	// 2. Revenue streams (24h) — escrow platform fees (dev_fund + gold_reserve deposits)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM fund_transactions 
		WHERE fund_type IN ('dev_fund', 'gold_reserve') AND amount_gstd > 0 AND created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&m.EscrowFees24h)

	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM transaction_history 
		WHERE tx_type = 'skill_purchase' AND created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&m.SkillPurchases24h)

	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(protocol_amount), 0) FROM settlement_ledger 
		WHERE created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&m.SettlementFees24h)

	// Brain/Hive API revenue (gold_reserve deposits from brain queries)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(amount_gstd)), 0) FROM fund_transactions 
		WHERE fund_type = 'gold_reserve' AND tx_type = 'deposit' AND created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&m.InferenceFees24h)

	// Fallback: total fund deposits 24h as revenue proxy
	if m.EscrowFees24h+m.SkillPurchases24h+m.SettlementFees24h+m.InferenceFees24h < 0.01 {
		_ = s.db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(ABS(amount_gstd)), 0) FROM fund_transactions 
			WHERE created_at > NOW() - INTERVAL '24 hours' AND amount_gstd > 0
		`).Scan(&m.TotalRevenue24h)
	} else {
		m.TotalRevenue24h = m.EscrowFees24h + m.SkillPurchases24h + m.SettlementFees24h + m.InferenceFees24h
	}

	// 3. Gold converted (swap_xaut)
	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(ABS(amount_gstd)), 0) FROM fund_transactions 
		WHERE tx_type = 'swap_xaut' AND created_at > NOW() - INTERVAL '24 hours'
	`).Scan(&m.GoldConverted)

	// 4. Revenue TPS (revenue events per second over 5 min)
	var revCount int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM (
			SELECT 1 FROM fund_transactions WHERE created_at > NOW() - INTERVAL '5 minutes'
			UNION ALL
			SELECT 1 FROM transaction_history WHERE tx_type IN ('skill_purchase','worker_payout') AND created_at > NOW() - INTERVAL '5 minutes'
		) x
	`).Scan(&revCount)
	m.RevenueTPS = float64(revCount) / 300.0

	m.LastUpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return m
}
