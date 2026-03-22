package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// BILLING SERVICE (awesome-billing enhanced)
// Source: https://github.com/kdeldycke/awesome-billing
//
// Features:
//   - Wallet balance & earnings tracking
//   - Subscription tiers (Free, Pro, Ultra, Enterprise)
//   - Usage metering per API call
//   - Usage summary with requests remaining
// ═══════════════════════════════════════════════════════════════

// BillingService provides wallet balance, usage metering, and subscription management
type BillingService struct {
	db         *sql.DB
	settlement *SettlementService
	poolMon    *PoolMonitorService
	escrow     *EscrowService
}

// WalletBalance holds earnings in GSTD and XAUt equivalent
type WalletBalance struct {
	WalletAddress  string  `json:"wallet_address"`
	EarnedGSTD     float64 `json:"earned_gstd"`
	XAUtEquivalent float64 `json:"xaut_equivalent"`
	XAUtPriceUSD   float64 `json:"xaut_price_usd"`
}

// SubscriptionTier defines pricing levels
type SubscriptionTier struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	MonthlyPriceGSTD float64  `json:"monthly_price_gstd"`
	RequestsPerMonth int      `json:"requests_per_month"` // -1 = unlimited
	ModelsAccess     string   `json:"models_access"`
	SignalsPerDay    int      `json:"signals_per_day"` // -1 = unlimited
	Features         []string `json:"features"`
}

// UsageSummary shows per-wallet consumption
type UsageSummary struct {
	WalletAddress     string  `json:"wallet_address"`
	Period            string  `json:"period"`
	TotalRequests     int     `json:"total_requests"`
	CachedRequests    int     `json:"cached_requests"`
	TotalTokensUsed   int64   `json:"total_tokens_used"`
	TotalCostGSTD     float64 `json:"total_cost_gstd"`
	AvgLatencyMs      float64 `json:"avg_latency_ms"`
	CurrentTier       string  `json:"current_tier"`
	RequestsRemaining int     `json:"requests_remaining"` // -1 = unlimited
}

// ── Tier Definitions ──────────────────────────────────────────
var SubscriptionTiers = map[string]SubscriptionTier{
	"free": {
		ID: "free", Name: "Free", MonthlyPriceGSTD: 0,
		RequestsPerMonth: 100, ModelsAccess: "basic", SignalsPerDay: 3,
		Features: []string{"Single Expert AI", "Basic Signals", "Community Support"},
	},
	"pro": {
		ID: "pro", Name: "Pro", MonthlyPriceGSTD: 50,
		RequestsPerMonth: 5000, ModelsAccess: "all", SignalsPerDay: -1,
		Features: []string{"All AI Models", "Unlimited Signals", "Priority Queue", "Usage Analytics"},
	},
	"ultra": {
		ID: "ultra", Name: "Ultra", MonthlyPriceGSTD: 200,
		RequestsPerMonth: 50000, ModelsAccess: "all+priority", SignalsPerDay: -1,
		Features: []string{"All Pro Features", "VIP Signals", "Custom Models", "API Access", "Dedicated Support"},
	},
	"enterprise": {
		ID: "enterprise", Name: "Enterprise", MonthlyPriceGSTD: 0,
		RequestsPerMonth: -1, ModelsAccess: "dedicated", SignalsPerDay: -1,
		Features: []string{"Unlimited Everything", "Team Accounts", "RBAC", "SLA", "Custom ML Pipelines"},
	},
}

// NewBillingService creates the billing service
func NewBillingService(db *sql.DB, settlement *SettlementService, poolMon *PoolMonitorService, escrow *EscrowService) *BillingService {
	svc := &BillingService{
		db:         db,
		settlement: settlement,
		poolMon:    poolMon,
		escrow:     escrow,
	}
	svc.ensureBillingSchema()
	return svc
}

