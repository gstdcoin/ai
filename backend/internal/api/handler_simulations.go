package api

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"distributed-computing-platform/internal/services"
)

// SimulationsHandler manages paid AI swarm simulations
type SimulationsHandler struct {
	db       *sql.DB
	mirofish *services.MiroFishService
	escrow   *services.EscrowService
}

// NewSimulationsHandler creates a new simulations handler
func NewSimulationsHandler(db *sql.DB, mirofish *services.MiroFishService, escrow *services.EscrowService) *SimulationsHandler {
	return &SimulationsHandler{db: db, mirofish: mirofish, escrow: escrow}
}

// simulationCatalogEntry represents an available simulation type
type simulationCatalogEntry struct {
	ID          string  `json:"id"`
	Category    string  `json:"category"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Icon        string  `json:"icon"`
	PriceGSTD   float64 `json:"price_gstd"`
	AgentCount  int     `json:"agent_count"`
	Duration    int     `json:"duration_rounds"`
	Features    []string `json:"features"`
}

// GetCatalog returns available simulation categories with pricing
func (h *SimulationsHandler) GetCatalog(c *gin.Context) {
	catalog := []simulationCatalogEntry{
		{
			ID:          "crypto",
			Category:    "crypto",
			Title:       "₿ Crypto Market Simulation",
			Description: "Multi-agent swarm analyzes real-time crypto market data from CoinGecko. 200+ AI agents simulate market behavior, predict price movements, detect momentum shifts.",
			Icon:        "₿",
			PriceGSTD:   25.0,
			AgentCount:  200,
			Duration:    100,
			Features:    []string{"Real CoinGecko data", "200+ AI agents", "Price prediction", "Trend analysis", "Stop-loss recommendations"},
		},
		{
			ID:          "forex",
			Category:    "forex",
			Title:       "💱 Forex Exchange Simulation",
			Description: "Institutional-grade forex analysis. AI agents process ECB exchange rates and simulate currency pair movements. Covers EUR/USD, GBP/USD, JPY pairs.",
			Icon:        "💱",
			PriceGSTD:   20.0,
			AgentCount:  200,
			Duration:    100,
			Features:    []string{"ECB live rates", "Major currency pairs", "Macro trend analysis", "Entry/exit zones", "Risk assessment"},
		},
		{
			ID:          "polymarket",
			Category:    "polymarket",
			Title:       "🗳️ Prediction Market Analysis",
			Description: "Analyze real Polymarket event data. AI agents evaluate current odds, detect mispriced outcomes, and predict market movements on active events.",
			Icon:        "🗳️",
			PriceGSTD:   15.0,
			AgentCount:  200,
			Duration:    100,
			Features:    []string{"Polymarket live data", "Outcome probability", "Mispricing detection", "Event analysis", "Confidence scoring"},
		},
		{
			ID:          "tech-trends",
			Category:    "tech-trends",
			Title:       "📡 Tech Trends Intelligence",
			Description: "Venture-grade tech trend analysis. AI agents process HackerNews data to identify emerging technologies, market opportunities, and investment signals.",
			Icon:        "📡",
			PriceGSTD:   10.0,
			AgentCount:  200,
			Duration:    100,
			Features:    []string{"HackerNews live data", "Trend detection", "Sector analysis", "Investment signals", "Startup opportunities"},
		},
		{
			ID:          "custom",
			Category:    "custom",
			Title:       "🧪 Custom Scenario",
			Description: "Define your own simulation scenario. Upload seed data, describe what you want to predict, and let the swarm intelligence engine process it.",
			Icon:        "🧪",
			PriceGSTD:   30.0,
			AgentCount:  200,
			Duration:    100,
			Features:    []string{"Custom seed data", "Any scenario", "Full report", "Deep interaction", "Emergent patterns"},
		},
	}

	c.JSON(http.StatusOK, gin.H{"catalog": catalog})
}

// LaunchSimulation launches a paid swarm AI simulation
func (h *SimulationsHandler) LaunchSimulation(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Wallet required"})
		return
	}
	wallet := walletAddress.(string)

	var req struct {
		Category    string `json:"category" binding:"required"`
		Scenario    string `json:"scenario"`    // Custom scenario text (optional for preset categories)
		SeedData    string `json:"seed_data"`   // Additional seed material
		AgentCount  int    `json:"agent_count"` // Override agent count (default 200)
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "category is required"})
		return
	}

	// Get price for category
	price := getCategoryPrice(req.Category)
	if price <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid category"})
		return
	}

	ctx := c.Request.Context()

	// Check balance from 'users' table (same as signal purchases)
	var balance float64
	h.db.QueryRowContext(ctx,
		"SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1", wallet).Scan(&balance)
	if balance < price {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error":    "Insufficient GSTD balance",
			"required": price,
			"balance":  balance,
		})
		return
	}

	// Use transaction for atomicity (same pattern as BuySignal)
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction error"})
		return
	}
	defer tx.Rollback()

	// Deduct from gstd_balance first, fallback to balance
	_, err = tx.ExecContext(ctx,
		"UPDATE users SET gstd_balance = GREATEST(COALESCE(gstd_balance, 0) - $1, 0), updated_at = NOW() WHERE wallet_address = $2",
		price, wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment failed"})
		return
	}

	// Create simulation record
	simID := fmt.Sprintf("SIM-%d", time.Now().UnixNano()%1000000000)
	agentCount := 200
	if req.AgentCount > 0 && req.AgentCount <= 500 {
		agentCount = req.AgentCount
	}

	scenario := getCategoryScenario(req.Category)
	if req.Category == "custom" && req.Scenario != "" {
		scenario = req.Scenario
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO mirofish_simulations 
		(id, wallet_address, category, scenario, seed_data, agent_count, price_gstd, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'processing', NOW(), NOW())`,
		simID, wallet, req.Category, scenario, req.SeedData, agentCount, price)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create simulation"})
		return
	}

	// Record purchase
	tx.ExecContext(ctx, `
		INSERT INTO simulation_purchases (simulation_id, wallet_address, amount_gstd, created_at)
		VALUES ($1, $2, $3, NOW())`, simID, wallet, price)

	// Commit transaction
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction commit failed"})
		return
	}

	// Revenue split: 50% Gold Reserve, 20% Compute Nodes, 30% Platform
	go services.DistributeSignalPurchaseRevenue(context.Background(), h.db, simID, price)

	// Launch simulation asynchronously
	go h.runSimulation(simID, req.Category, scenario, req.SeedData, agentCount)

	log.Printf("⚡ Simulation %s launched by %s for %.1f GSTD (%s)", simID, wallet[:16], price, req.Category)

	c.JSON(http.StatusOK, gin.H{
		"simulation_id": simID,
		"category":      req.Category,
		"price_gstd":    price,
		"agent_count":   agentCount,
		"status":        "processing",
		"message":       "Simulation launched! AI swarm is processing...",
	})
}

