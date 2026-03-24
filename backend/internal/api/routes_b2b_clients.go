package api

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ═══════════════════════════════════════════════════════════════
// B2B Client Routes — Developer API Key Management & Billing
// ═══════════════════════════════════════════════════════════════

func SetupB2BClientRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	b2b := v1.Group("/b2b")
	{
		b2b.POST("/register", registerB2BClient(db))
		b2b.GET("/profile", getB2BProfile(db))
		b2b.POST("/topup", topUpBalance(db))
		b2b.POST("/regenerate-key", regenerateB2BAPIKey(db))
		b2b.GET("/usage", getUsageStats(db))
		b2b.GET("/usage/daily", getDailyUsage(db))
	}

	// Public: list available chains and pricing
	v1.GET("/rpc/chains", getRPCChains())
	v1.GET("/rpc/pricing", getRPCPricing())
}

// ─── Helpers ─────────────────────────────────────────────────

func generateB2BAPIKey() string {
	b := make([]byte, 32)
	rand.Read(b)
	return "gstd_b2b_" + hex.EncodeToString(b)
}

func hashB2BAPIKey(key string) string {
	h := sha256.Sum256([]byte(key))
	return hex.EncodeToString(h[:])
}

func authenticateB2BClient(db *sql.DB, c *gin.Context) (int, string, error) {
	apiKey := c.GetHeader("X-API-Key")
	if apiKey == "" {
		apiKey = strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
	}
	if apiKey == "" {
		walletAddr := c.GetHeader("X-Wallet-Address")
		if walletAddr == "" {
			return 0, "", fmt.Errorf("API key or wallet address required")
		}
		var clientID int
		var status string
		err := db.QueryRow(
			`SELECT id, status FROM b2b_clients WHERE wallet_address = $1 LIMIT 1`,
			walletAddr,
		).Scan(&clientID, &status)
		if err != nil {
			return 0, "", fmt.Errorf("client not found")
		}
		if status != "active" {
			return 0, "", fmt.Errorf("account suspended")
		}
		return clientID, walletAddr, nil
	}

	keyHash := hashB2BAPIKey(apiKey)
	var clientID int
	var status, wallet string
	err := db.QueryRow(
		`SELECT id, status, wallet_address FROM b2b_clients WHERE api_key_hash = $1`,
		keyHash,
	).Scan(&clientID, &status, &wallet)
	if err != nil {
		return 0, "", fmt.Errorf("invalid API key")
	}
	if status != "active" {
		return 0, "", fmt.Errorf("account suspended")
	}
	return clientID, wallet, nil
}

// ─── Register B2B Client ─────────────────────────────────────

func registerB2BClient(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			CompanyName   string `json:"company_name"`
			Email         string `json:"email"`
			WalletAddress string `json:"wallet_address"`
			Tier          string `json:"tier"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		if req.WalletAddress == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet_address required"})
			return
		}
		if req.CompanyName == "" {
			req.CompanyName = "Developer"
		}
		if req.Tier == "" {
			req.Tier = "starter"
		}

		// Check if already registered
		var existingID int
		err := db.QueryRow(`SELECT id FROM b2b_clients WHERE wallet_address = $1`, req.WalletAddress).Scan(&existingID)
		if err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Wallet already registered", "client_id": existingID})
			return
		}

		// Generate API key
		apiKey := generateB2BAPIKey()
		keyHash := hashB2BAPIKey(apiKey)

		rateLimits := map[string]int{"starter": 100, "pro": 500, "enterprise": 5000}
		rateLimit := rateLimits[req.Tier]
		if rateLimit == 0 {
			rateLimit = 100
		}

		var clientID int
		err = db.QueryRow(
			`INSERT INTO b2b_clients (company_name, email, wallet_address, api_key_hash, tier, rate_limit_rps)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			req.CompanyName, req.Email, req.WalletAddress, keyHash, req.Tier, rateLimit,
		).Scan(&clientID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Registration failed"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"client_id":      clientID,
			"api_key":        apiKey,
			"company_name":   req.CompanyName,
			"tier":           req.Tier,
			"rate_limit_rps": rateLimit,
			"endpoint":       "https://rpc.gstd.network/v1/{chain}",
			"important":      "Save your API key securely. It cannot be retrieved later.",
		})
	}
}

