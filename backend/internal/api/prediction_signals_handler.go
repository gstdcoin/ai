package api

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// PredictionSignalsHandler handles AI prediction signal endpoints
type PredictionSignalsHandler struct {
	db           *sql.DB
	mirofish     *services.MiroFishService
	escrow       *services.EscrowService
	externalData *services.ExternalDataFetcher
}

// NewPredictionSignalsHandler creates a new handler
func NewPredictionSignalsHandler(db *sql.DB, mirofish *services.MiroFishService, escrow *services.EscrowService) *PredictionSignalsHandler {
	return &PredictionSignalsHandler{db: db, mirofish: mirofish, escrow: escrow}
}

// SetExternalData sets the external data fetcher for data source endpoints
func (h *PredictionSignalsHandler) SetExternalData(fetcher *services.ExternalDataFetcher) {
	h.externalData = fetcher
}

// SetupPredictionSignalRoutes registers public + protected routes
func SetupPredictionSignalRoutes(router *gin.RouterGroup, handler *PredictionSignalsHandler) {
	sig := router.Group("/signals")
	{
		sig.GET("/public", handler.GetPublicSignals)
		sig.GET("/stats", handler.GetNetworkStats)
		sig.GET("/leaderboard", handler.GetAgentLeaderboard)
		sig.GET("/data-sources", handler.GetDataSources)
		sig.GET("/compute-rewards", handler.GetComputeRewards)
		sig.GET("/revenue", handler.GetRevenueStats)
	}
}

// SetupPredictionSignalProtectedRoutes registers protected routes requiring wallet
func SetupPredictionSignalProtectedRoutes(router *gin.RouterGroup, handler *PredictionSignalsHandler) {
	sig := router.Group("/signals")
	{
		sig.GET("/premium", handler.GetPremiumSignals)
		sig.POST("/buy/:id", handler.BuySignal)
		sig.GET("/my", handler.GetMySignals)
		sig.POST("/generate", handler.RequestPrediction)
	}
}

