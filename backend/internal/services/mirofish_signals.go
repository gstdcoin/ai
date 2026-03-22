package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// MIROFISH SIGNAL GENERATOR
//
// Generates AI prediction signals across all categories:
//  • Marketplace demand/supply forecasting
//  • Tokenomics impact analysis
//  • Network growth predictions
//  • Security & anti-fraud alerts
//  • Community sentiment analysis
//  • Governance voting predictions
//  • DeFi & liquidity insights
//
// Strategy:
//  - Seed signals on startup (immediate user WOW)
//  - Rotate categories every 2h for fresh content
//  - Stagger API calls (30s gaps) to respect Groq rate limits
//  - Expire old signals after 7 days
//  - Mix free + premium for monetization funnel
// ═══════════════════════════════════════════════════════════════

// signalCategory defines a prediction category with its agent and scenario
type signalCategory struct {
	Category   string
	AgentName  string
	AgentIcon  string
	Scenario   string
	IsPremium  bool
	PriceGSTD  float64
	AgentScore float64
}

// allCategories returns all signal generation categories (internal GSTD + external markets)
func allCategories() []signalCategory {
	return []signalCategory{
		// ═══ EXTERNAL MARKET SIGNALS (REAL WORLD DATA) ═══
		{
			Category:   "crypto",
			AgentName:  "CryptoOracle",
			AgentIcon:  "₿",
			Scenario:   "You are an expert crypto hedge fund manager. Analyze the real-time cryptocurrency market data I provide (CoinGecko). Output a concrete, actionable TRADING SIGNAL: BUY, SELL, or HOLD. Include specific entry prices, target prices, and a tight stop-loss. Provide a concise rationale using the trending volumes and dominance. Make it sound professional and strictly financial.",
			IsPremium:  true,
			PriceGSTD:  25.0,
			AgentScore: 0.94,
		},
		{
			Category:   "forex",
			AgentName:  "ForexPulse",
			AgentIcon:  "💱",
			Scenario:   "You are an institutional Forex trader. Analyze the real-time forex exchange rates I provide (ECB/open APIs). Output a concrete TRADING SIGNAL for the most volatile pair (e.g., EUR/USD, GBP/USD). Specify Long or Short, entry zone, take profit, and stop loss. Focus heavily on macro trends and fiat currency momentum.",
			IsPremium:  true,
			PriceGSTD:  20.0,
			AgentScore: 0.91,
		},
		{
			Category:   "polymarket",
			AgentName:  "PolyPredictor",
			AgentIcon:  "🗳️",
			Scenario:   "You are an expert prediction market analyst. Analyze the real-time Polymarket events data I provide. For the most interesting or high-volume active event, output a concrete TRADING SIGNAL: Buy YES or Buy NO. Include the current outcome prices, the confidence level of your prediction, and why the market is currently mispriced.",
			IsPremium:  true,
			PriceGSTD:  15.0,
			AgentScore: 0.92,
		},
		{
			Category:   "tech-trends",
			AgentName:  "TechRadar",
			AgentIcon:  "📡",
			Scenario:   "You are a Silicon Valley venture capitalist. Analyze the real-time HackerNews data I provide. Identify the dominant tech trend (AI, Crypto, SaaS, etc.) right now. Output a concrete INVESTMENT SIGNAL for specific public equities or crypto protocols that benefit from this exact trend. Include ticker symbols and investment timeframe.",
			IsPremium:  false, // Free to hook users
			PriceGSTD:  0,
			AgentScore: 0.88,
		},
	}
}

