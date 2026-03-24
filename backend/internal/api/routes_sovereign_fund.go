package api

import (
	"database/sql"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ═══════════════════════════════════════════════════════════════
// Age Multiplier Engine & Sovereign Fund Public API
// Node reputation: 1.0x → 3.0x based on uptime streak
// Sovereign Fund: real-time transparency dashboard data
// ═══════════════════════════════════════════════════════════════

const (
	AgeMultiplierMax       = 3.0
	AgeMultiplierStep      = 0.2
	AgeUptimeThreshold     = 99.5  // % weekly uptime to earn step
	AgeDisconnectResetMin  = 120   // minutes before full reset
	HeartbeatTimeoutMin    = 2     // minutes before marking offline
	EpochDurationDays      = 30
	MinMultiplierForYield  = 2.0   // minimum multiplier to receive yield
)

// ─── Setup Routes ────────────────────────────────────────────

func SetupSovereignFundRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	fund := v1.Group("/fund")
	{
		// Public transparency endpoints (no auth required)
		fund.GET("/status", getFundStatus(db))
		fund.GET("/backing", getBackingDetails(db))
		fund.GET("/floor-price", getFloorPrice(db))
		fund.GET("/epoch", getCurrentEpoch(db))
		fund.GET("/epochs", getEpochHistory(db))
		fund.GET("/revenue", getRevenueBreakdown(db))
		fund.GET("/leaderboard", getNodeLeaderboard(db))
		fund.GET("/yield-estimate", getFundYieldEstimate(db))
	}

	// Verified provider registration
	v1.POST("/providers/register", registerVerifiedProvider(db))
	v1.GET("/providers/status", getProviderStatus(db))
	v1.GET("/providers/list", getVerifiedProviders(db))
}

// ─── Age Multiplier Cron ─────────────────────────────────────
// Run every 5 minutes via scheduler

func StartAgeMultiplierCron(db *sql.DB) {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		for range ticker.C {
			runAgeMultiplierCycle(db)
		}
	}()
	log.Println("[AgeMultiplier] Cron started (every 5 min)")
}

func runAgeMultiplierCycle(db *sql.DB) {
	now := time.Now().UTC()

	// 1. Mark nodes as disconnected if no heartbeat for >2 min
	_, _ = db.Exec(
		`UPDATE node_uptime_tracker
		 SET last_disconnect = $1
		 WHERE last_heartbeat < $2 AND last_disconnect IS NULL`,
		now, now.Add(-time.Duration(HeartbeatTimeoutMin)*time.Minute),
	)

	// 2. Reset multiplier for nodes disconnected >120 min
	result, _ := db.Exec(
		`UPDATE node_uptime_tracker
		 SET current_multiplier = 1.0, uptime_streak_hours = 0, updated_at = $1
		 WHERE last_disconnect IS NOT NULL
		   AND last_disconnect < $2
		   AND current_multiplier > 1.0`,
		now, now.Add(-time.Duration(AgeDisconnectResetMin)*time.Minute),
	)
	if affected, _ := result.RowsAffected(); affected > 0 {
		log.Printf("[AgeMultiplier] Reset %d nodes (disconnect >%d min)", affected, AgeDisconnectResetMin)
	}

	// 3. Increment streak hours for online nodes
	db.Exec(
		`UPDATE node_uptime_tracker
		 SET uptime_streak_hours = uptime_streak_hours + 1,
		     total_uptime_hours = total_uptime_hours + 1,
		     updated_at = $1
		 WHERE last_heartbeat > $2`,
		now, now.Add(-time.Duration(HeartbeatTimeoutMin)*time.Minute),
	)

	// 4. Calculate weekly uptime % for all nodes
	db.Exec(
		`UPDATE node_uptime_tracker
		 SET weekly_uptime_pct = LEAST(100.0,
		     (EXTRACT(EPOCH FROM (COALESCE(last_heartbeat, created_at) - GREATEST(created_at, NOW() - INTERVAL '7 days'))) /
		      EXTRACT(EPOCH FROM INTERVAL '7 days')) * 100
		 ), updated_at = $1`, now,
	)

	// 5. Upgrade multiplier for high-uptime nodes (weekly check — every Sunday)
	if now.Weekday() == time.Sunday && now.Hour() == 0 && now.Minute() < 5 {
		result, _ = db.Exec(
			`UPDATE node_uptime_tracker
			 SET current_multiplier = LEAST($1, current_multiplier + $2),
			     updated_at = $3
			 WHERE weekly_uptime_pct >= $4
			   AND last_heartbeat > NOW() - INTERVAL '2 minutes'
			   AND current_multiplier < $1`,
			AgeMultiplierMax, AgeMultiplierStep, now, AgeUptimeThreshold,
		)
		if affected, _ := result.RowsAffected(); affected > 0 {
			log.Printf("[AgeMultiplier] Upgraded %d nodes (+%.1fx)", affected, AgeMultiplierStep)
		}
	}
}