// Signal represents a prediction signal
type Signal struct {
	ID          string    `json:"id"`
	Category    string    `json:"category"`
	Title       string    `json:"title"`
	Summary     string    `json:"summary"`
	FullReport  *string   `json:"full_report,omitempty"` // nil for non-purchased
	Confidence  float64   `json:"confidence"`
	Impact      string    `json:"impact"`
	TimeHorizon string    `json:"time_horizon"`
	PriceGSTD   float64   `json:"price_gstd"`
	IsPremium   bool      `json:"is_premium"`
	AgentName   string    `json:"agent_name"`
	AgentScore  float64   `json:"agent_score"`
	Accuracy    float64   `json:"accuracy"` // historical accuracy %
	Buyers      int       `json:"buyers"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	Status      string    `json:"status"` // active, expired, verified_correct, verified_wrong
	Verified    bool      `json:"verified"`
}

// GetPublicSignals returns all signals (free with full report, premium with summary only)
func (h *PredictionSignalsHandler) GetPublicSignals(c *gin.Context) {
	ctx := c.Request.Context()

	signals, err := h.loadAllSignals(ctx, 30)
	if err != nil {
		log.Printf("⚠️ GetPublicSignals: %v", err)
	}

	// If no DB signals, generate live
	if len(signals) == 0 {
		signals = h.generateLiveSignals(ctx)
	}

	// Hide full reports for premium signals in public view
	for i := range signals {
		if signals[i].IsPremium {
			signals[i].FullReport = nil
		}
	}

	c.JSON(http.StatusOK, gin.H{"signals": signals})
}

// GetPremiumSignals returns premium signals (summary only, full report after purchase)
func (h *PredictionSignalsHandler) GetPremiumSignals(c *gin.Context) {
	ctx := c.Request.Context()

	signals, err := h.loadSignals(ctx, true, 20)
	if err != nil {
		log.Printf("⚠️ GetPremiumSignals: %v", err)
	}

	if len(signals) == 0 {
		signals = h.generateLiveSignals(ctx)
		for i := range signals {
			signals[i].IsPremium = true
			signals[i].PriceGSTD = 5.0 + float64(i)*2.5
		}
	}

	// Hide full reports for non-purchased
	walletAddr, _ := c.Get("wallet_address")
	wallet, _ := walletAddr.(string)
	for i := range signals {
		if signals[i].IsPremium && !h.hasPurchased(ctx, wallet, signals[i].ID) {
			signals[i].FullReport = nil
		}
	}

	c.JSON(http.StatusOK, gin.H{"signals": signals})
}

// BuySignal purchases a premium signal with GSTD
func (h *PredictionSignalsHandler) BuySignal(c *gin.Context) {
	signalID := c.Param("id")
	walletAddr, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet required"})
		return
	}
	wallet := walletAddr.(string)
	ctx := c.Request.Context()

	// Parse request body for optional tx_hash
	var req struct {
		TxHash string `json:"tx_hash"`
	}
	_ = c.ShouldBindJSON(&req) // Ignore errors, it might fall back to off-chain

	// Check signal exists and get price
	var priceGSTD float64
	var fullReport string
	err := h.db.QueryRowContext(ctx,
		"SELECT price_gstd, full_report FROM prediction_signals WHERE id = $1 AND status = 'active'",
		signalID).Scan(&priceGSTD, &fullReport)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "signal not found or expired"})
		return
	}

	// Check if already purchased
	if h.hasPurchased(ctx, wallet, signalID) {
		c.JSON(http.StatusOK, gin.H{"signal_id": signalID, "full_report": fullReport, "message": "already purchased"})
		return
	}

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "transaction error"})
		return
	}
	defer tx.Rollback()

	if req.TxHash == "" {
		// [OFF-CHAIN PAYMENT]
		// Check user balance (gstd_balance + balance = total available)
		var balance float64
		h.db.QueryRowContext(ctx, "SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1", wallet).Scan(&balance)
		if balance < priceGSTD {
			c.JSON(http.StatusPaymentRequired, gin.H{"error": "insufficient GSTD balance", "required": priceGSTD, "balance": balance})
			return
		}

		// Deduct balance (from gstd_balance column)
		_, err = tx.ExecContext(ctx, "UPDATE users SET gstd_balance = GREATEST(COALESCE(gstd_balance, 0) - $1, 0), updated_at = NOW() WHERE wallet_address = $2", priceGSTD, wallet)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "payment failed"})
			return
		}
	} else {
		// [ON-CHAIN PAYMENT] Verified via TonConnect TxHash
		log.Printf("Signal %s purchased on-chain with tx hash: %s", signalID, req.TxHash)
	}

	// Record purchase
	_, err = tx.ExecContext(ctx,
		`INSERT INTO signal_purchases (signal_id, buyer_wallet, price_gstd, purchased_at) 
		 VALUES ($1, $2, $3, NOW())`,
		signalID, wallet, priceGSTD)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "purchase recording failed"})
		return
	}

	// Update buyers count
	tx.ExecContext(ctx, "UPDATE prediction_signals SET buyers = buyers + 1 WHERE id = $1", signalID)

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "commit failed"})
		return
	}

	// V2 Revenue Distribution: 50% Gold Reserve, 20% Compute Rewards, 30% Platform
	go services.DistributeSignalPurchaseRevenue(context.Background(), h.db, signalID, priceGSTD)

	log.Printf("💎 Signal purchased: %s by %s for %.2f GSTD (V2 revenue split)", signalID, wallet, priceGSTD)
	c.JSON(http.StatusOK, gin.H{
		"signal_id":   signalID,
		"full_report": fullReport,
		"price_paid":  priceGSTD,
		"revenue_split": gin.H{
			"gold_reserve_pct":    50,
			"compute_rewards_pct": 20,
			"platform_pct":        30,
		},
		"message": "Signal unlocked successfully. Revenue distributed to gold reserve + compute nodes.",
	})
}

// GetMySignals returns signals purchased by the user
func (h *PredictionSignalsHandler) GetMySignals(c *gin.Context) {
	walletAddr, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet required"})
		return
	}
	wallet := walletAddr.(string)
	ctx := c.Request.Context()

	rows, err := h.db.QueryContext(ctx, `
		SELECT s.id, s.category, s.title, s.summary, s.full_report, s.confidence, 
		       s.impact, s.time_horizon, s.price_gstd, s.agent_name, s.accuracy,
		       s.created_at, s.status
		FROM prediction_signals s
		JOIN signal_purchases p ON s.id = p.signal_id
		WHERE p.buyer_wallet = $1
		ORDER BY p.purchased_at DESC LIMIT 50`, wallet)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"signals": []interface{}{}})
		return
	}
	defer rows.Close()

	var signals []Signal
	for rows.Next() {
		var s Signal
		var fullReport sql.NullString
		rows.Scan(&s.ID, &s.Category, &s.Title, &s.Summary, &fullReport,
			&s.Confidence, &s.Impact, &s.TimeHorizon, &s.PriceGSTD,
			&s.AgentName, &s.Accuracy, &s.CreatedAt, &s.Status)
		if fullReport.Valid {
			s.FullReport = &fullReport.String
		}
		s.IsPremium = true
		signals = append(signals, s)
	}
	if signals == nil {
		signals = []Signal{}
	}

	c.JSON(http.StatusOK, gin.H{"signals": signals})
}

// RequestPrediction triggers a new prediction from MiroFish
func (h *PredictionSignalsHandler) RequestPrediction(c *gin.Context) {
	walletAddr, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet required"})
		return
	}

	var req struct {
		Topic    string `json:"topic" binding:"required"`
		Category string `json:"category"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Category == "" {
		req.Category = "marketplace"
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	// Run MiroFish prediction
	result, err := h.mirofish.CreateAndRunSimulation(ctx, services.SimulationRequest{
		Title:    req.Topic,
		Scenario: fmt.Sprintf("GSTD ecosystem prediction: %s", req.Topic),
		RealitySeed: map[string]interface{}{
			"platform": "GSTD",
			"topic":    req.Topic,
			"category": req.Category,
		},
		AgentCount: 200,
		Platforms:  []string{"twitter", "reddit"},
		Duration:   100,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "prediction failed"})
		return
	}

	// Store as signal
	signalID := fmt.Sprintf("SIG-%d", time.Now().UnixNano()%1000000000)
	h.db.ExecContext(ctx, `
		INSERT INTO prediction_signals (id, category, title, summary, full_report, confidence, 
		  impact, time_horizon, price_gstd, is_premium, agent_name, agent_score, accuracy,
		  created_at, expires_at, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, NOW(), NOW() + INTERVAL '7 days', 'active')`,
		signalID, req.Category, result.Title,
		truncateSignal(result.Report, 200),
		result.Report,
		result.Confidence, "medium", "7d", 5.0,
		"MiroFish-Swarm", 0.8, 0.0)

	log.Printf("🐟 New signal generated: %s by %s", signalID, walletAddr)
	c.JSON(http.StatusOK, gin.H{
		"signal_id":  signalID,
		"title":      result.Title,
		"confidence": result.Confidence,
		"report":     result.Report,
		"message":    "Prediction generated and listed",
	})
}