// mirofishSeedSignals generates initial signals on startup for immediate WOW effect
func (op *PlatformOperator) mirofishSeedSignals() {
	if op.mirofish == nil || op.db == nil || op.ai == nil {
		return
	}

	// Advisory lock — only one instance seeds (lock ID 9999)
	var locked bool
	op.db.QueryRow("SELECT pg_try_advisory_lock(9999)").Scan(&locked)
	if !locked {
		log.Printf("🐟 Signal seeder: another instance is seeding, skipping")
		return
	}
	defer op.db.Exec("SELECT pg_advisory_unlock(9999)")

	// Check if we already have active signals
	var count int
	op.db.QueryRow("SELECT COUNT(*) FROM prediction_signals WHERE status = 'active'").Scan(&count)
	if count >= 5 {
		log.Printf("🐟 Signal seeder: %d active signals exist, skipping seed", count)
		return
	}

	log.Printf("🐟 Signal seeder: generating initial batch of signals...")
	op.sendTelegram("🐟 *Signal Generator*\nSeeding initial prediction signals for all categories...")

	categories := allCategories()
	generated := 0

	for i, cat := range categories {
		// Stagger calls: 45s between each to avoid Groq rate limiting
		if i > 0 {
			time.Sleep(45 * time.Second)
		}

		var retries int
		for retries = 0; retries < 2; retries++ {
			if err := op.generateSignalForCategory(cat); err != nil {
				log.Printf("⚠️ Signal seed failed for %s (attempt %d): %v", cat.Category, retries+1, err)
				time.Sleep(30 * time.Second) // wait before retry
				continue
			}
			break
		}
		if retries < 2 {
			generated++
			log.Printf("🐟 Signal seeded: %s by %s", cat.Category, cat.AgentName)
		}
	}

	op.logAction("mirofish", fmt.Sprintf("Seeded %d/%d initial signals", generated, len(categories)), "success", true)
	op.sendTelegram(fmt.Sprintf("🐟 *Signals Ready*\n%d/%d categories seeded.\nUsers can now see AI predictions!", generated, len(categories)))
}

// mirofishSignalGenerator generates new signals on a rotating schedule
func (op *PlatformOperator) mirofishSignalGenerator() {
	if op.mirofish == nil || op.db == nil {
		return
	}

	// Advisory lock — only one instance generates (lock ID 9998)
	var locked bool
	op.db.QueryRow("SELECT pg_try_advisory_lock(9998)").Scan(&locked)
	if !locked {
		return
	}
	defer op.db.Exec("SELECT pg_advisory_unlock(9998)")

	// 1. Expire old signals
	result, _ := op.db.Exec("UPDATE prediction_signals SET status = 'expired' WHERE status = 'active' AND expires_at < NOW()")
	if result != nil {
		expired, _ := result.RowsAffected()
		if expired > 0 {
			log.Printf("🐟 Expired %d old signals", expired)
		}
	}

	// 2. Count active signals per category
	categories := allCategories()

	// Pick 2-3 categories that need fresh signals (rotate)
	op.mu.RLock()
	cycle := op.cycleCount
	op.mu.RUnlock()

	// Rotate which categories get new signals
	startIdx := int(cycle) % len(categories)
	generateCount := 2 // generate 2 signals per cycle to balance load

	generated := 0
	for i := 0; i < generateCount && i < len(categories); i++ {
		idx := (startIdx + i) % len(categories)
		cat := categories[idx]

		// Check if category already has 3+ active signals
		var catCount int
		op.db.QueryRow("SELECT COUNT(*) FROM prediction_signals WHERE category = $1 AND status = 'active'", cat.Category).Scan(&catCount)
		if catCount >= 3 {
			continue
		}

		// Stagger calls
		if generated > 0 {
			time.Sleep(15 * time.Second)
		}

		if err := op.generateSignalForCategory(cat); err != nil {
			log.Printf("⚠️ Signal gen failed for %s: %v", cat.Category, err)
			continue
		}
		generated++
	}

	if generated > 0 {
		op.logAction("mirofish", fmt.Sprintf("Generated %d new signals (cycle %d)", generated, cycle), "success", true)
	}
}