// ─── Get B2B Profile ─────────────────────────────────────────

func getB2BProfile(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID, wallet, err := authenticateB2BClient(db, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var profile struct {
			CompanyName   string  `json:"company_name"`
			Tier          string  `json:"tier"`
			BalanceUSD    float64 `json:"balance_usd"`
			BalanceGSTD   float64 `json:"balance_gstd"`
			BalanceStars  int     `json:"balance_stars"`
			RateLimitRPS  int     `json:"rate_limit_rps"`
			TotalRequests int64   `json:"total_requests"`
			TotalSpentUSD float64 `json:"total_spent_usd"`
			CreatedAt     string  `json:"created_at"`
		}

		err = db.QueryRow(
			`SELECT company_name, tier, balance_usd, balance_gstd, balance_stars,
			        rate_limit_rps, total_requests, total_spent_usd, created_at
			 FROM b2b_clients WHERE id = $1`, clientID,
		).Scan(
			&profile.CompanyName, &profile.Tier, &profile.BalanceUSD, &profile.BalanceGSTD,
			&profile.BalanceStars, &profile.RateLimitRPS, &profile.TotalRequests,
			&profile.TotalSpentUSD, &profile.CreatedAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load profile"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"client_id": clientID,
			"wallet":    wallet,
			"profile":   profile,
			"endpoint":  "https://rpc.gstd.network/v1/{chain}",
		})
	}
}

// ─── Top Up Balance ──────────────────────────────────────────