// ─── Epoch End: Yield Distribution ───────────────────────────

func StartEpochCron(db *sql.DB) {
	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		for range ticker.C {
			checkEpochEnd(db)
		}
	}()
	log.Println("[Epoch] Cron started (hourly check)")
}

func checkEpochEnd(db *sql.DB) {
	var epoch int
	var epochEnd time.Time
	var yieldPool float64
	var distributed bool

	err := db.QueryRow(
		`SELECT epoch, epoch_end, yield_pool_usd, yield_distributed
		 FROM sovereign_fund ORDER BY epoch DESC LIMIT 1`,
	).Scan(&epoch, &epochEnd, &yieldPool, &distributed)
	if err != nil || distributed || time.Now().Before(epochEnd) {
		return
	}

	log.Printf("[Epoch] Epoch %d ended. Distributing yield pool: $%.2f", epoch, yieldPool)

	// Get eligible nodes (multiplier >= 2.0, online in last 24h)
	rows, err := db.Query(
		`SELECT node_id, wallet_address, current_multiplier, tier, total_uptime_hours
		 FROM node_uptime_tracker
		 WHERE current_multiplier >= $1
		   AND last_heartbeat > NOW() - INTERVAL '24 hours'
		 ORDER BY current_multiplier DESC, total_uptime_hours DESC`,
		MinMultiplierForYield,
	)
	if err != nil {
		log.Printf("[Epoch] Error querying eligible nodes: %v", err)
		return
	}
	defer rows.Close()

	type eligibleNode struct {
		NodeID     string
		Wallet     string
		Multiplier float64
		Tier       string
		Uptime     int
	}
	var nodes []eligibleNode
	var totalWeight float64
	tierWeights := map[string]float64{"light": 1.0, "standard": 2.0, "archive": 3.0}

	for rows.Next() {
		var n eligibleNode
		rows.Scan(&n.NodeID, &n.Wallet, &n.Multiplier, &n.Tier, &n.Uptime)
		weight := n.Multiplier * tierWeights[n.Tier]
		totalWeight += weight
		nodes = append(nodes, n)
	}

	if len(nodes) == 0 || totalWeight == 0 {
		log.Printf("[Epoch] No eligible nodes for yield distribution")
		// Still mark as distributed and start new epoch
		db.Exec(`UPDATE sovereign_fund SET yield_distributed = true WHERE epoch = $1`, epoch)
		startNewEpoch(db, epoch)
		return
	}

	// Distribute yield proportionally
	for _, n := range nodes {
		weight := n.Multiplier * tierWeights[n.Tier]
		share := yieldPool * (weight / totalWeight)
		share = math.Round(share*1e6) / 1e6

		db.Exec(
			`UPDATE node_uptime_tracker SET epoch_earnings_usd = epoch_earnings_usd + $1 WHERE node_id = $2`,
			share, n.NodeID,
		)

		log.Printf("[Epoch] Node %s (%.1fx, %s): $%.4f yield", n.NodeID, n.Multiplier, n.Tier, share)
	}

	// Mark epoch as distributed
	db.Exec(
		`UPDATE sovereign_fund SET yield_distributed = true, eligible_nodes = $1 WHERE epoch = $2`,
		len(nodes), epoch,
	)
	db.Exec(
		`UPDATE sovereign_fund_totals SET total_yield_distributed_usd = total_yield_distributed_usd + $1 WHERE id = 1`,
		yieldPool,
	)

	log.Printf("[Epoch] Distributed $%.2f to %d nodes", yieldPool, len(nodes))

	// Start new epoch
	startNewEpoch(db, epoch)
}