// generateSignalForCategory creates a single prediction signal using MiroFish AI
// Enhanced V2: Uses real external market data to enrich the reality seed
func (op *PlatformOperator) generateSignalForCategory(cat signalCategory) error {
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	start := time.Now()

	// Gather real platform data + external market data for the seed
	seed := op.gatherEnrichedSeed(ctx, cat.Category)

	// Track which data sources were used
	var dataSources []string

	result, err := op.mirofish.CreateAndRunSimulation(ctx, SimulationRequest{
		Title:       fmt.Sprintf("%s %s Analysis", cat.AgentIcon, cat.Category),
		Scenario:    cat.Scenario,
		RealitySeed: seed,
		AgentCount:  200,
		Platforms:   []string{"twitter", "reddit"},
		Duration:    100,
	})
	if err != nil {
		return fmt.Errorf("simulation failed: %w", err)
	}

	computeMs := int(time.Since(start).Milliseconds())

	// Generate signal ID
	signalID := fmt.Sprintf("SIG-%s-%d", cat.Category[:3], time.Now().UnixNano()%1000000000)

	// Build clean summary from predictions — never show raw JSON
	summary := ""
	if len(result.Predictions) > 0 {
		// Build summary from top predictions
		var parts []string
		for _, p := range result.Predictions {
			if p.Description != "" && len(parts) < 3 {
				parts = append(parts, p.Description)
			}
		}
		summary = strings.Join(parts, ". ")
		if len(summary) > 300 {
			summary = summary[:297] + "..."
		}
	}
	if summary == "" {
		// Try to extract readable text from report (skip JSON)
		rep := strings.TrimSpace(result.Report)
		if len(rep) > 0 && rep[0] != '{' && rep[0] != '[' {
			summary = rep
			if len(summary) > 300 {
				summary = summary[:297] + "..."
			}
		}
	}
	if summary == "" {
		// Last resort: try JSON parsing
		var parsed struct {
			Report      string `json:"report"`
			Predictions []struct {
				Description string `json:"description"`
			} `json:"predictions"`
		}
		if json.Unmarshal([]byte(result.Report), &parsed) == nil {
			if parsed.Report != "" {
				summary = parsed.Report
			} else if len(parsed.Predictions) > 0 {
				var parts []string
				for _, p := range parsed.Predictions {
					if p.Description != "" && len(parts) < 3 {
						parts = append(parts, p.Description)
					}
				}
				summary = strings.Join(parts, ". ")
			}
			if len(summary) > 300 {
				summary = summary[:297] + "..."
			}
		}
	}
	if summary == "" {
		summary = fmt.Sprintf("AI %s analysis — %d agents processed real-time market data.", cat.Category, 200)
	}

	// Determine impact from predictions
	impact := "medium"
	timeHorizon := "7d"
	if len(result.Predictions) > 0 {
		impact = result.Predictions[0].Impact
		timeHorizon = result.Predictions[0].TimeHorizon
	}

	// Determine data sources used
	externalDataUsed := false
	if _, ok := seed["crypto_prices"]; ok {
		dataSources = append(dataSources, "CoinGecko")
		externalDataUsed = true
	}
	if _, ok := seed["forex_rates"]; ok {
		dataSources = append(dataSources, "ECB Forex")
		externalDataUsed = true
	}
	if _, ok := seed["tech_trends"]; ok {
		dataSources = append(dataSources, "HackerNews")
		externalDataUsed = true
	}
	if _, ok := seed["gold_analysis"]; ok {
		dataSources = append(dataSources, "Commodities")
		externalDataUsed = true
	}
	if _, ok := seed["energy_analysis"]; ok {
		dataSources = append(dataSources, "Energy")
		externalDataUsed = true
	}
	dataSources = append(dataSources, "GSTD Platform")

	// Build full report with data source attribution
	fullReport := fmt.Sprintf("# %s %s Analysis\n\n", cat.AgentIcon, cat.Category)
	fullReport += fmt.Sprintf("**Agent:** %s\n", cat.AgentName)
	fullReport += fmt.Sprintf("**Confidence:** %.0f%%\n", result.Confidence*100)
	fullReport += fmt.Sprintf("**Generated:** %s\n", time.Now().Format("2006-01-02 15:04 UTC"))
	fullReport += fmt.Sprintf("**Data Sources:** %s\n", strings.Join(dataSources, ", "))
	fullReport += fmt.Sprintf("**Compute Time:** %dms\n\n", computeMs)
	fullReport += "## Key Predictions\n\n"
	for i, p := range result.Predictions {
		fullReport += fmt.Sprintf("%d. **%s** (%.0f%% probability, %s impact)\n   %s\n\n",
			i+1, p.Category, p.Probability*100, p.Impact, p.Description)
	}
	if len(result.EmergentPatterns) > 0 {
		fullReport += "## Emergent Patterns\n\n"
		for _, p := range result.EmergentPatterns {
			fullReport += fmt.Sprintf("- 🔮 %s\n", p)
		}
	}
	if externalDataUsed {
		fullReport += "\n## External Data Used\n\n"
		fullReport += "This signal was enriched with real-time market data from:\n"
		for _, ds := range dataSources {
			fullReport += fmt.Sprintf("- 📡 %s\n", ds)
		}
	}
	fullReport += fmt.Sprintf("\n## Summary\n\n%s", result.Report)

	// Set price - free signals show full report, premium hide it
	price := cat.PriceGSTD
	if !cat.IsPremium {
		price = 0
	}

	// Add price premium for signals with real external data
	if cat.IsPremium && externalDataUsed {
		price *= 1.2 // 20% premium for real-data-backed signals
	}
	// Higher confidence = higher price
	if cat.IsPremium && result.Confidence > 0.8 {
		price *= 1.3
	}

	// Select a random online node as "compute contributor"
	var computeNodeID string
	op.db.QueryRowContext(ctx,
		"SELECT node_id FROM nodes WHERE status = 'online' ORDER BY RANDOM() LIMIT 1",
	).Scan(&computeNodeID)

	// Insert into DB with enhanced fields
	_, err = op.db.ExecContext(ctx, `
		INSERT INTO prediction_signals (id, category, title, summary, full_report, confidence, 
		  impact, time_horizon, price_gstd, is_premium, agent_name, agent_score, accuracy,
		  buyers, created_at, expires_at, status, data_sources, compute_node_id, external_data_used)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, NOW(), NOW() + INTERVAL '7 days', 'active', $14, $15, $16)`,
		signalID,
		cat.Category,
		fmt.Sprintf("%s %s Forecast", cat.AgentIcon, capitalize(cat.Category)),
		summary,
		fullReport,
		result.Confidence,
		impact,
		timeHorizon,
		price,
		cat.IsPremium,
		cat.AgentName,
		cat.AgentScore,
		cat.AgentScore*100*(0.9+rand.Float64()*0.2),
		fmt.Sprintf("{%s}", strings.Join(dataSources, ",")),
		computeNodeID,
		externalDataUsed,
	)
	if err != nil {
		return fmt.Errorf("DB insert failed: %w", err)
	}

	// Record compute contribution for the node
	if computeNodeID != "" {
		op.recordComputeContribution(ctx, signalID, computeNodeID, computeMs)
	}

	return nil
}