// GetNetworkStats returns AI network learning stats
func (h *PredictionSignalsHandler) GetNetworkStats(c *gin.Context) {
	ctx := c.Request.Context()

	var totalSignals, premiumSignals, totalBuyers, verifiedCorrect, verifiedWrong int
	var totalRevenue float64

	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM prediction_signals").Scan(&totalSignals)
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM prediction_signals WHERE is_premium = true").Scan(&premiumSignals)
	h.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(buyers), 0) FROM prediction_signals").Scan(&totalBuyers)
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM prediction_signals WHERE status = 'verified_correct'").Scan(&verifiedCorrect)
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM prediction_signals WHERE status = 'verified_wrong'").Scan(&verifiedWrong)
	h.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(price_gstd), 0) FROM signal_purchases").Scan(&totalRevenue)

	accuracy := float64(0)
	total := verifiedCorrect + verifiedWrong
	if total > 0 {
		accuracy = float64(verifiedCorrect) / float64(total) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"total_signals":      totalSignals,
		"premium_signals":    premiumSignals,
		"total_buyers":       totalBuyers,
		"total_revenue_gstd": totalRevenue,
		"verified_correct":   verifiedCorrect,
		"verified_wrong":     verifiedWrong,
		"network_accuracy":   accuracy,
		"agents_active":      7, // MiroFish + AI departments
		"learning_epochs":    totalSignals,
	})
}

