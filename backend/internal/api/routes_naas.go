package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// NaaS API Routes — Node-as-a-Service provider management
// Implements the GSTD NaaS Whitepaper: provider registration, heartbeat,
// RPC charge, revenue tracking, and statistics.

func SetupNaaSRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	naas := v1.Group("/naas")
	{
		naas.POST("/register", naasRegisterProvider(db))
		naas.POST("/heartbeat", naasHeartbeat(db))
		naas.POST("/charge", naasChargeGSTD(db))
		naas.GET("/providers", naasGetProviders(db))
		naas.GET("/stats", naasGetStats(db))
		naas.GET("/revenue", naasGetRevenue(db))
		naas.POST("/distribute", naasDistribute(db))
	}
}

// ── DB Tables (auto-migrated) ────────────────────────────────────────────

func MigrateNaaSTables(db *sql.DB) {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS naas_providers (
			id SERIAL PRIMARY KEY,
			wallet_address VARCHAR(128) NOT NULL UNIQUE,
			tier VARCHAR(20) NOT NULL DEFAULT 'micro',
			chains JSONB NOT NULL DEFAULT '[]',
			hardware JSONB NOT NULL DEFAULT '{}',
			rpc_endpoint VARCHAR(256),
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			reputation INT NOT NULL DEFAULT 10000,
			total_requests BIGINT NOT NULL DEFAULT 0,
			total_earned_gstd NUMERIC(18,9) NOT NULL DEFAULT 0,
			last_heartbeat TIMESTAMP,
			registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS naas_heartbeats (
			id SERIAL PRIMARY KEY,
			provider_wallet VARCHAR(128) NOT NULL,
			chains JSONB NOT NULL DEFAULT '[]',
			uptime_secs NUMERIC(10,1) NOT NULL DEFAULT 0,
			cpu_usage INT,
			memory_mb INT,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS naas_rpc_charges (
			id SERIAL PRIMARY KEY,
			api_key VARCHAR(128) NOT NULL,
			provider_wallet VARCHAR(128) NOT NULL,
			chain VARCHAR(20) NOT NULL,
			method VARCHAR(64) NOT NULL,
			amount_gstd NUMERIC(18,9) NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS naas_revenue (
			id SERIAL PRIMARY KEY,
			provider_wallet VARCHAR(128) NOT NULL,
			period VARCHAR(20) NOT NULL,
			total_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
			provider_gstd NUMERIC(18,9) NOT NULL DEFAULT 0,
			treasury_gstd NUMERIC(18,9) NOT NULL DEFAULT 0,
			buyback_gstd NUMERIC(18,9) NOT NULL DEFAULT 0,
			burned_gstd NUMERIC(18,9) NOT NULL DEFAULT 0,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_naas_heartbeats_wallet ON naas_heartbeats(provider_wallet)`,
		`CREATE INDEX IF NOT EXISTS idx_naas_rpc_charges_provider ON naas_rpc_charges(provider_wallet)`,
		`CREATE INDEX IF NOT EXISTS idx_naas_rpc_charges_api_key ON naas_rpc_charges(api_key)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			// Tables may already exist with slightly different schema — ignore
		}
	}
}

// ── Handlers ─────────────────────────────────────────────────────────────

func naasRegisterProvider(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet      string                 `json:"wallet"`
			Tier        string                 `json:"tier"`
			Chains      []map[string]interface{} `json:"chains"`
			Hardware    map[string]interface{} `json:"hardware"`
			RPCEndpoint string                 `json:"rpcEndpoint"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}

		_, err := db.Exec(`
			INSERT INTO naas_providers (wallet_address, tier, chains, hardware, rpc_endpoint)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (wallet_address) DO UPDATE SET
				tier = EXCLUDED.tier,
				chains = EXCLUDED.chains,
				hardware = EXCLUDED.hardware,
				rpc_endpoint = EXCLUDED.rpc_endpoint,
				status = 'active',
				last_heartbeat = NOW(),
				updated_at = NOW()
		`, req.Wallet, req.Tier, naasToJSON(req.Chains), naasToJSON(req.Hardware), req.RPCEndpoint)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "registration failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":  "registered",
			"wallet":  req.Wallet,
			"tier":    req.Tier,
			"chains":  len(req.Chains),
			"message": "NaaS Provider registered successfully",
		})
	}
}

func naasHeartbeat(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet string   `json:"wallet"`
			Chains []string `json:"chains"`
			Uptime float64  `json:"uptime"`
			Stats  struct {
				CPU    int `json:"cpu"`
				Memory int `json:"memory"`
			} `json:"stats"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid heartbeat"})
			return
		}

		// Update provider last_heartbeat
		db.Exec(`UPDATE naas_providers SET last_heartbeat = NOW(), updated_at = NOW() WHERE wallet_address = $1`, req.Wallet)

		// Record heartbeat
		db.Exec(`INSERT INTO naas_heartbeats (provider_wallet, chains, uptime_secs, cpu_usage, memory_mb) VALUES ($1, $2, $3, $4, $5)`,
			req.Wallet, naasToJSON(req.Chains), req.Uptime, req.Stats.CPU, req.Stats.Memory)

		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}

func naasChargeGSTD(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			APIKey         string  `json:"api_key"`
			AmountGSTD     float64 `json:"amount_gstd"`
			Chain          string  `json:"chain"`
			Method         string  `json:"method"`
			ProviderWallet string  `json:"provider_wallet"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid charge request"})
			return
		}

		// Record the charge
		db.Exec(`INSERT INTO naas_rpc_charges (api_key, provider_wallet, chain, method, amount_gstd) VALUES ($1, $2, $3, $4, $5)`,
			req.APIKey, req.ProviderWallet, req.Chain, req.Method, req.AmountGSTD)

		// Update provider stats
		db.Exec(`UPDATE naas_providers SET total_requests = total_requests + 1, total_earned_gstd = total_earned_gstd + $1, updated_at = NOW() WHERE wallet_address = $2`,
			req.AmountGSTD, req.ProviderWallet)

		c.JSON(http.StatusOK, gin.H{"charged": true, "amount_gstd": req.AmountGSTD})
	}
}

func naasGetProviders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(`
			SELECT wallet_address, tier, chains, status, reputation, total_requests, total_earned_gstd, last_heartbeat, registered_at
			FROM naas_providers
			WHERE status = 'active'
			ORDER BY total_earned_gstd DESC
			LIMIT 100`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
			return
		}
		defer rows.Close()

		var providers []gin.H
		for rows.Next() {
			var wallet, tier, chains, status string
			var reputation int
			var totalReqs int64
			var totalEarned float64
			var lastHB, regAt *time.Time
			rows.Scan(&wallet, &tier, &chains, &status, &reputation, &totalReqs, &totalEarned, &lastHB, &regAt)
			providers = append(providers, gin.H{
				"wallet":       wallet,
				"tier":         tier,
				"chains_json":  chains,
				"status":       status,
				"reputation":   reputation,
				"total_reqs":   totalReqs,
				"total_earned": totalEarned,
				"last_hb":      lastHB,
				"registered":   regAt,
			})
		}

		c.JSON(http.StatusOK, gin.H{"providers": providers, "count": len(providers)})
	}
}

func naasGetStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalProviders, activeProviders int
		var totalRequests int64
		var totalEarned float64
		db.QueryRow(`SELECT COUNT(*), COUNT(*) FILTER(WHERE status='active'), COALESCE(SUM(total_requests),0), COALESCE(SUM(total_earned_gstd),0) FROM naas_providers`).
			Scan(&totalProviders, &activeProviders, &totalRequests, &totalEarned)

		var chargesLast24h int64
		db.QueryRow(`SELECT COUNT(*) FROM naas_rpc_charges WHERE created_at > NOW() - INTERVAL '24 hours'`).Scan(&chargesLast24h)

		c.JSON(http.StatusOK, gin.H{
			"total_providers":  totalProviders,
			"active_providers": activeProviders,
			"total_rpc_requests": totalRequests,
			"total_gstd_earned": totalEarned,
			"charges_24h":       chargesLast24h,
			"supported_chains":  16,
			"protocol": gin.H{
				"burn_rate":     0.03,
				"treasury_rate": 0.30,
				"provider_rate": 0.60,
				"buyback_rate":  0.07,
			},
			"tiers": []gin.H{
				{"name": "Explorer", "min_stake": 1000, "max_chains": 3, "bonus": "0%"},
				{"name": "Provider", "min_stake": 10000, "max_chains": 10, "bonus": "+10%"},
				{"name": "Validator", "min_stake": 50000, "max_chains": 25, "bonus": "+25%"},
				{"name": "Sovereign", "min_stake": 500000, "max_chains": 50, "bonus": "+50%"},
			},
		})
	}
}

func naasGetRevenue(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet required"})
			return
		}

		var totalEarned float64
		db.QueryRow(`SELECT COALESCE(SUM(amount_gstd), 0) FROM naas_rpc_charges WHERE provider_wallet = $1`, wallet).Scan(&totalEarned)

		gstdPrice := 0.0001 // Fallback
		db.QueryRow(`SELECT COALESCE(price_usd, 0.0001) FROM gstd_market_data ORDER BY timestamp DESC LIMIT 1`).Scan(&gstdPrice)

		c.JSON(http.StatusOK, gin.H{
			"totalUsd": totalEarned * gstdPrice,
			"totalGstd": totalEarned,
			"byChain":  map[string]float64{},
		})
	}
}

func naasDistribute(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet       string  `json:"wallet"`
			ProviderGSTD float64 `json:"provider_gstd"`
			TreasuryGSTD float64 `json:"treasury_gstd"`
			BuybackGSTD  float64 `json:"buyback_gstd"`
			BurnGSTD     float64 `json:"burn_gstd"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid distribution"})
			return
		}

		period := time.Now().Format("2006-01-02T15")
		db.Exec(`INSERT INTO naas_revenue (provider_wallet, period, provider_gstd, treasury_gstd, buyback_gstd, burned_gstd) VALUES ($1, $2, $3, $4, $5, $6)`,
			req.Wallet, period, req.ProviderGSTD, req.TreasuryGSTD, req.BuybackGSTD, req.BurnGSTD)

		c.JSON(http.StatusOK, gin.H{"status": "distributed", "burned": req.BurnGSTD})
	}
}

// Helper
func naasToJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}