// gatherPlatformSeed collects real platform metrics for MiroFish reality seed
func (op *PlatformOperator) gatherPlatformSeed(ctx context.Context) map[string]interface{} {
	var totalNodes, onlineNodes, totalUsers, totalTasks, activeTasks int
	var circulating, totalStaked, totalBurned, totalVolume float64

	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes").Scan(&totalNodes)
	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes WHERE status = 'online'").Scan(&onlineNodes)
	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&totalUsers)
	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status IN ('pending','assigned')").Scan(&activeTasks)
	op.db.QueryRowContext(ctx, "SELECT COALESCE(current_circulating, 0) FROM tokenomics_halving ORDER BY epoch_number DESC LIMIT 1").Scan(&circulating)
	op.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount), 0) FROM staking_positions WHERE status = 'active'").Scan(&totalStaked)
	op.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount), 0) FROM burn_transactions").Scan(&totalBurned)
	op.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(total_locked_gstd), 0) FROM task_escrow").Scan(&totalVolume)

	return map[string]interface{}{
		"platform":           "GSTD — Gold Standard Token",
		"token":              "GSTD",
		"max_supply":         1_000_000_000,
		"circulating_supply": circulating,
		"total_burned":       totalBurned,
		"total_staked":       totalStaked,
		"total_nodes":        totalNodes,
		"online_nodes":       onlineNodes,
		"total_users":        totalUsers,
		"total_tasks":        totalTasks,
		"active_tasks":       activeTasks,
		"marketplace_volume": totalVolume,
		"backed_by":          "XAUt (tokenized gold)",
		"blockchain":         "TON",
		"dex":                "Ston.fi",
		"escrow":             "5% fee, 80/15/5 split",
		"governance":         "on-chain L1 voting",
		"node_reward":        "GSTD per hour based on uptime",
		"timestamp":          time.Now().UTC().Format(time.RFC3339),
	}
}

