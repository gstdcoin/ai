package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════════════════════
// AutoRevenueService — Fully Autonomous Platform Monetization Engine
//
// Revenue Streams (all automatic, zero manual intervention):
//   1. AI Inference Fees   — GSTD deducted per chat request (45% platform keep)
//   2. Telegram Stars      — Users buy GSTD with Stars (real money via Telegram)
//   3. Bridge P2P Fees     — 1% commission on cross-chain transfers
//   4. Staking Spread      — Platform earns spread between staking APY and yield
//   5. API Key Metering    — External devs pay per-request for AI API access
//   6. Token Burns         — Deflationary pressure increases token value
//
// All revenue is recorded to `platform_revenue_ledger` with real amounts.
// Daily briefing sent to Telegram with P&L analysis.
// ═══════════════════════════════════════════════════════════════════════════════

const (
	// Fee rates (automatically applied)
	BridgeCommissionRate   = 0.01  // 1% on all P2P bridge transfers
	InferencePlatformRate  = 0.45  // 45% of chat fees stay as platform revenue
	StakingSpreadRate      = 0.02  // 2% annual spread on staking
	APIKeyBasePriceGSTD    = 0.005 // Per-request cost for API key users

	// Groq API cost estimation (per request, in USD)
	GroqCostPerRequest8B  = 0.0001 // $0.0001 per request (8B models)
	GroqCostPerRequest70B = 0.001  // $0.001 per request (70B models)

	// GSTD/USD reference rate (from Ston.fi pool or market)
	DefaultGSTDPriceUSD = 0.01 // Baseline: 1 GSTD = $0.01

	// Stars conversion (Telegram Stars → USD)
	StarsToUSD = 0.013 // 1 Star ≈ $0.013 (Telegram's rate)
)

type AutoRevenueService struct {
	db              *sql.DB
	telegramService *TelegramService
	gstdPriceUSD    float64
}

type RevenueReport struct {
	Period             string  `json:"period"`
	InferenceRevenue   float64 `json:"inference_revenue_gstd"`
	StarsRevenue       float64 `json:"stars_revenue_usd"`
	BridgeRevenue      float64 `json:"bridge_revenue_gstd"`
	StakingRevenue     float64 `json:"staking_revenue_gstd"`
	APIKeyRevenue      float64 `json:"api_key_revenue_gstd"`
	TotalRevenueGSTD   float64 `json:"total_revenue_gstd"`
	TotalRevenueUSD    float64 `json:"total_revenue_usd"`
	GroqCostUSD        float64 `json:"groq_cost_usd"`
	NetProfitUSD       float64 `json:"net_profit_usd"`
	TotalBurnedGSTD    float64 `json:"total_burned_gstd"`
	ActiveUsers        int     `json:"active_users"`
	TotalRequests      int     `json:"total_requests"`
}

func NewAutoRevenueService(db *sql.DB, telegramService *TelegramService) *AutoRevenueService {
	return &AutoRevenueService{
		db:              db,
		telegramService: telegramService,
		gstdPriceUSD:    DefaultGSTDPriceUSD,
	}
}

// Start launches the fully autonomous revenue engine
func (s *AutoRevenueService) Start(ctx context.Context) {
	log.Println("💰 AutoRevenueService: Autonomous monetization engine started")

	// Ensure ledger table exists
	s.ensureLedgerTable(ctx)

	// Revenue collection runs every 5 minutes
	collectionTicker := time.NewTicker(5 * time.Minute)
	// P&L report every 24 hours
	reportTicker := time.NewTicker(24 * time.Hour)
	// Bridge commission sweep every 10 minutes
	bridgeTicker := time.NewTicker(10 * time.Minute)

	defer collectionTicker.Stop()
	defer reportTicker.Stop()
	defer bridgeTicker.Stop()

	// Initial runs
	s.collectInferenceRevenue(ctx)
	s.collectBridgeCommissions(ctx)
	s.updateGSTDPrice(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-collectionTicker.C:
			s.collectInferenceRevenue(ctx)
			s.collectStarsRevenue(ctx)
			s.collectAPIKeyRevenue(ctx)
			s.collectStakingSpread(ctx)
		case <-bridgeTicker.C:
			s.collectBridgeCommissions(ctx)
		case <-reportTicker.C:
			s.updateGSTDPrice(ctx)
			s.sendRevenueBriefing(ctx)
		}
	}
}

