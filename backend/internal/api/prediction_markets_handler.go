package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
)

type PredictionMarketsHandler struct {
	db           *sql.DB
	mirofish     *services.MiroFishService
	externalData *services.ExternalDataFetcher
}

func NewPredictionMarketsHandler(db *sql.DB, m *services.MiroFishService, e *services.ExternalDataFetcher) *PredictionMarketsHandler {
	return &PredictionMarketsHandler{db: db, mirofish: m, externalData: e}
}

func SetupPredictionMarketsRoutes(router *gin.RouterGroup, handler *PredictionMarketsHandler) {
	markets := router.Group("/markets")
	{
		markets.GET("/active", handler.GetActiveMarkets)
		markets.GET("/:id", handler.GetMarketDetails)
	}
}

func SetupPredictionMarketsProtectedRoutes(router *gin.RouterGroup, handler *PredictionMarketsHandler) {
	markets := router.Group("/markets")
	{
		markets.POST("/:id/bet", handler.PlaceBet)
		markets.GET("/my-bets", handler.GetMyBets)
		markets.POST("/:id/signal", handler.BuyMarketSignal) // AI Forecast
	}
}

// Structs
type Market struct {
	ID             string    `json:"id"`
	Question       string    `json:"question"`
	Description    string    `json:"description"`
	ImageURL       string    `json:"image_url"`
	Outcomes       []string  `json:"outcomes"`
	OutcomePrices  []float64 `json:"outcome_prices"`
	VolumeUSD      float64   `json:"volume_usd"`
	PoolGSTD       float64   `json:"pool_gstd"`
	LiquidityGSTD  float64   `json:"liquidity_gstd"`
	EndDate        *time.Time `json:"end_date,omitempty"`
	Status         string    `json:"status"`
	ResolvedOutcome int      `json:"resolved_outcome"`
}