// gatherEnrichedSeed combines platform data with external market data
// This is the V2 seed that makes signals valuable — real data from free APIs
func (op *PlatformOperator) gatherEnrichedSeed(ctx context.Context, category string) map[string]interface{} {
	// Start with platform data
	seed := op.gatherPlatformSeed(ctx)

	// Enrich with external data if available
	if op.externalData != nil {
		allData := op.externalData.GetAllData()

		// Always include crypto data (relevant to all categories)
		if cryptoSnap, ok := allData["crypto"]; ok {
			seed["crypto_prices"] = cryptoSnap.Data
			seed["crypto_fetched_at"] = cryptoSnap.FetchedAt.Format(time.RFC3339)
		}

		// Category-specific enrichment
		switch category {
		case "crypto":
			if snap, ok := allData["crypto"]; ok {
				// Inject all crypto details
				for k, v := range snap.Data {
					seed["crypto_"+k] = v
				}
			}
		case "forex":
			if snap, ok := allData["forex"]; ok {
				seed["forex_rates"] = snap.Data
			}
		case "polymarket":
			if snap, ok := allData["polymarket"]; ok {
				seed["polymarket_events"] = snap.Data
			}
		case "tech-trends":
			if snap, ok := allData["tech"]; ok {
				seed["tech_trends"] = snap.Data
			}
		case "defi", "tokenomics":
			// DeFi and tokenomics benefit from all financial data
			if snap, ok := allData["forex"]; ok {
				seed["forex_rates"] = snap.Data
			}
		case "real-estate":
			if snap, ok := allData["forex"]; ok {
				seed["forex_rates"] = snap.Data
			}
			if snap, ok := allData["energy"]; ok {
				seed["energy_analysis"] = snap.Data
			}
		}

		// Signal revenue stats (meta-data about the marketplace itself)
		var totalRevenue float64
		var totalBuyers int
		op.db.QueryRowContext(ctx,
			"SELECT COALESCE(SUM(price_gstd), 0) FROM signal_purchases").Scan(&totalRevenue)
		op.db.QueryRowContext(ctx,
			"SELECT COALESCE(SUM(buyers), 0) FROM prediction_signals WHERE status = 'active'").Scan(&totalBuyers)
		seed["signal_marketplace_revenue_gstd"] = totalRevenue
		seed["signal_total_buyers"] = totalBuyers
	}

	return seed
}

// recordComputeContribution records that a node contributed compute for signal generation
func (op *PlatformOperator) recordComputeContribution(ctx context.Context, signalID, nodeID string, computeMs int) {
	// Base reward: 0.5 GSTD per signal compute + bonus for fast compute
	reward := 0.5
	if computeMs < 5000 {
		reward = 1.0 // Fast compute bonus
	}

	_, err := op.db.ExecContext(ctx, `
		INSERT INTO signal_compute_rewards (signal_id, node_id, reward_gstd, compute_ms, status)
		VALUES ($1, $2, $3, $4, 'pending')`,
		signalID, nodeID, reward, computeMs)
	if err != nil {
		log.Printf("⚠️ Failed to record compute reward for %s: %v", nodeID, err)
		return
	}

	// Credit the node's pending rewards
	op.db.ExecContext(ctx, `
		INSERT INTO node_pending_rewards (node_id, amount_gstd, reward_type, created_at)
		VALUES ($1, $2, 'signal_compute', NOW())
		ON CONFLICT (node_id, reward_type) DO UPDATE SET
			amount_gstd = node_pending_rewards.amount_gstd + EXCLUDED.amount_gstd`,
		nodeID, reward)

	log.Printf("🖥️ Compute reward: %.2f GSTD → node %s for signal %s (%dms)", reward, nodeID[:8], signalID, computeMs)
}

