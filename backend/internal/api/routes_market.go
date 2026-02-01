package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"log"
	"strconv"
	
	"github.com/gin-gonic/gin"
)

// MarketHandler holds services for market operations
type MarketHandler struct {
	db            *sql.DB
	stonFiService *services.StonFiService
}

func NewMarketHandler(db *sql.DB) *MarketHandler {
	// Initialize with default router for now
	return &MarketHandler{
		db:            db,
		stonFiService: services.NewStonFiService(""),
	}
}

// GetSwapQuote returns a real/simulated quote for buying GSTD
func (h *MarketHandler) GetSwapQuote(c *gin.Context) {
	var req struct {
		AmountTON float64 `form:"amount_ton"`
	}
	if err := c.BindQuery(&req); err != nil {
		c.JSON(400, gin.H{"error": "amount_ton is required"})
		return
	}

	amountIn := int64(req.AmountTON * 1e9) // Convert to nanotons
	// Swapping TON -> GSTD
	quote, err := h.stonFiService.GetSwapQuote(c.Request.Context(), amountIn, "TON", "GSTD_ADDR")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, quote)
}

// PrepareSwapTransaction builds the payload for an autonomous agent to sign
func (h *MarketHandler) PrepareSwapTransaction(c *gin.Context) {
	var req struct {
		WalletAddress string  `json:"wallet_address"`
		AmountTON     float64 `json:"amount_ton"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request"})
		return
	}

	amountIn := int64(req.AmountTON * 1e9)
	quote, _ := h.stonFiService.GetSwapQuote(c.Request.Context(), amountIn, "TON", "GSTD_ADDR")
	
	// Payload for agent to sign
	payload, err := h.stonFiService.BuildSwapPayload(c.Request.Context(), req.WalletAddress, quote, amountIn)
	
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to build payload"})
		return
	}

	// Calculate simulated amount
	amountOut, _ := strconv.ParseFloat(quote.AmountOut, 64)
	gstdReceived := amountOut / 1e9 // Convert from nano

	// For the demo: We ALSO simulate the effect locally so the bot can continue working
	_, err = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO users (wallet_address, gstd_balance) 
		VALUES ($1, $2)
		ON CONFLICT (wallet_address) 
		DO UPDATE SET gstd_balance = users.gstd_balance + $2
	`, req.WalletAddress, gstdReceived)

	if err != nil {
		log.Printf("DB Update Error: %v", err)
	} else {
		log.Printf("📈 MARKET HELP: Prepared swap for %s (Simulated credit of %.2f GSTD)", req.WalletAddress, gstdReceived)
	}

	c.JSON(200, gin.H{
		"quote":        quote,
		"transaction":  payload,
		"instruction":  "Sign 'transaction.body_boc' with your private key and broadcast to TON network",
		"status":       "ready_to_sign",
		// Legacy support for our bot immediate update
		"simulated_credit": gstdReceived,
		"received_gstd":    gstdReceived,
	})
}