// runSimulation executes the AI swarm simulation asynchronously
func (h *SimulationsHandler) runSimulation(simID, category, scenario, seedData string, agentCount int) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	start := time.Now()

	if h.mirofish == nil {
		log.Printf("⚠️ Swarm AI service not available for simulation %s", simID)
		h.db.Exec("UPDATE mirofish_simulations SET status = 'failed', result_report = 'AI service unavailable', updated_at = NOW() WHERE id = $1", simID)
		return
	}

	// Build seed
	seed := map[string]interface{}{
		"category":  category,
		"custom_seed": seedData,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	result, err := h.mirofish.CreateAndRunSimulation(ctx, services.SimulationRequest{
		Title:       fmt.Sprintf("⚡ %s Simulation", category),
		Scenario:    scenario,
		RealitySeed: seed,
		AgentCount:  agentCount,
		Platforms:   []string{"twitter", "reddit"},
		Duration:    100,
	})

	computeMs := int(time.Since(start).Milliseconds())

	if err != nil {
		log.Printf("⚠️ Simulation %s failed: %v", simID, err)
		h.db.Exec("UPDATE mirofish_simulations SET status = 'failed', result_report = $2, compute_ms = $3, updated_at = NOW() WHERE id = $1",
			simID, fmt.Sprintf("Simulation failed: %v", err), computeMs)
		return
	}

	// Build full report
	report := fmt.Sprintf("# 📊 %s Simulation Report\n\n", category)
	report += fmt.Sprintf("**Confidence:** %.0f%%\n", result.Confidence*100)
	report += fmt.Sprintf("**Agents:** %d\n", agentCount)
	report += fmt.Sprintf("**Compute Time:** %dms\n\n", computeMs)
	report += "## Key Predictions\n\n"
	for i, p := range result.Predictions {
		report += fmt.Sprintf("%d. **%s** (%.0f%% probability, %s impact)\n   %s\n\n",
			i+1, p.Category, p.Probability*100, p.Impact, p.Description)
	}
	if len(result.EmergentPatterns) > 0 {
		report += "## Emergent Patterns\n\n"
		for _, p := range result.EmergentPatterns {
			report += fmt.Sprintf("- 🔮 %s\n", p)
		}
	}
	report += fmt.Sprintf("\n## Summary\n\n%s", result.Report)

	summary := result.Report
	if len(summary) > 300 {
		summary = summary[:300] + "..."
	}

	// Update simulation with results
	h.db.Exec(`UPDATE mirofish_simulations SET 
		status = 'completed', 
		result_report = $2, 
		result_summary = $3,
		confidence = $4, 
		compute_ms = $5, 
		predictions_count = $6,
		completed_at = NOW(),
		updated_at = NOW()
		WHERE id = $1`,
		simID, report, summary, result.Confidence, computeMs, len(result.Predictions))

	log.Printf("⚡ Simulation %s completed: %d predictions, %.0f%% confidence, %dms",
		simID, len(result.Predictions), result.Confidence*100, computeMs)
}