func startNewEpoch(db *sql.DB, prevEpoch int) {
	newEpoch := prevEpoch + 1
	now := time.Now().UTC()
	end := now.Add(time.Duration(EpochDurationDays) * 24 * time.Hour)

	var circSupply float64
	db.QueryRow(`SELECT COALESCE(SUM(balance), 0) FROM users WHERE balance > 0`).Scan(&circSupply)

	db.Exec(
		`INSERT INTO sovereign_fund (epoch, epoch_start, epoch_end, circulating_supply)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (epoch) DO NOTHING`,
		newEpoch, now, end, circSupply,
	)
	db.Exec(`UPDATE sovereign_fund_totals SET current_epoch = $1 WHERE id = 1`, newEpoch)

	// Reset epoch earnings for all nodes
	db.Exec(`UPDATE node_uptime_tracker SET epoch_earnings_usd = 0`)

	log.Printf("[Epoch] New epoch %d started. Ends: %s", newEpoch, end.Format("2006-01-02"))
}

// ─── Enhanced Heartbeat Handler ──────────────────────────────
// Called from the existing node heartbeat route

func ProcessNaaSHeartbeat(db *sql.DB, nodeID, wallet, tier string, containersRunning int, hardwareProfile map[string]interface{}) {
	now := time.Now().UTC()

	// Upsert into uptime tracker
	_, err := db.Exec(
		`INSERT INTO node_uptime_tracker (node_id, wallet_address, tier, containers_running, hardware_profile, last_heartbeat, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $6)
		 ON CONFLICT (node_id) DO UPDATE SET
		     wallet_address = EXCLUDED.wallet_address,
		     tier = EXCLUDED.tier,
		     containers_running = EXCLUDED.containers_running,
		     hardware_profile = EXCLUDED.hardware_profile,
		     last_heartbeat = EXCLUDED.last_heartbeat,
		     last_disconnect = NULL,
		     updated_at = EXCLUDED.updated_at`,
		nodeID, wallet, tier, containersRunning, hardwareProfile, now,
	)
	if err != nil {
		log.Printf("[NaaS] Heartbeat error for %s: %v", nodeID, err)
	}
}

// ─── Public Fund Status ──────────────────────────────────────

func getFundStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totals struct {
			TotalBacking     float64 `json:"total_backing_usd"`
			TotalTreasury    float64 `json:"total_treasury_usd"`
			TotalYield       float64 `json:"total_yield_distributed_usd"`
			TotalRevenue     float64 `json:"total_revenue_all_time_usd"`
			FloorPrice       float64 `json:"floor_price_usd"`
			CurrentEpoch     int     `json:"current_epoch"`
			FundContract     string  `json:"fund_contract_address"`
			BackingVault     string  `json:"backing_vault_address"`
		}

		db.QueryRow(
			`SELECT total_backing_usd, total_treasury_usd, total_yield_distributed_usd,
			        total_revenue_all_time_usd, current_floor_price_usd, current_epoch,
			        fund_contract_address, backing_vault_address
			 FROM sovereign_fund_totals WHERE id = 1`,
		).Scan(
			&totals.TotalBacking, &totals.TotalTreasury, &totals.TotalYield,
			&totals.TotalRevenue, &totals.FloorPrice, &totals.CurrentEpoch,
			&totals.FundContract, &totals.BackingVault,
		)

		// Get circulating supply
		var circSupply float64
		db.QueryRow(`SELECT COALESCE(SUM(balance), 0) FROM users WHERE balance > 0`).Scan(&circSupply)

		// Calculate live floor price
		liveFloor := float64(0)
		if circSupply > 0 {
			liveFloor = totals.TotalBacking / circSupply
		}

		// Get active node count
		var activeNodes int
		db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'`).Scan(&activeNodes)

		// Get verified provider count
		var verifiedProviders int
		db.QueryRow(`SELECT COUNT(*) FROM verified_providers WHERE status = 'verified'`).Scan(&verifiedProviders)

		c.JSON(http.StatusOK, gin.H{
			"sovereign_fund": gin.H{
				"total_backing_usd":         totals.TotalBacking,
				"total_treasury_usd":        totals.TotalTreasury,
				"total_yield_distributed":   totals.TotalYield,
				"total_revenue_all_time":    totals.TotalRevenue,
				"floor_price_usd":           liveFloor,
				"circulating_supply":        circSupply,
				"current_epoch":             totals.CurrentEpoch,
				"fund_contract":             totals.FundContract,
				"backing_vault":             totals.BackingVault,
			},
			"network": gin.H{
				"active_nodes":       activeNodes,
				"verified_providers": verifiedProviders,
			},
			"revenue_split": gin.H{
				"backing_pct":  50,
				"treasury_pct": 20,
				"yield_pct":    30,
			},
			"axiom": "Every transaction funds the Sovereign Fund. GSTD value = total backing / circulating supply.",
		})
	}
}

func getBackingDetails(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var backingUSD float64
		var assets string
		db.QueryRow(`SELECT backing_usd, COALESCE(backing_assets::text,'{}') FROM sovereign_fund ORDER BY epoch DESC LIMIT 1`).Scan(&backingUSD, &assets)

		var totalBacking float64
		db.QueryRow(`SELECT total_backing_usd FROM sovereign_fund_totals WHERE id = 1`).Scan(&totalBacking)

		c.JSON(http.StatusOK, gin.H{
			"total_backing_usd":   totalBacking,
			"current_epoch_backing": backingUSD,
			"assets":              assets,
			"locked_forever":      true,
			"description":         "50% of all revenue is permanently locked in the Backing Vault. This creates a mathematically rising Floor Price for every GSTD token.",
		})
	}
}

func getFloorPrice(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalBacking float64
		db.QueryRow(`SELECT total_backing_usd FROM sovereign_fund_totals WHERE id = 1`).Scan(&totalBacking)

		var circSupply float64
		db.QueryRow(`SELECT COALESCE(SUM(balance), 0) FROM users WHERE balance > 0`).Scan(&circSupply)

		floorPrice := float64(0)
		if circSupply > 0 {
			floorPrice = totalBacking / circSupply
		}

		c.JSON(http.StatusOK, gin.H{
			"floor_price_usd":    floorPrice,
			"total_backing_usd":  totalBacking,
			"circulating_supply": circSupply,
			"formula":            "floor_price = total_backing_usd / circulating_supply",
			"guarantee":          "GSTD cannot mathematically fall below this price while backing exists in the smart contract.",
		})
	}
}

func getCurrentEpoch(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var epoch int
		var revenue, backing, treasury, yield float64
		var epochStart, epochEnd time.Time
		var distributed bool
		var eligible int

		db.QueryRow(
			`SELECT epoch, total_revenue_usd, backing_usd, treasury_usd, yield_pool_usd,
			        epoch_start, epoch_end, yield_distributed, eligible_nodes
			 FROM sovereign_fund ORDER BY epoch DESC LIMIT 1`,
		).Scan(&epoch, &revenue, &backing, &treasury, &yield, &epochStart, &epochEnd, &distributed, &eligible)

		remaining := time.Until(epochEnd)

		c.JSON(http.StatusOK, gin.H{
			"epoch":          epoch,
			"revenue_usd":    revenue,
			"backing_usd":    backing,
			"treasury_usd":   treasury,
			"yield_pool_usd": yield,
			"epoch_start":    epochStart.Format(time.RFC3339),
			"epoch_end":      epochEnd.Format(time.RFC3339),
			"remaining":      remaining.String(),
			"remaining_days": int(remaining.Hours() / 24),
			"distributed":    distributed,
			"eligible_nodes": eligible,
		})
	}
}