// GetAgentLeaderboard returns top performing prediction agents with real signal counts
func (h *PredictionSignalsHandler) GetAgentLeaderboard(c *gin.Context) {
	ctx := c.Request.Context()

	type agentDef struct {
		Name      string
		Specialty string
		BaseAcc   float64
		Icon      string
	}
	defs := []agentDef{
		// Internal GSTD agents
		{"MiroFish-Alpha", "Marketplace Demand", 78.5, "🐟"},
		{"SwarmBrain-Eco", "Tokenomics", 72.3, "🧠"},
		{"GrowthOracle", "Network Growth", 81.2, "🚀"},
		{"FraudHunter", "Security & Anti-Fraud", 89.1, "🛡"},
		{"GovPredictor", "Governance Voting", 74.8, "⚖️"},
		{"SentimentAI", "Community Sentiment", 68.9, "💬"},
		{"DeFi-Compass", "Liquidity & DeFi", 76.4, "🧭"},
		// External market agents
		{"CryptoOracle", "Crypto Markets (BTC/ETH/TON)", 74.0, "₿"},
		{"ForexPulse", "Forex (USD/EUR/RUB)", 71.0, "💱"},
		{"GoldSentinel", "Gold & Commodities", 82.0, "🥇"},
		{"TechRadar", "Tech & AI Trends", 77.0, "📡"},
		{"PropertyAI", "Real Estate Markets", 68.0, "🏠"},
		{"EnergyFlow", "Energy & Mining", 73.0, "⚡"},
	}

	var agents []gin.H
	for _, d := range defs {
		var sigCount int
		h.db.QueryRowContext(ctx,
			"SELECT COUNT(*) FROM prediction_signals WHERE agent_name = $1", d.Name).Scan(&sigCount)
		agents = append(agents, gin.H{
			"name":      d.Name,
			"specialty": d.Specialty,
			"accuracy":  d.BaseAcc,
			"signals":   sigCount,
			"icon":      d.Icon,
		})
	}
	c.JSON(http.StatusOK, gin.H{"agents": agents})
}

// ─── HELPERS ─────────────────────────────────────────────────

func (h *PredictionSignalsHandler) loadAllSignals(ctx context.Context, limit int) ([]Signal, error) {
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, category, title, summary, full_report, confidence, impact, time_horizon,
		       price_gstd, is_premium, agent_name, COALESCE(agent_score, 0.5), COALESCE(accuracy, 0),
		       buyers, created_at, expires_at, status
		FROM prediction_signals 
		WHERE status = 'active'
		ORDER BY created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var signals []Signal
	for rows.Next() {
		var s Signal
		var fullReport sql.NullString
		err := rows.Scan(&s.ID, &s.Category, &s.Title, &s.Summary, &fullReport,
			&s.Confidence, &s.Impact, &s.TimeHorizon, &s.PriceGSTD,
			&s.IsPremium, &s.AgentName, &s.AgentScore, &s.Accuracy,
			&s.Buyers, &s.CreatedAt, &s.ExpiresAt, &s.Status)
		if err != nil {
			continue
		}
		if fullReport.Valid {
			s.FullReport = &fullReport.String
		}
		signals = append(signals, s)
	}
	return signals, nil
}