// GetMySimulations returns a user's simulation history
func (h *SimulationsHandler) GetMySimulations(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Wallet required"})
		return
	}
	wallet := walletAddress.(string)

	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT id, category, scenario, agent_count, price_gstd, status, 
		       COALESCE(result_summary, ''), COALESCE(confidence, 0), 
		       COALESCE(compute_ms, 0), COALESCE(predictions_count, 0),
		       created_at, COALESCE(completed_at, created_at)
		FROM mirofish_simulations 
		WHERE wallet_address = $1 
		ORDER BY created_at DESC LIMIT 50`, wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch simulations"})
		return
	}
	defer rows.Close()

	var sims []gin.H
	for rows.Next() {
		var id, category, scenario, status, summary string
		var agentCount, computeMs, predictionsCount int
		var priceGSTD, confidence float64
		var createdAt, completedAt time.Time
		if rows.Scan(&id, &category, &scenario, &agentCount, &priceGSTD, &status,
			&summary, &confidence, &computeMs, &predictionsCount,
			&createdAt, &completedAt) == nil {
			sims = append(sims, gin.H{
				"id":                id,
				"category":          category,
				"scenario":          scenario,
				"agent_count":       agentCount,
				"price_gstd":        priceGSTD,
				"status":            status,
				"result_summary":    summary,
				"confidence":        confidence,
				"compute_ms":        computeMs,
				"predictions_count": predictionsCount,
				"created_at":        createdAt.Format(time.RFC3339),
				"completed_at":      completedAt.Format(time.RFC3339),
			})
		}
	}
	if sims == nil {
		sims = []gin.H{}
	}

	c.JSON(http.StatusOK, gin.H{"simulations": sims})
}

// GetSimulationResult returns the full result of a simulation
func (h *SimulationsHandler) GetSimulationResult(c *gin.Context) {
	simID := c.Param("id")
	if simID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Simulation ID required"})
		return
	}

	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Wallet required"})
		return
	}
	wallet := walletAddress.(string)

	var id, category, status, report, summary string
	var agentCount, computeMs, predictionsCount int
	var priceGSTD, confidence float64
	var createdAt time.Time
	var completedAt sql.NullTime

	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT id, category, agent_count, price_gstd, status, 
		       COALESCE(result_report, ''), COALESCE(result_summary, ''),
		       COALESCE(confidence, 0), COALESCE(compute_ms, 0), COALESCE(predictions_count, 0),
		       created_at, completed_at
		FROM mirofish_simulations 
		WHERE id = $1 AND wallet_address = $2`, simID, wallet).Scan(
		&id, &category, &agentCount, &priceGSTD, &status,
		&report, &summary, &confidence, &computeMs, &predictionsCount,
		&createdAt, &completedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Simulation not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch simulation"})
		return
	}

	result := gin.H{
		"id":                id,
		"category":          category,
		"agent_count":       agentCount,
		"price_gstd":        priceGSTD,
		"status":            status,
		"result_report":     report,
		"result_summary":    summary,
		"confidence":        confidence,
		"compute_ms":        computeMs,
		"predictions_count": predictionsCount,
		"created_at":        createdAt.Format(time.RFC3339),
	}
	if completedAt.Valid {
		result["completed_at"] = completedAt.Time.Format(time.RFC3339)
	}

	c.JSON(http.StatusOK, result)
}