func getEpochHistory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(
			`SELECT epoch, total_revenue_usd, backing_usd, treasury_usd, yield_pool_usd,
			        floor_price_usd, eligible_nodes, yield_distributed, epoch_start, epoch_end
			 FROM sovereign_fund ORDER BY epoch DESC LIMIT 12`,
		)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"epochs": []interface{}{}})
			return
		}
		defer rows.Close()

		var epochs []gin.H
		for rows.Next() {
			var ep int
			var rev, back, treas, yield, floor float64
			var eligible int
			var dist bool
			var start, end time.Time
			rows.Scan(&ep, &rev, &back, &treas, &yield, &floor, &eligible, &dist, &start, &end)
			epochs = append(epochs, gin.H{
				"epoch": ep, "revenue": rev, "backing": back, "treasury": treas,
				"yield": yield, "floor_price": floor, "eligible_nodes": eligible,
				"distributed": dist, "start": start.Format("2006-01-02"), "end": end.Format("2006-01-02"),
			})
		}
		c.JSON(http.StatusOK, gin.H{"epochs": epochs})
	}
}

func getRevenueBreakdown(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(
			`SELECT source, COUNT(*), COALESCE(SUM(amount_usd),0),
			        COALESCE(SUM(backing_portion),0), COALESCE(SUM(treasury_portion),0), COALESCE(SUM(yield_portion),0)
			 FROM revenue_events
			 WHERE created_at > NOW() - INTERVAL '30 days'
			 GROUP BY source ORDER BY SUM(amount_usd) DESC`,
		)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"sources": []interface{}{}})
			return
		}
		defer rows.Close()

		var sources []gin.H
		for rows.Next() {
			var src string
			var count int64
			var total, back, treas, yield float64
			rows.Scan(&src, &count, &total, &back, &treas, &yield)
			sources = append(sources, gin.H{
				"source": src, "events": count, "total_usd": total,
				"to_backing": back, "to_treasury": treas, "to_yield": yield,
			})
		}
		c.JSON(http.StatusOK, gin.H{"period": "30d", "sources": sources})
	}
}

func getNodeLeaderboard(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(
			`SELECT node_id, wallet_address, tier, current_multiplier, weekly_uptime_pct,
			        total_uptime_hours, rpc_requests_served, epoch_earnings_usd
			 FROM node_uptime_tracker
			 ORDER BY current_multiplier DESC, total_uptime_hours DESC
			 LIMIT 50`,
		)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"nodes": []interface{}{}})
			return
		}
		defer rows.Close()

		var nodes []gin.H
		rank := 1
		for rows.Next() {
			var nodeID, wallet, tier string
			var mult, uptime, earnings float64
			var uptimeH int
			var rpcServed int64
			rows.Scan(&nodeID, &wallet, &tier, &mult, &uptime, &uptimeH, &rpcServed, &earnings)
			nodes = append(nodes, gin.H{
				"rank": rank, "node_id": nodeID[:8] + "...",
				"wallet": wallet[:8] + "..." + wallet[len(wallet)-4:],
				"tier": tier, "multiplier": mult, "uptime_pct": uptime,
				"uptime_hours": uptimeH, "requests_served": rpcServed, "epoch_earnings_usd": earnings,
			})
			rank++
		}
		c.JSON(http.StatusOK, gin.H{"leaderboard": nodes, "total": len(nodes)})
	}
}