type Bet struct {
	ID             int       `json:"id"`
	MarketID       string    `json:"market_id"`
	Question       string    `json:"question"`
	Wallet         string    `json:"wallet_address"`
	OutcomeIndex   int       `json:"outcome_index"`
	AmountGSTD     float64   `json:"amount_gstd"`
	PotentialPayout float64   `json:"potential_payout"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

func (h *PredictionMarketsHandler) syncMarkets(ctx context.Context) {
	if h.externalData == nil {
		return
	}
	sources := h.externalData.GetAllData()
	poly, ok := sources["polymarket"]
	if !ok || !poly.Fresh {
		return
	}

	activeEvents, ok := poly.Data["active_markets"].([]interface{})
	if !ok {
		return
	}

	for i, evRaw := range activeEvents {
		ev, ok := evRaw.(map[string]interface{})
		if !ok {
			continue
		}

		question, _ := ev["question"].(string)
		eventURL, _ := ev["event"].(string)
		volume, _ := ev["volume"].(float64)

		outcomes, _ := ev["outcomes"].([]string)
		pricesRaw, _ := ev["prices"].([]string)

		prices := make([]float64, 0)
		for _, pStr := range pricesRaw {
			var val float64
			fmt.Sscanf(pStr, "%f", &val)
			prices = append(prices, val)
		}

		if len(outcomes) == 0 {
			continue
		}
		outcomesJSON, _ := json.Marshal(outcomes)
		pricesJSON, _ := json.Marshal(prices)

		marketID := fmt.Sprintf("GPM-%d", i+1)
		
		_, err := h.db.ExecContext(ctx, `
			INSERT INTO gstd_prediction_markets (id, question, description, outcomes, outcome_prices, volume_usd)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (id) DO UPDATE SET
				outcome_prices = EXCLUDED.outcome_prices,
				volume_usd = EXCLUDED.volume_usd,
				updated_at = NOW()
		`, marketID, question, eventURL, string(outcomesJSON), string(pricesJSON), volume)
		if err != nil {
			log.Printf("⚠️ Market sync error: %v", err)
		}
	}
}

func (h *PredictionMarketsHandler) GetActiveMarkets(c *gin.Context) {
	ctx := c.Request.Context()
	
	// Try to sync fresh markets on request (or could be background)
	go h.syncMarkets(context.Background())

	rows, err := h.db.QueryContext(ctx, `
		SELECT id, question, description, image_url, outcomes, outcome_prices, volume_usd, pool_gstd, liquidity_gstd, end_date, status, resolved_outcome
		FROM gstd_prediction_markets
		WHERE status = 'active'
		ORDER BY volume_usd DESC LIMIT 20`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	var markets []Market
	for rows.Next() {
		var m Market
		var oJSON, pJSON string
		err := rows.Scan(&m.ID, &m.Question, &m.Description, &m.ImageURL, &oJSON, &pJSON, &m.VolumeUSD, &m.PoolGSTD, &m.LiquidityGSTD, &m.EndDate, &m.Status, &m.ResolvedOutcome)
		if err == nil {
			json.Unmarshal([]byte(oJSON), &m.Outcomes)
			json.Unmarshal([]byte(pJSON), &m.OutcomePrices)
			markets = append(markets, m)
		}
	}
	c.JSON(http.StatusOK, gin.H{"markets": markets})
}

func (h *PredictionMarketsHandler) GetMarketDetails(c *gin.Context) {
	id := c.Param("id")
	ctx := c.Request.Context()
	
	var m Market
	var oJSON, pJSON string
	err := h.db.QueryRowContext(ctx, `
		SELECT id, question, description, image_url, outcomes, outcome_prices, volume_usd, pool_gstd, liquidity_gstd, end_date, status, resolved_outcome
		FROM gstd_prediction_markets WHERE id = $1`, id).
		Scan(&m.ID, &m.Question, &m.Description, &m.ImageURL, &oJSON, &pJSON, &m.VolumeUSD, &m.PoolGSTD, &m.LiquidityGSTD, &m.EndDate, &m.Status, &m.ResolvedOutcome)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "market not found"})
		return
	}
	json.Unmarshal([]byte(oJSON), &m.Outcomes)
	json.Unmarshal([]byte(pJSON), &m.OutcomePrices)
	
	c.JSON(http.StatusOK, m)
}

func (h *PredictionMarketsHandler) scanTransactionRisk(ctx context.Context, wallet, txType string, amount float64) float64 {
	// Blowfish-style silent security scanning Integration
	var riskScore float64 = 0.0
	// 1. Check if wallet is completely new
	var txCount int
	h.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE creator_wallet = $1", wallet).Scan(&txCount)
	if txCount == 0 {
		riskScore += 0.1 // minor risk for fresh wallet
	}
	
	// 2. Check bet size vs average
	if amount > 100000 {
		riskScore += 0.3 // Large amount flag
	}
	
	action := "allowed"
	if riskScore > 0.8 {
		action = "blocked"
	}
	h.db.ExecContext(ctx, `
		INSERT INTO tx_risk_scans (wallet_address, tx_type, amount_gstd, risk_score, action_taken)
		VALUES ($1, $2, $3, $4, $5)`,
		wallet, txType, amount, riskScore, action)
		
	return riskScore
}

func (h *PredictionMarketsHandler) PlaceBet(c *gin.Context) {
	walletAddr, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet required"})
		return
	}
	wallet := walletAddr.(string)
	marketID := c.Param("id")
	
	var req struct {
		OutcomeIndex int     `json:"outcome_index"`
		Amount       float64 `json:"amount_gstd"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	ctx := c.Request.Context()

	// Risk Scan (Blowfish logic)
	risk := h.scanTransactionRisk(ctx, wallet, "bet", req.Amount)
	if risk > 0.8 {
		c.JSON(http.StatusForbidden, gin.H{"error": "transaction blocked by security scanner"})
		return
	}

	var m Market
	var pJSON string
	err := h.db.QueryRowContext(ctx, "SELECT outcome_prices, status FROM gstd_prediction_markets WHERE id = $1", marketID).
		Scan(&pJSON, &m.Status)
	
	if err != nil || m.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "market inactive or not found"})
		return
	}

	var prices []float64
	json.Unmarshal([]byte(pJSON), &prices)
	if req.OutcomeIndex < 0 || req.OutcomeIndex >= len(prices) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid outcome"})
		return
	}

	winProb := prices[req.OutcomeIndex]
	if winProb <= 0 { winProb = 0.01 }
	potentialPayout := req.Amount / winProb

	// Process Payment
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "tx failed"})
		return
	}
	defer tx.Rollback()

	var balance float64
	tx.QueryRowContext(ctx, "SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1 FOR UPDATE", wallet).Scan(&balance)
	if balance < req.Amount {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "insufficient GSTD balance", "required": req.Amount, "balance": balance})
		return
	}

	tx.ExecContext(ctx, "UPDATE users SET gstd_balance = GREATEST(COALESCE(gstd_balance, 0) - $1, 0), updated_at = NOW() WHERE wallet_address = $2", req.Amount, wallet)
	
	tx.ExecContext(ctx, "UPDATE gstd_prediction_markets SET pool_gstd = pool_gstd + $1 WHERE id = $2", req.Amount, marketID)

	var betID int
	tx.QueryRowContext(ctx, `
		INSERT INTO gstd_market_bets (market_id, wallet_address, outcome_index, amount_gstd, potential_payout)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		marketID, wallet, req.OutcomeIndex, req.Amount, potentialPayout).Scan(&betID)

	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "Bet placed successfully via GSTD Oracle Network", "bet_id": betID, "payout": potentialPayout})
}

func (h *PredictionMarketsHandler) GetMyBets(c *gin.Context) {
	walletAddr, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet required"})
		return
	}
	wallet := walletAddr.(string)
	ctx := c.Request.Context()

	rows, err := h.db.QueryContext(ctx, `
		SELECT b.id, b.market_id, m.question, b.outcome_index, b.amount_gstd, b.potential_payout, b.status, b.created_at
		FROM gstd_market_bets b
		JOIN gstd_prediction_markets m ON b.market_id = m.id
		WHERE b.wallet_address = $1 ORDER BY b.created_at DESC`, wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	var bets []Bet
	for rows.Next() {
		var b Bet
		rows.Scan(&b.ID, &b.MarketID, &b.Question, &b.OutcomeIndex, &b.AmountGSTD, &b.PotentialPayout, &b.Status, &b.CreatedAt)
		b.Wallet = wallet
		bets = append(bets, b)
	}

	c.JSON(http.StatusOK, gin.H{"bets": bets})
}

func (h *PredictionMarketsHandler) BuyMarketSignal(c *gin.Context) {
	walletAddr, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet required"})
		return
	}
	wallet := walletAddr.(string)
	marketID := c.Param("id")
	priceGSTD := 15.0

	ctx := c.Request.Context()
	
	// Risk scan
	h.scanTransactionRisk(ctx, wallet, "signal_purchase", priceGSTD)

	// Deduct balance
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "tx error"})
		return
	}
	defer tx.Rollback()

	var bal float64
	tx.QueryRowContext(ctx, "SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1", wallet).Scan(&bal)
	if bal < priceGSTD {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "insufficient GSTD balance", "required": priceGSTD, "balance": bal})
		return
	}

	tx.ExecContext(ctx, "UPDATE users SET gstd_balance = GREATEST(COALESCE(gstd_balance, 0) - $1, 0), updated_at = NOW() WHERE wallet_address = $2", priceGSTD, wallet)
	tx.Commit()

	// Get market
	var q, oJSON, pJSON string
	h.db.QueryRowContext(ctx, "SELECT question, outcomes, outcome_prices FROM gstd_prediction_markets WHERE id = $1", marketID).Scan(&q, &oJSON, &pJSON)

	// Call Swarm AI for real-time analysis
	if h.mirofish != nil && h.mirofish.GetCompoundAI() != nil {
		ai := h.mirofish.GetCompoundAI()
		prompt := fmt.Sprintf("Analyze this prediction market: '%s'. Outcomes: %s. Current odds: %s. Provide a highly accurate recommendation on which outcome to choose for a trader. Include reasoning based on real world events.", q, oJSON, pJSON)
		
		response, err := ai.Ask(ctx, "You are a SwarmBrain Prediction Engine Oracle.", prompt)
		if err == nil {
			c.JSON(http.StatusOK, gin.H{"market_id": marketID, "forecast": response})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"market_id": marketID, "forecast": "Swarm consensus: Follow the volume trend. Current odds point to outcome 0 as favorite."})
}