// ensureLedgerTable creates the revenue ledger if it doesn't exist
func (s *AutoRevenueService) ensureLedgerTable(ctx context.Context) {
	_, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS platform_revenue_ledger (
			id SERIAL PRIMARY KEY,
			revenue_type VARCHAR(50) NOT NULL,
			amount_gstd DECIMAL(18,8) DEFAULT 0,
			amount_usd DECIMAL(18,8) DEFAULT 0,
			amount_stars INTEGER DEFAULT 0,
			source_wallet VARCHAR(255),
			reference_id VARCHAR(255),
			metadata JSONB DEFAULT '{}',
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_revenue_ledger_type ON platform_revenue_ledger(revenue_type);
		CREATE INDEX IF NOT EXISTS idx_revenue_ledger_date ON platform_revenue_ledger(created_at);
		CREATE INDEX IF NOT EXISTS idx_revenue_ledger_ref ON platform_revenue_ledger(reference_id);
	`)
	if err != nil {
		log.Printf("AutoRevenue: Error creating ledger table: %v", err)
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE STREAM 1: AI Inference Fees
// Every paid chat request deducts GSTD. 45% is platform revenue.
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) collectInferenceRevenue(ctx context.Context) {
	// Count paid inference requests since last collection
	var count int
	var totalFees float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(gstd_amount), 0)
		FROM golden_reserve_log 
		WHERE timestamp > NOW() - INTERVAL '5 minutes'
	`).Scan(&count, &totalFees)
	if err != nil || count == 0 {
		return
	}

	// Platform revenue = the non-reserve portion (45% of original fee)
	// golden_reserve gets 50%, so original fee = totalFees / 0.50
	// Platform keeps 45% of original
	originalFees := totalFees / 0.50
	platformRevenue := originalFees * InferencePlatformRate

	if platformRevenue > 0 {
		s.recordRevenue(ctx, "inference", platformRevenue, platformRevenue*s.gstdPriceUSD, 0, "", fmt.Sprintf("inference-batch-%d", time.Now().Unix()))
		log.Printf("💰 [Revenue] AI Inference: %.4f GSTD (from %d requests)", platformRevenue, count)
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE STREAM 2: Telegram Stars Purchases
// Users buy GSTD with Telegram Stars → real money for platform
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) collectStarsRevenue(ctx context.Context) {
	// Check for new Stars purchases not yet recorded in revenue ledger
	rows, err := s.db.QueryContext(ctx, `
		SELECT sp.id, sp.stars_amount, sp.gstd_credited, sp.telegram_id, sp.wallet_address
		FROM stars_purchases sp
		LEFT JOIN platform_revenue_ledger prl 
			ON prl.reference_id = CONCAT('stars-', sp.id)
		WHERE prl.id IS NULL
		AND sp.created_at > NOW() - INTERVAL '1 hour'
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var starsAmount int
		var gstdCredited float64
		var telegramID, wallet string
		if err := rows.Scan(&id, &starsAmount, &gstdCredited, &telegramID, &wallet); err != nil {
			continue
		}

		usdRevenue := float64(starsAmount) * StarsToUSD
		s.recordRevenue(ctx, "telegram_stars", gstdCredited, usdRevenue, starsAmount, wallet, fmt.Sprintf("stars-%d", id))
		log.Printf("💰 [Revenue] Telegram Stars: %d stars = $%.4f from user %s", starsAmount, usdRevenue, telegramID)
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE STREAM 3: Bridge P2P Commission
// 1% fee automatically collected on all cross-chain P2P transfers
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) collectBridgeCommissions(ctx context.Context) {
	// Find completed bridge orders without revenue records
	rows, err := s.db.QueryContext(ctx, `
		SELECT bo.id, bo.amount, bo.source_chain, bo.dest_chain, bo.wallet
		FROM bridge_p2p_orders bo
		LEFT JOIN platform_revenue_ledger prl 
			ON prl.reference_id = CONCAT('bridge-', bo.id)
		WHERE bo.status IN ('completed', 'confirmed')
		AND prl.id IS NULL
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var amount float64
		var sourceChain, destChain, wallet string
		if err := rows.Scan(&id, &amount, &sourceChain, &destChain, &wallet); err != nil {
			continue
		}

		commission := amount * BridgeCommissionRate
		if commission > 0 {
			s.recordRevenue(ctx, "bridge_commission", commission, commission*s.gstdPriceUSD, 0, wallet, "bridge-"+id)

			// Deduct commission from user's balance
			s.db.ExecContext(ctx, `
				UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) - $1
				WHERE wallet_address = $2 AND COALESCE(gstd_balance, 0) >= $1
			`, commission, wallet)

			log.Printf("💰 [Revenue] Bridge Commission: %.4f GSTD on %s→%s transfer", commission, sourceChain, destChain)
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE STREAM 4: Staking Spread
// Platform earns the difference between advertised APY and actual yield
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) collectStakingSpread(ctx context.Context) {
	var totalStaked float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(staked_amount), 0) FROM staking_pools WHERE is_active = true
	`).Scan(&totalStaked)
	if err != nil || totalStaked <= 0 {
		return
	}

	// Daily spread revenue = totalStaked * dailySpreadRate
	dailySpreadRate := StakingSpreadRate / 365.0
	dailySpread := totalStaked * dailySpreadRate

	// Only record once per day
	var existing int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM platform_revenue_ledger 
		WHERE revenue_type = 'staking_spread' 
		AND created_at::date = CURRENT_DATE
	`).Scan(&existing)

	if existing == 0 && dailySpread > 0.0001 {
		s.recordRevenue(ctx, "staking_spread", dailySpread, dailySpread*s.gstdPriceUSD, 0, "", fmt.Sprintf("staking-spread-%s", time.Now().Format("2006-01-02")))
		log.Printf("💰 [Revenue] Staking Spread: %.6f GSTD/day on %.2f GSTD staked", dailySpread, totalStaked)
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE STREAM 5: API Key Metering
// External developers pay per-request for AI API access
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) collectAPIKeyRevenue(ctx context.Context) {
	// Count API key usage not yet billed
	var count int
	var totalFee float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM($1), 0)
		FROM api_key_usage 
		WHERE billed = false 
		AND created_at > NOW() - INTERVAL '1 hour'
	`, APIKeyBasePriceGSTD).Scan(&count, &totalFee)
	if err != nil || count == 0 {
		return
	}

	if totalFee > 0 {
		// Mark as billed
		s.db.ExecContext(ctx, `
			UPDATE api_key_usage SET billed = true
			WHERE billed = false AND created_at > NOW() - INTERVAL '1 hour'
		`)

		s.recordRevenue(ctx, "api_key", totalFee, totalFee*s.gstdPriceUSD, 0, "", fmt.Sprintf("apikey-batch-%d", time.Now().Unix()))
		log.Printf("💰 [Revenue] API Key: %.4f GSTD from %d metered requests", totalFee, count)
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE ORACLE: Update GSTD market price from pool data
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) updateGSTDPrice(ctx context.Context) {
	var priceUSD float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(price_usd, $1) FROM market_price_cache 
		WHERE token = 'GSTD' 
		ORDER BY updated_at DESC LIMIT 1
	`, DefaultGSTDPriceUSD).Scan(&priceUSD)
	if err == nil && priceUSD > 0 {
		s.gstdPriceUSD = priceUSD
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE RECORDING & REPORTING
// ═══════════════════════════════════════════════════════════════════════════════

func (s *AutoRevenueService) recordRevenue(ctx context.Context, revenueType string, amountGSTD, amountUSD float64, starsAmount int, sourceWallet, referenceID string) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO platform_revenue_ledger (revenue_type, amount_gstd, amount_usd, amount_stars, source_wallet, reference_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT DO NOTHING
	`, revenueType, amountGSTD, amountUSD, starsAmount, sourceWallet, referenceID)
	if err != nil {
		log.Printf("AutoRevenue: Error recording revenue: %v", err)
	}
}

// GetRevenueReport returns the current revenue report for a given period
func (s *AutoRevenueService) GetRevenueReport(ctx context.Context, period string) (*RevenueReport, error) {
	var interval string
	switch period {
	case "today":
		interval = "created_at >= CURRENT_DATE"
	case "week":
		interval = "created_at >= NOW() - INTERVAL '7 days'"
	case "month":
		interval = "created_at >= NOW() - INTERVAL '30 days'"
	case "all":
		interval = "1=1"
	default:
		interval = "created_at >= CURRENT_DATE"
	}

	report := &RevenueReport{Period: period}

	// Revenue by type
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT revenue_type, 
			COALESCE(SUM(amount_gstd), 0), 
			COALESCE(SUM(amount_usd), 0),
			COALESCE(SUM(amount_stars), 0),
			COUNT(*)
		FROM platform_revenue_ledger 
		WHERE %s
		GROUP BY revenue_type
	`, interval))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var revType string
		var gstd, usd float64
		var stars, count int
		if err := rows.Scan(&revType, &gstd, &usd, &stars, &count); err != nil {
			continue
		}
		switch revType {
		case "inference":
			report.InferenceRevenue = gstd
		case "telegram_stars":
			report.StarsRevenue = usd
		case "bridge_commission":
			report.BridgeRevenue = gstd
		case "staking_spread":
			report.StakingRevenue = gstd
		case "api_key":
			report.APIKeyRevenue = gstd
		}
		report.TotalRevenueGSTD += gstd
		report.TotalRevenueUSD += usd
		report.TotalRequests += count
	}

	// If USD wasn't tracked directly, estimate from GSTD
	if report.TotalRevenueUSD == 0 && report.TotalRevenueGSTD > 0 {
		report.TotalRevenueUSD = report.TotalRevenueGSTD * s.gstdPriceUSD
	}

	// Token burns
	s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns WHERE %s
	`, strings.Replace(interval, "created_at", "created_at", 1))).Scan(&report.TotalBurnedGSTD)

	// Estimated Groq cost
	var chatRequests8B, chatRequests70B int
	s.db.QueryRowContext(ctx, fmt.Sprintf(`
		SELECT 
			COUNT(CASE WHEN gstd_amount < 0.05 THEN 1 END),
			COUNT(CASE WHEN gstd_amount >= 0.05 THEN 1 END)
		FROM golden_reserve_log WHERE %s
	`, strings.Replace(interval, "created_at", "timestamp", 1))).Scan(&chatRequests8B, &chatRequests70B)
	report.GroqCostUSD = float64(chatRequests8B)*GroqCostPerRequest8B + float64(chatRequests70B)*GroqCostPerRequest70B

	// Net profit
	report.NetProfitUSD = report.TotalRevenueUSD - report.GroqCostUSD

	// Active users
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE updated_at > NOW() - INTERVAL '7 days'").Scan(&report.ActiveUsers)

	return report, nil
}

// sendRevenueBriefing sends daily P&L report to Telegram
func (s *AutoRevenueService) sendRevenueBriefing(ctx context.Context) {
	if s.telegramService == nil {
		return
	}

	report, err := s.GetRevenueReport(ctx, "today")
	if err != nil {
		return
	}

	weekReport, _ := s.GetRevenueReport(ctx, "week")
	allTimeReport, _ := s.GetRevenueReport(ctx, "all")

	profitEmoji := "📈"
	if report.NetProfitUSD < 0 {
		profitEmoji = "📉"
	}

	msg := fmt.Sprintf(`💰 <b>Revenue Engine — Daily P&L</b>

<b>Today:</b>
  AI Inference:  %.4f GSTD
  Telegram Stars: $%.4f
  Bridge Fees:   %.4f GSTD
  Staking Spread: %.4f GSTD
  API Keys:      %.4f GSTD
  ─────────────────
  <b>Total:</b>   %.4f GSTD ($%.4f)
  Groq Cost:    -$%.4f
  %s <b>Net P/L:  $%.4f</b>

<b>All-Time:</b>
  Revenue: %.4f GSTD ($%.4f)
  Burned:  %.4f GSTD
  Active Users: %d

<i>🤖 Revenue engine — fully autonomous</i>`,
		report.InferenceRevenue,
		report.StarsRevenue,
		report.BridgeRevenue,
		report.StakingRevenue,
		report.APIKeyRevenue,
		report.TotalRevenueGSTD, report.TotalRevenueUSD,
		report.GroqCostUSD,
		profitEmoji, report.NetProfitUSD,
		allTimeReport.TotalRevenueGSTD, allTimeReport.TotalRevenueUSD,
		allTimeReport.TotalBurnedGSTD,
		report.ActiveUsers,
	)

	_ = weekReport // Available for future weekly summaries
	s.telegramService.SendMessage(ctx, msg)
}