func getFundYieldEstimate(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var yieldPool float64
		var epochEnd time.Time
		db.QueryRow(`SELECT yield_pool_usd, epoch_end FROM sovereign_fund ORDER BY epoch DESC LIMIT 1`).Scan(&yieldPool, &epochEnd)

		var eligibleCount int
		db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE current_multiplier >= $1 AND last_heartbeat > NOW() - INTERVAL '24 hours'`, MinMultiplierForYield).Scan(&eligibleCount)

		avgYield := float64(0)
		if eligibleCount > 0 {
			avgYield = yieldPool / float64(eligibleCount)
		}

		c.JSON(http.StatusOK, gin.H{
			"current_yield_pool_usd": yieldPool,
			"eligible_nodes":         eligibleCount,
			"avg_yield_per_node_usd": avgYield,
			"distribution_date":      epochEnd.Format("2006-01-02"),
			"min_multiplier":         MinMultiplierForYield,
			"note":                   "Higher Age Multiplier and Tier = larger share of yield pool",
		})
	}
}

// ─── Verified Provider Registration ──────────────────────────

func registerVerifiedProvider(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string  `json:"wallet_address"`
			LPAmount      float64 `json:"lp_token_amount"`
			TxHash        string  `json:"tx_hash"`
			NodeID        string  `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.WalletAddress == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet_address and lp_token_amount required"})
			return
		}

		minLP := 100.0 // Minimum LP tokens to become verified
		if req.LPAmount < minLP {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Minimum LP token lock is 100", "min_lp": minLP})
			return
		}

		expiresAt := time.Now().Add(365 * 24 * time.Hour) // 1 year validity
		var id int
		err := db.QueryRow(
			`INSERT INTO verified_providers (wallet_address, lp_token_amount, pol_tx_hash, node_id, status, verified_at, expires_at)
			 VALUES ($1, $2, $3, $4, 'verified', NOW(), $5)
			 ON CONFLICT (wallet_address) DO UPDATE SET
			     lp_token_amount = EXCLUDED.lp_token_amount,
			     pol_tx_hash = EXCLUDED.pol_tx_hash,
			     status = 'verified',
			     verified_at = NOW(),
			     expires_at = EXCLUDED.expires_at
			 RETURNING id`,
			req.WalletAddress, req.LPAmount, req.TxHash, req.NodeID, expiresAt,
		).Scan(&id)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Registration failed"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"provider_id": id,
			"status":      "verified",
			"lp_locked":   req.LPAmount,
			"expires_at":  expiresAt.Format("2006-01-02"),
			"benefits":    "Priority RPC routing with 2x revenue share. Guaranteed by Proof-of-Liquidity.",
		})
	}
}

func getProviderStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			wallet = c.GetHeader("X-Wallet-Address")
		}
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet query param required"})
			return
		}

		var status, txHash string
		var lpAmount float64
		var verifiedAt, expiresAt time.Time
		err := db.QueryRow(
			`SELECT status, lp_token_amount, COALESCE(pol_tx_hash,''), verified_at, expires_at
			 FROM verified_providers WHERE wallet_address = $1`, wallet,
		).Scan(&status, &lpAmount, &txHash, &verifiedAt, &expiresAt)

		if err != nil {
			c.JSON(http.StatusOK, gin.H{"verified": false, "status": "not_registered"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"verified":    status == "verified",
			"status":      status,
			"lp_locked":   lpAmount,
			"tx_hash":     txHash,
			"verified_at": verifiedAt.Format(time.RFC3339),
			"expires_at":  expiresAt.Format(time.RFC3339),
		})
	}
}

func getVerifiedProviders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var count int
		var totalLP float64
		db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(lp_token_amount),0) FROM verified_providers WHERE status = 'verified'`).Scan(&count, &totalLP)

		c.JSON(http.StatusOK, gin.H{
			"total_verified": count,
			"total_lp_locked": totalLP,
			"min_lp_required": 100,
			"description":     "Verified Providers lock LP tokens (TON/GSTD on STON.fi) to guarantee deep DEX liquidity and earn priority routing.",
		})
	}
}