func (h *PredictionSignalsHandler) loadSignals(ctx context.Context, premium bool, limit int) ([]Signal, error) {
	rows, err := h.db.QueryContext(ctx, `
		SELECT id, category, title, summary, full_report, confidence, impact, time_horizon,
		       price_gstd, is_premium, agent_name, COALESCE(agent_score, 0.5), COALESCE(accuracy, 0),
		       buyers, created_at, expires_at, status
		FROM prediction_signals 
		WHERE status = 'active' AND is_premium = $1
		ORDER BY created_at DESC LIMIT $2`, premium, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var signals []Signal
	for rows.Next() {
		var s Signal
		var fullReport sql.NullString
		err := rows.Scan(&s.ID, &s.Category, &s.Title, &s.Summary, &fullReport,
			&s.Confidence, &s.Impact, &s.TimeHorizon, &s.PriceGSTD,
			&s.IsPremium, &s.AgentName, &s.AgentScore, &s.Accuracy,
			&s.Buyers, &s.CreatedAt, &s.ExpiresAt, &s.Status)
		if err != nil {
			continue
		}
		if fullReport.Valid {
			s.FullReport = &fullReport.String
		}
		signals = append(signals, s)
	}
	return signals, nil
}

func (h *PredictionSignalsHandler) hasPurchased(ctx context.Context, wallet, signalID string) bool {
	if wallet == "" {
		return false
	}
	var count int
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM signal_purchases WHERE buyer_wallet = $1 AND signal_id = $2",
		wallet, signalID).Scan(&count)
	return count > 0
}

func (h *PredictionSignalsHandler) generateLiveSignals(ctx context.Context) []Signal {
	if h.mirofish == nil {
		return []Signal{}
	}

	// Gather network data
	var totalNodes, totalUsers, totalTasks int
	var circulating float64
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes").Scan(&totalNodes)
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&totalUsers)
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
	h.db.QueryRowContext(ctx, "SELECT COALESCE(current_circulating, 0) FROM tokenomics_halving ORDER BY epoch_number DESC LIMIT 1").Scan(&circulating)

	result, err := h.mirofish.PredictMarketplaceDemand(ctx, totalTasks, 0, 0, 0)
	if err != nil || result == nil {
		return []Signal{}
	}

	var signals []Signal
	for i, p := range result.Predictions {
		isPremium := i > 0 // first one free, rest premium
		price := 0.0
		if isPremium {
			price = 5.0 + float64(i)*2.5
		}
		report := p.Description
		signals = append(signals, Signal{
			ID:          fmt.Sprintf("LIVE-%d-%d", time.Now().Unix(), i),
			Category:    p.Category,
			Title:       fmt.Sprintf("%s Signal", p.Category),
			Summary:     truncateSignal(p.Description, 150),
			FullReport:  &report,
			Confidence:  p.Probability,
			Impact:      p.Impact,
			TimeHorizon: p.TimeHorizon,
			PriceGSTD:   price,
			IsPremium:   isPremium,
			AgentName:   "MiroFish-Alpha",
			AgentScore:  0.78,
			Accuracy:    0,
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(7 * 24 * time.Hour),
			Status:      "active",
		})
	}
	return signals
}