func (s *BillingService) ensureBillingSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS billing_usage (
			id BIGSERIAL PRIMARY KEY,
			wallet_address VARCHAR(128) NOT NULL,
			model_id VARCHAR(64),
			tokens_used INT DEFAULT 0,
			cost_gstd DECIMAL(18,8) DEFAULT 0,
			latency_ms INT DEFAULT 0,
			cached BOOLEAN DEFAULT false,
			tier VARCHAR(16) DEFAULT 'free',
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_billing_usage_wallet ON billing_usage(wallet_address);
		CREATE INDEX IF NOT EXISTS idx_billing_usage_time ON billing_usage(created_at DESC);

		CREATE TABLE IF NOT EXISTS billing_subscriptions (
			wallet_address VARCHAR(128) PRIMARY KEY,
			tier VARCHAR(16) DEFAULT 'free',
			started_at TIMESTAMP DEFAULT NOW(),
			expires_at TIMESTAMP,
			auto_renew BOOLEAN DEFAULT true,
			updated_at TIMESTAMP DEFAULT NOW()
		);
	`)
	log.Println("💳 Billing: Usage metering + subscription tiers ready")
}

// RecordUsage logs a single API usage event for metering
func (s *BillingService) RecordUsage(ctx context.Context, wallet, modelID string, tokens int, costGSTD float64, latencyMs int, cached bool, tier string) {
	if s.db == nil || wallet == "" {
		return
	}
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO billing_usage (wallet_address, model_id, tokens_used, cost_gstd, latency_ms, cached, tier)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, wallet, modelID, tokens, costGSTD, latencyMs, cached, tier)
}

// GetUsageSummary returns consumption stats for a wallet
func (s *BillingService) GetUsageSummary(ctx context.Context, wallet string, period string) (*UsageSummary, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not available")
	}

	var interval string
	switch period {
	case "today":
		interval = "CURRENT_DATE"
	case "week":
		interval = "NOW() - INTERVAL '7 days'"
	default:
		interval = "NOW() - INTERVAL '30 days'"
		period = "month"
	}

	summary := &UsageSummary{WalletAddress: wallet, Period: period}

	s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COUNT(*), COUNT(*) FILTER (WHERE cached = true),
		       COALESCE(SUM(tokens_used), 0), COALESCE(SUM(cost_gstd), 0),
		       COALESCE(AVG(latency_ms), 0)
		FROM billing_usage
		WHERE wallet_address = $1 AND created_at >= %s
	`, interval), wallet).Scan(
		&summary.TotalRequests, &summary.CachedRequests,
		&summary.TotalTokensUsed, &summary.TotalCostGSTD,
		&summary.AvgLatencyMs,
	)
	summary.AvgLatencyMs = math.Round(summary.AvgLatencyMs*100) / 100

	// Current tier
	summary.CurrentTier = "free"
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(tier, 'free') FROM billing_subscriptions
		WHERE wallet_address = $1 AND (expires_at IS NULL OR expires_at > NOW())
	`, wallet).Scan(&summary.CurrentTier)

	// Requests remaining
	if tier, ok := SubscriptionTiers[summary.CurrentTier]; ok && tier.RequestsPerMonth > 0 {
		summary.RequestsRemaining = tier.RequestsPerMonth - summary.TotalRequests
		if summary.RequestsRemaining < 0 {
			summary.RequestsRemaining = 0
		}
	} else {
		summary.RequestsRemaining = -1
	}

	return summary, nil
}

// GetSubscriptionTiers returns all available tiers
func (s *BillingService) GetSubscriptionTiers() map[string]SubscriptionTier {
	return SubscriptionTiers
}

// ═══ Original methods preserved below ═══

// GetWalletBalance returns earned GSTD and XAUt equivalent for a wallet
func (s *BillingService) GetWalletBalance(ctx context.Context, wallet string) (*WalletBalance, error) {
	earned := 0.0

	if s.settlement != nil {
		e, _ := s.settlement.GetWalletEarnings(ctx, wallet)
		earned += e
	}

	if s.db != nil {
		var txEarned float64
		_ = s.db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(amount_gstd), 0) FROM transaction_history
			WHERE to_wallet = $1 AND tx_type = 'worker_payout'
		`, wallet).Scan(&txEarned)
		earned += txEarned
	}

	xautPrice := 3200.0
	if s.poolMon != nil {
		xautPrice = s.poolMon.GetXAUtPriceUSD()
	}

	var gstdPriceUSD float64
	if s.poolMon != nil {
		if p, err := s.poolMon.GetGSTDPriceUSD(context.Background()); err == nil && p > 0 {
			gstdPriceUSD = p
		}
	}
	xautEquivalent := 0.0
	if xautPrice > 0 && gstdPriceUSD > 0 {
		xautEquivalent = (earned * gstdPriceUSD) / xautPrice
	}

	return &WalletBalance{
		WalletAddress:  wallet,
		EarnedGSTD:     earned,
		XAUtEquivalent: xautEquivalent,
		XAUtPriceUSD:   xautPrice,
	}, nil
}

// GetWalletTransactions returns recent Escrow 2.0 transactions
func (s *BillingService) GetWalletTransactions(ctx context.Context, wallet string, limit int) ([]TransactionRecord, error) {
	if s.escrow == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 30
	}
	return s.escrow.GetTransactionHistory(ctx, wallet, limit)
}

// ProcessSkillPurchase handles skill purchases with 5% protocol fee
func (s *BillingService) ProcessSkillPurchase(ctx context.Context, wallet string, skillName string, price float64) error {
	if price <= 0 {
		return nil
	}

	balance, err := s.GetWalletBalance(ctx, wallet)
	if err != nil {
		return err
	}
	if balance.EarnedGSTD < price {
		return errors.New("insufficient earned balance to purchase skill")
	}

	txID := fmt.Sprintf("skill-%s-%d", skillName, time.Now().Unix())
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO transaction_history (transaction_id, from_wallet, to_wallet, amount_gstd, tx_type, details)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, txID, wallet, "protocol", price, "skill_purchase", skillName)
	if err != nil {
		return err
	}

	protocolFee := price * 0.05
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('protocol_fund', $1)
		ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + EXCLUDED.balance_gstd
	`, protocolFee)

	log.Printf("[Billing] Skill Purchase: %s bought %s for %.2f GSTD. (Fee: %.2f)", wallet, skillName, price, protocolFee)
	return nil
}