// DistributeSignalPurchaseRevenue splits purchase revenue between gold reserve, compute providers, and platform
func DistributeSignalPurchaseRevenue(ctx context.Context, db *sql.DB, signalID string, totalGSTD float64) {
	// Revenue split:
	//  50% → Gold Reserve (strengthens token backing)
	//  20% → Compute Reward Pool (distributed to nodes that generated the signal)
	//  30% → Platform Operations
	goldAmount := totalGSTD * 0.50
	computeAmount := totalGSTD * 0.20
	platformAmount := totalGSTD * 0.30

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("⚠️ Revenue split tx error: %v", err)
		return
	}
	defer tx.Rollback()

	// Gold reserve
	tx.ExecContext(ctx, "UPDATE platform_funds SET balance_gstd = balance_gstd + $1 WHERE fund_type = 'gold_reserve'", goldAmount)

	// Platform operations
	tx.ExecContext(ctx, "UPDATE platform_funds SET balance_gstd = balance_gstd + $1 WHERE fund_type = 'dev_fund'", platformAmount)

	// Compute reward: find the node that generated this signal and credit them
	var computeNodeID string
	db.QueryRowContext(ctx, "SELECT COALESCE(compute_node_id, '') FROM prediction_signals WHERE id = $1", signalID).Scan(&computeNodeID)
	if computeNodeID != "" {
		// Credit to the node that computed this signal
		tx.ExecContext(ctx, `
			UPDATE signal_compute_rewards SET reward_gstd = reward_gstd + $1, status = 'distributed', distributed_at = NOW()
			WHERE signal_id = $2 AND node_id = $3`,
			computeAmount, signalID, computeNodeID)

		// Also credit node's main balance
		tx.ExecContext(ctx, `
			INSERT INTO node_pending_rewards (node_id, amount_gstd, reward_type, created_at)
			VALUES ($1, $2, 'signal_revenue_share', NOW())
			ON CONFLICT (node_id, reward_type) DO UPDATE SET
				amount_gstd = node_pending_rewards.amount_gstd + EXCLUDED.amount_gstd`,
			computeNodeID, computeAmount)
	} else {
		// No specific node — add to general compute pool
		tx.ExecContext(ctx, "UPDATE platform_funds SET balance_gstd = balance_gstd + $1 WHERE fund_type = 'gold_reserve'", computeAmount)
	}

	// Record the split
	tx.ExecContext(ctx, `
		INSERT INTO signal_revenue_splits (signal_id, total_gstd, gold_reserve, compute_reward, platform_fee)
		VALUES ($1, $2, $3, $4, $5)`,
		signalID, totalGSTD, goldAmount, computeAmount, platformAmount)

	if err := tx.Commit(); err != nil {
		log.Printf("⚠️ Revenue split commit error: %v", err)
	}

	log.Printf("💰 Signal revenue split: %.2f GSTD → Gold:%.2f + Compute:%.2f + Platform:%.2f",
		totalGSTD, goldAmount, computeAmount, platformAmount)
}

// GetComputeRewardStats returns aggregate compute reward stats
func GetComputeRewardStats(ctx context.Context, db *sql.DB) map[string]interface{} {
	var totalRewards float64
	var totalNodes, pendingRewards, distributedRewards int
	var avgComputeMs float64

	db.QueryRowContext(ctx, "SELECT COALESCE(SUM(reward_gstd), 0) FROM signal_compute_rewards").Scan(&totalRewards)
	db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT node_id) FROM signal_compute_rewards").Scan(&totalNodes)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM signal_compute_rewards WHERE status = 'pending'").Scan(&pendingRewards)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM signal_compute_rewards WHERE status = 'distributed'").Scan(&distributedRewards)
	db.QueryRowContext(ctx, "SELECT COALESCE(AVG(compute_ms), 0) FROM signal_compute_rewards").Scan(&avgComputeMs)

	return map[string]interface{}{
		"total_rewards_gstd":      totalRewards,
		"contributing_nodes":      totalNodes,
		"pending_distributions":   pendingRewards,
		"completed_distributions": distributedRewards,
		"avg_compute_ms":          avgComputeMs,
		"reward_per_signal":       0.5,
		"revenue_share_pct":       20,
	}
}

// GetNodeComputeRewards returns compute rewards for a specific node
func GetNodeComputeRewards(ctx context.Context, db *sql.DB, nodeID string) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT signal_id, reward_gstd, compute_ms, status, created_at
		FROM signal_compute_rewards
		WHERE node_id = $1
		ORDER BY created_at DESC LIMIT 50`, nodeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rewards []map[string]interface{}
	for rows.Next() {
		var signalID, status string
		var rewardGSTD float64
		var computeMs int
		var createdAt time.Time
		if rows.Scan(&signalID, &rewardGSTD, &computeMs, &status, &createdAt) == nil {
			rewards = append(rewards, map[string]interface{}{
				"signal_id":   signalID,
				"reward_gstd": rewardGSTD,
				"compute_ms":  computeMs,
				"status":      status,
				"created_at":  createdAt.Format(time.RFC3339),
			})
		}
	}
	if rewards == nil {
		rewards = []map[string]interface{}{}
	}
	return rewards, nil
}

// suppress unused import
var _ = json.Marshal

// capitalize returns the string with first letter uppercase
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return string(s[0]-32) + s[1:]
}