func topUpBalance(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID, _, err := authenticateB2BClient(db, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		var req struct {
			Amount   float64 `json:"amount"`
			Currency string  `json:"currency"` // usd, gstd, stars
			TxHash   string  `json:"tx_hash"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Amount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid amount"})
			return
		}

		currency := strings.ToLower(req.Currency)
		if currency == "" {
			currency = "gstd"
		}

		switch currency {
		case "usd", "usdt":
			_, err = db.Exec(`UPDATE b2b_clients SET balance_usd = balance_usd + $1, updated_at = NOW() WHERE id = $2`, req.Amount, clientID)
		case "gstd":
			_, err = db.Exec(`UPDATE b2b_clients SET balance_gstd = balance_gstd + $1, updated_at = NOW() WHERE id = $2`, req.Amount, clientID)
		case "stars":
			stars := int(req.Amount)
			_, err = db.Exec(`UPDATE b2b_clients SET balance_stars = balance_stars + $1, updated_at = NOW() WHERE id = $2`, stars, clientID)
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported currency. Use: usd, gstd, stars"})
			return
		}

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Top-up failed"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"amount":   req.Amount,
			"currency": currency,
			"tx_hash":  req.TxHash,
		})
	}
}

// ─── Regenerate API Key ──────────────────────────────────────

func regenerateB2BAPIKey(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID, _, err := authenticateB2BClient(db, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		newKey := generateB2BAPIKey()
		newHash := hashB2BAPIKey(newKey)

		_, err = db.Exec(`UPDATE b2b_clients SET api_key_hash = $1, updated_at = NOW() WHERE id = $2`, newHash, clientID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to regenerate key"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"api_key":   newKey,
			"important": "Old key is now invalid. Save this new key securely.",
		})
	}
}

// ─── Usage Stats ─────────────────────────────────────────────

func getUsageStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID, _, err := authenticateB2BClient(db, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		type chainStat struct {
			Chain    string  `json:"chain"`
			Requests int64   `json:"requests"`
			CostUSD  float64 `json:"cost_usd"`
			AvgLatMs float64 `json:"avg_latency_ms"`
		}

		rows, err := db.Query(
			`SELECT chain, COUNT(*), COALESCE(SUM(cost_usd),0), COALESCE(AVG(latency_ms),0)
			 FROM rpc_requests WHERE client_id = $1 AND created_at > NOW() - INTERVAL '30 days'
			 GROUP BY chain ORDER BY COUNT(*) DESC`, clientID,
		)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"chains": []interface{}{}, "total_requests": 0, "total_cost_usd": 0})
			return
		}
		defer rows.Close()

		var chains []chainStat
		var totalReqs int64
		var totalCost float64
		for rows.Next() {
			var cs chainStat
			rows.Scan(&cs.Chain, &cs.Requests, &cs.CostUSD, &cs.AvgLatMs)
			totalReqs += cs.Requests
			totalCost += cs.CostUSD
			chains = append(chains, cs)
		}

		c.JSON(http.StatusOK, gin.H{
			"period":         "30d",
			"chains":         chains,
			"total_requests": totalReqs,
			"total_cost_usd": totalCost,
		})
	}
}

func getDailyUsage(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID, _, err := authenticateB2BClient(db, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		rows, err := db.Query(
			`SELECT DATE(created_at) AS day, COUNT(*), COALESCE(SUM(cost_usd),0)
			 FROM rpc_requests WHERE client_id = $1 AND created_at > NOW() - INTERVAL '30 days'
			 GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 30`, clientID,
		)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"days": []interface{}{}})
			return
		}
		defer rows.Close()

		type dayRow struct {
			Day      string  `json:"day"`
			Requests int64   `json:"requests"`
			CostUSD  float64 `json:"cost_usd"`
		}
		var days []dayRow
		for rows.Next() {
			var d dayRow
			rows.Scan(&d.Day, &d.Requests, &d.CostUSD)
			days = append(days, d)
		}

		c.JSON(http.StatusOK, gin.H{"days": days})
	}
}

// ─── Public: Chains & Pricing ────────────────────────────────

func getRPCChains() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"chains": []gin.H{
				{"id": "ton", "name": "TON", "status": "live", "node_count": 0},
				{"id": "eth", "name": "Ethereum", "status": "live", "node_count": 0},
				{"id": "sol", "name": "Solana", "status": "live", "node_count": 0},
				{"id": "btc", "name": "Bitcoin", "status": "live", "node_count": 0},
				{"id": "bsc", "name": "BNB Chain", "status": "coming_soon", "node_count": 0},
				{"id": "arb", "name": "Arbitrum", "status": "coming_soon", "node_count": 0},
			},
		})
	}
}

func getRPCPricing() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"pricing": gin.H{
				"read":    gin.H{"per_request_usd": 0.000005, "description": "eth_getBalance, eth_call, ton_getAddressInfo, etc."},
				"write":   gin.H{"per_request_usd": 0.00005, "description": "eth_sendTransaction, ton_sendBoc, etc."},
				"archive": gin.H{"per_request_usd": 0.0001, "description": "eth_getLogs, debug_traceTransaction, etc."},
				"ai":      gin.H{"per_1k_tokens_usd": 0.001, "description": "AI inference via GSTD swarm models"},
			},
			"tiers": gin.H{
				"starter":    gin.H{"rate_limit_rps": 100, "description": "Free tier"},
				"pro":        gin.H{"rate_limit_rps": 500, "description": "Professional"},
				"enterprise": gin.H{"rate_limit_rps": 5000, "description": "Enterprise"},
			},
			"accepted_payment": []string{"GSTD", "TON", "USDT", "Telegram Stars"},
			"epoch_duration":   "30 days",
			"revenue_split": gin.H{
				"backing":  "50% — locked forever in Sovereign Fund",
				"treasury": "20% — development & marketing",
				"yield":    "30% — distributed to top node operators",
			},
			"updated_at": time.Now().UTC().Format(time.RFC3339),
		})
	}
}
