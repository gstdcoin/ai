package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"fmt"
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
// Supports: ?amount_ton=1 (legacy) OR ?from=TON&to=GSTD&amount=1 (universal)
func (h *MarketHandler) GetSwapQuote(c *gin.Context) {
	var amountTON float64

	// Universal format: ?from=TON&to=GSTD&amount=1
	if amt, err := strconv.ParseFloat(c.Query("amount"), 64); err == nil && amt > 0 {
		amountTON = amt
	}
	// Legacy format: ?amount_ton=1
	if amt, err := strconv.ParseFloat(c.Query("amount_ton"), 64); err == nil && amt > 0 {
		amountTON = amt
	}

	if amountTON <= 0 {
		amountTON = 1.0 // Default: 1 TON
	}

	amountIn := int64(amountTON * 1e9) // Convert to nanotons

	// Determine token pair
	tokenIn := "TON"
	tokenOut := "GSTD_ADDR"
	from := c.Query("from")
	to := c.Query("to")
	if from == "GSTD" && to == "TON" {
		tokenIn = "GSTD_ADDR"
		tokenOut = "TON"
	}

	quote, err := h.stonFiService.GetSwapQuote(c.Request.Context(), amountIn, tokenIn, tokenOut)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// Add human-readable fields
	amountOut, _ := strconv.ParseFloat(quote.AmountOut, 64)
	gstdAmount := amountOut / 1e9 // nano → whole tokens

	c.JSON(200, gin.H{
		"amount_out":     quote.AmountOut,
		"min_amount_out": quote.MinAmountOut,
		"price_impact":   quote.PriceImpact,
		"rate":           gstdAmount,
		"gstd_amount":    gstdAmount,
		"from":           from,
		"to":             to,
		"amount_in":      amountTON,
	})
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
	quote, err := h.stonFiService.GetSwapQuote(c.Request.Context(), amountIn, "TON", "GSTD_ADDR")
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to get real swap quote: " + err.Error()})
		return
	}

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
		"quote":       quote,
		"transaction": payload,
		"instruction": "Sign 'transaction.body_boc' with your private key and broadcast to TON network",
		"status":      "ready_to_sign",
		// Legacy support for our bot immediate update
		"simulated_credit": gstdReceived,
		"received_gstd":    gstdReceived,
	})
}

// GetX402BuyDetails provides x402 (Payment Required) protocol support for agents
// This allows agents to autonomously discover buy requirements.
func (h *MarketHandler) GetX402BuyDetails(c *gin.Context) {
	var req struct {
		WalletAddress string  `json:"wallet_address"`
		AmountTON     float64 `json:"amount_ton"`
	}

	// Support both JSON body and Query params for flexibility
	if err := c.ShouldBindJSON(&req); err != nil {
		// Try query params if JSON fails
		req.WalletAddress = c.Query("wallet_address")
		if amt, err := strconv.ParseFloat(c.Query("amount_ton"), 64); err == nil {
			req.AmountTON = amt
		}
	}

	if req.WalletAddress == "" || req.AmountTON <= 0 {
		c.JSON(400, gin.H{"error": "wallet_address and amount_ton (>0) are required"})
		return
	}

	amountIn := int64(req.AmountTON * 1e9)
	quote, err := h.stonFiService.GetSwapQuote(c.Request.Context(), amountIn, "TON", "GSTD_ADDR")
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to get swap quote"})
		return
	}

	// Payload for agent to sign/send
	payload, err := h.stonFiService.BuildSwapPayload(c.Request.Context(), req.WalletAddress, quote, amountIn)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to build transaction payload"})
		return
	}

	// 402 Payment Required Response
	// We include headers typically used in 402 flows (like L402/LSAT, though adapted for TON)
	c.Header("WWW-Authenticate", `Token realm="GSTD_Market", error="insufficient_funds", title="Payment Required"`)

	c.JSON(402, gin.H{
		"error":   "Payment Required",
		"code":    402,
		"message": "To acquire GSTD, perform the following TON transaction.",
		"payment_request": gin.H{
			"type":             "ton_transaction",
			"address":          payload["to"],
			"amount_nanoton":   payload["value"],
			"amount_ton":       req.AmountTON,
			"payload_boc":      payload["body_boc"], // The body agent must attach
			"comment":          payload["comment"],  // Optional comment
			"estimated_output": quote.AmountOut,
			"min_output":       quote.MinAmountOut,
			"currency":         "GSTD",
		},
		"agent_instruction": "Send connectionless UDP or standard wallet message with attached body_boc to 'address'.",
	})
}

// BuyServiceX402 allows agents to buy specific operational slots (Computation, Storage)
func (h *MarketHandler) BuyServiceX402(c *gin.Context) {
	var req struct {
		ServiceType   string `json:"service_type"` // e.g., "high_priority_slot", "hive_storage_1gb"
		WalletAddress string `json:"wallet_address"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "service_type and wallet_address required"})
		return
	}

	// 1. Define Service Catalog (Hardcoded for v1)
	prices := map[string]float64{
		"high_priority_slot": 5.0,  // TON
		"hive_storage_1gb":   2.5,  // TON
		"oracle_access":      10.0, // TON
		"gpu_lease_1h":       0.5,  // TON
	}

	price, ok := prices[req.ServiceType]
	if !ok {
		c.JSON(404, gin.H{"error": "Service not found in catalog", "available": []string{"high_priority_slot", "hive_storage_1gb", "oracle_access", "gpu_lease_1h"}})
		return
	}

	amountIn := int64(price * 1e9)

	// 2. Build Transaction
	// We treat this as a swap to GSTD internally, but the agent sees it as buying a service.
	// In reality, this would send TON to a treasury address with a specific comment.
	quote, _ := h.stonFiService.GetSwapQuote(c.Request.Context(), amountIn, "TON", "GSTD_ADDR")
	payload, err := h.stonFiService.BuildSwapPayload(c.Request.Context(), req.WalletAddress, quote, amountIn)

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to build service payment payload"})
		return
	}

	// 3. Return 402
	c.Header("WWW-Authenticate", `Token realm="GSTD_Services", error="payment_required"`)
	c.JSON(402, gin.H{
		"error":     "Payment Required",
		"code":      402,
		"service":   req.ServiceType,
		"price_ton": price,
		"payment_request": gin.H{
			"type":           "ton_transaction",
			"address":        payload["to"],
			"amount_nanoton": payload["value"],
			"payload_boc":    payload["body_boc"],
			"comment":        fmt.Sprintf("PURCHASE:%s:%s", req.ServiceType, req.WalletAddress),
			"currency":       "TON",
		},
		"instruction": "Sign payload_boc to acquire this service rights.",
	})
}