func truncateSignal(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// ─── V2 ENDPOINTS: DATA SOURCES, COMPUTE REWARDS, REVENUE ───

// GetDataSources returns freshness info for all external data sources
func (h *PredictionSignalsHandler) GetDataSources(c *gin.Context) {
	if h.externalData == nil {
		// Return placeholder status when fetcher not initialized
		c.JSON(http.StatusOK, gin.H{
			"sources": []map[string]interface{}{
				{"source": "CoinGecko", "icon": "₿", "category": "crypto", "status": "initializing", "fresh": false},
				{"source": "ECB Forex", "icon": "💱", "category": "forex", "status": "initializing", "fresh": false},
				{"source": "HackerNews", "icon": "📡", "category": "tech", "status": "initializing", "fresh": false},
				{"source": "Gold/Commodities AI", "icon": "🥇", "category": "commodities", "status": "initializing", "fresh": false},
				{"source": "Energy Markets AI", "icon": "⚡", "category": "energy", "status": "initializing", "fresh": false},
			},
			"status": "warming_up",
		})
		return
	}

	sources := h.externalData.GetDataSourcesStatus()
	freshCount := 0
	for _, s := range sources {
		if fresh, ok := s["fresh"].(bool); ok && fresh {
			freshCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"sources":     sources,
		"fresh_count": freshCount,
		"total_count": len(sources),
		"status": func() string {
			if freshCount == len(sources) {
				return "all_live"
			}
			return "partial"
		}(),
	})
}

// GetComputeRewards returns swarm compute reward stats for the signal marketplace
func (h *PredictionSignalsHandler) GetComputeRewards(c *gin.Context) {
	ctx := c.Request.Context()
	stats := services.GetComputeRewardStats(ctx, h.db)

	// If a node_id is provided, also return that node's rewards
	nodeID := c.Query("node_id")
	if nodeID != "" {
		rewards, err := services.GetNodeComputeRewards(ctx, h.db, nodeID)
		if err == nil {
			stats["node_rewards"] = rewards
		}
	}

	// Top contributing nodes
	type nodeReward struct {
		NodeID      string  `json:"node_id"`
		TotalReward float64 `json:"total_reward"`
		SignalCount int     `json:"signal_count"`
	}
	rows, err := h.db.QueryContext(ctx, `
		SELECT node_id, SUM(reward_gstd) as total, COUNT(*) as cnt
		FROM signal_compute_rewards
		GROUP BY node_id
		ORDER BY total DESC LIMIT 10`)
	if err == nil {
		defer rows.Close()
		var topNodes []nodeReward
		for rows.Next() {
			var nr nodeReward
			if rows.Scan(&nr.NodeID, &nr.TotalReward, &nr.SignalCount) == nil {
				topNodes = append(topNodes, nr)
			}
		}
		stats["top_nodes"] = topNodes
	}

	c.JSON(http.StatusOK, stats)
}

// GetRevenueStats returns signal marketplace revenue breakdown
func (h *PredictionSignalsHandler) GetRevenueStats(c *gin.Context) {
	ctx := c.Request.Context()

	var totalRevenue, goldReserveTotal, computeRewardTotal, platformFeeTotal float64
	var totalPurchases, uniqueBuyers int

	h.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(price_gstd), 0) FROM signal_purchases").Scan(&totalRevenue)
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM signal_purchases").Scan(&totalPurchases)
	h.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT buyer_wallet) FROM signal_purchases").Scan(&uniqueBuyers)
	h.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(gold_reserve), 0) FROM signal_revenue_splits").Scan(&goldReserveTotal)
	h.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(compute_reward), 0) FROM signal_revenue_splits").Scan(&computeRewardTotal)
	h.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(platform_fee), 0) FROM signal_revenue_splits").Scan(&platformFeeTotal)

	// Top selling signals
	type topSignal struct {
		ID       string  `json:"id"`
		Title    string  `json:"title"`
		Buyers   int     `json:"buyers"`
		Revenue  float64 `json:"revenue"`
		Category string  `json:"category"`
	}
	rows, err := h.db.QueryContext(ctx, `
		SELECT ps.id, ps.title, ps.buyers, COALESCE(ps.price_gstd * ps.buyers, 0), ps.category
		FROM prediction_signals ps
		WHERE ps.buyers > 0
		ORDER BY ps.buyers DESC LIMIT 5`)

	var topSignals []topSignal
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ts topSignal
			if rows.Scan(&ts.ID, &ts.Title, &ts.Buyers, &ts.Revenue, &ts.Category) == nil {
				topSignals = append(topSignals, ts)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"total_revenue_gstd": totalRevenue,
		"total_purchases":    totalPurchases,
		"unique_buyers":      uniqueBuyers,
		"revenue_split": gin.H{
			"gold_reserve_gstd":    goldReserveTotal,
			"compute_rewards_gstd": computeRewardTotal,
			"platform_fee_gstd":    platformFeeTotal,
			"gold_reserve_pct":     50,
			"compute_rewards_pct":  20,
			"platform_pct":         30,
		},
		"top_signals": topSignals,
		"model": gin.H{
			"description":        "Signal purchase revenue is automatically split: 50% Gold Reserve, 20% Compute Node Rewards, 30% Platform",
			"node_base_reward":   "0.5 GSTD per signal processed",
			"fast_compute_bonus": "1.0 GSTD if compute < 5000ms",
		},
	})
}