// GetSimulationStats returns platform-wide simulation stats
func (h *SimulationsHandler) GetSimulationStats(c *gin.Context) {
	var totalSims, completedSims, activeSims int
	var totalRevenue float64
	var uniqueUsers int

	h.db.QueryRowContext(c.Request.Context(),
		"SELECT COUNT(*) FROM mirofish_simulations").Scan(&totalSims)
	h.db.QueryRowContext(c.Request.Context(),
		"SELECT COUNT(*) FROM mirofish_simulations WHERE status = 'completed'").Scan(&completedSims)
	h.db.QueryRowContext(c.Request.Context(),
		"SELECT COUNT(*) FROM mirofish_simulations WHERE status = 'processing'").Scan(&activeSims)
	h.db.QueryRowContext(c.Request.Context(),
		"SELECT COALESCE(SUM(price_gstd), 0) FROM mirofish_simulations WHERE status != 'failed'").Scan(&totalRevenue)
	h.db.QueryRowContext(c.Request.Context(),
		"SELECT COUNT(DISTINCT wallet_address) FROM mirofish_simulations").Scan(&uniqueUsers)

	// Recent simulations (public, anonymized)
	rows, _ := h.db.QueryContext(c.Request.Context(), `
		SELECT id, category, status, COALESCE(confidence, 0), COALESCE(predictions_count, 0), created_at
		FROM mirofish_simulations 
		ORDER BY created_at DESC LIMIT 10`)
	var recent []gin.H
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, category, status string
			var confidence float64
			var predictionsCount int
			var createdAt time.Time
			if rows.Scan(&id, &category, &status, &confidence, &predictionsCount, &createdAt) == nil {
				recent = append(recent, gin.H{
					"id":                id,
					"category":          category,
					"status":            status,
					"confidence":        confidence,
					"predictions_count": predictionsCount,
					"created_at":        createdAt.Format(time.RFC3339),
				})
			}
		}
	}
	if recent == nil {
		recent = []gin.H{}
	}

	c.JSON(http.StatusOK, gin.H{
		"total_simulations":    totalSims,
		"completed_simulations": completedSims,
		"active_simulations":   activeSims,
		"total_revenue_gstd":   totalRevenue,
		"unique_users":         uniqueUsers,
		"recent_simulations":   recent,
	})
}

// ─── Route Registration ─────────────────────────────────────────

func SetupSimulationRoutes(v1 *gin.RouterGroup, h *SimulationsHandler) {
	v1.GET("/simulations/catalog", h.GetCatalog)
	v1.GET("/simulations/stats", h.GetSimulationStats)
}

func SetupSimulationProtectedRoutes(protected *gin.RouterGroup, h *SimulationsHandler) {
	protected.POST("/simulations/launch", h.LaunchSimulation)
	protected.GET("/simulations/my", h.GetMySimulations)
	protected.GET("/simulations/results/:id", h.GetSimulationResult)
}

// ─── Helpers ────────────────────────────────────────────────────

func getCategoryPrice(category string) float64 {
	prices := map[string]float64{
		"crypto":      25.0,
		"forex":       20.0,
		"polymarket":  15.0,
		"tech-trends": 10.0,
		"custom":      30.0,
	}
	if p, ok := prices[category]; ok {
		return p
	}
	return 0
}

func getCategoryScenario(category string) string {
	scenarios := map[string]string{
		"crypto": "You are an expert crypto hedge fund manager. Analyze the real-time cryptocurrency market data I provide (CoinGecko). Output a concrete, actionable TRADING SIGNAL: BUY, SELL, or HOLD. Include specific entry prices, target prices, and a tight stop-loss. Provide a concise rationale using the trending volumes and dominance. Make it sound professional and strictly financial.",
		"forex":  "You are an institutional Forex trader. Analyze the real-time forex exchange rates I provide (ECB/open APIs). Output a concrete TRADING SIGNAL for the most volatile pair (e.g., EUR/USD, GBP/USD). Specify Long or Short, entry zone, take profit, and stop loss. Focus heavily on macro trends and fiat currency momentum.",
		"polymarket": "You are an expert prediction market analyst. Analyze the real-time Polymarket events data I provide. For the most interesting or high-volume active event, output a concrete TRADING SIGNAL: Buy YES or Buy NO. Include the current outcome prices, the confidence level of your prediction, and why the market is currently mispriced.",
		"tech-trends": "You are a Silicon Valley venture capitalist. Analyze the real-time HackerNews data I provide. Identify the dominant tech trend (AI, Crypto, SaaS, etc.) right now. Output a concrete INVESTMENT SIGNAL for specific public equities or crypto protocols that benefit from this exact trend. Include ticker symbols and investment timeframe.",
		"custom": "You are an expert analyst. Analyze the provided data and scenario carefully. Simulate the behavior of multiple agents and stakeholders. Output a detailed prediction report with confidence levels, key outcomes, and actionable recommendations.",
	}
	if s, ok := scenarios[category]; ok {
		return s
	}
	return scenarios["custom"]
}
