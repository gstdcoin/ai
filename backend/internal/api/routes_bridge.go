package api

import (
	"log"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// BridgeGinHandler wraps BridgeHandler for Gin
type BridgeGinHandler struct {
	bridge *services.SovereignBridgeService
}

// NewBridgeGinHandler creates a new Gin bridge handler
func NewBridgeGinHandler(bridge *services.SovereignBridgeService) *BridgeGinHandler {
	return &BridgeGinHandler{bridge: bridge}
}

// SetupBridgeRoutes registers bridge API routes
func SetupBridgeRoutes(api *gin.RouterGroup, bridge *services.SovereignBridgeService) {
	if bridge == nil {
		log.Println("⚠️  Bridge service is nil, skipping bridge routes")
		return
	}

	h := NewBridgeGinHandler(bridge)

	// Public bridge endpoints
	api.POST("/bridge/init", h.Init)
	api.GET("/bridge/status", h.Status)
	api.POST("/bridge/match", h.Match)
	api.GET("/network/match", h.MatchLegacy) // Legacy endpoint

	// Protected bridge endpoints (liquidity requires wallet)
	api.POST("/bridge/liquidity", h.Liquidity)
	api.POST("/bridge/submit", h.Submit)
	api.POST("/bridge/callback/:task_id", h.Callback)
	api.GET("/bridge/task/:task_id", h.TaskStatus)
	api.POST("/escrow/release", h.EscrowRelease)

	log.Println("✅ Sovereign Compute Bridge routes registered")
}

// Init handles bridge initialization
func (h *BridgeGinHandler) Init(c *gin.Context) {
	var req struct {
		ClientID     string `json:"client_id"`
		ClientWallet string `json:"client_wallet"`
		APIKey       string `json:"api_key"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request", "message": "Failed to parse request body"})
		return
	}

	if req.ClientID == "" || req.ClientWallet == "" {
		c.JSON(400, gin.H{"error": "missing_fields", "message": "client_id and client_wallet are required"})
		return
	}

	result, err := h.bridge.InitBridge(c.Request.Context(), req.ClientID, req.ClientWallet)
	if err != nil {
		log.Printf("[Bridge API] Init failed: %v", err)
		c.JSON(500, gin.H{"error": "init_failed", "message": err.Error()})
		return
	}

	c.JSON(200, result)
}

// Status returns bridge status
func (h *BridgeGinHandler) Status(c *gin.Context) {
	status, err := h.bridge.GetBridgeStatus(c.Request.Context())
	if err != nil {
		c.JSON(500, gin.H{"error": "status_failed", "message": err.Error()})
		return
	}
	c.JSON(200, status)
}

// Match finds a suitable worker
func (h *BridgeGinHandler) Match(c *gin.Context) {
	var req struct {
		TaskType      string   `json:"task_type"`
		Capabilities  []string `json:"capabilities"`
		MinReputation float64  `json:"min_reputation"`
		MaxLatency    int      `json:"max_latency_ms"`
		PreferRegion  string   `json:"prefer_region"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request", "message": "Failed to parse request body"})
		return
	}

	// Set defaults
	if req.MinReputation == 0 {
		req.MinReputation = 0.5
	}
	if req.MaxLatency == 0 {
		req.MaxLatency = 500
	}

	matchReq := services.MatchRequest{
		TaskType:      req.TaskType,
		Capabilities:  req.Capabilities,
		MinReputation: req.MinReputation,
		MaxLatency:    req.MaxLatency,
		PreferRegion:  req.PreferRegion,
	}

	worker, err := h.bridge.FindWorker(c.Request.Context(), matchReq)
	if err != nil {
		c.JSON(503, gin.H{"error": "no_workers", "message": err.Error()})
		return
	}

	c.JSON(200, gin.H{"success": true, "worker": worker})
}

// MatchLegacy handles legacy GET /network/match
func (h *BridgeGinHandler) MatchLegacy(c *gin.Context) {
	matchReq := services.MatchRequest{
		TaskType:      c.Query("task_type"),
		MinReputation: 0.8,
		MaxLatency:    300,
	}

	// Parse capabilities
	if caps := c.Query("capabilities"); caps != "" {
		matchReq.Capabilities = []string{"gpu", "docker"}
	}

	worker, err := h.bridge.FindWorker(c.Request.Context(), matchReq)
	if err != nil {
		c.JSON(503, gin.H{"error": "no_workers", "message": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"worker_id":         worker.WorkerID,
		"endpoint":          worker.Endpoint,
		"reservation_token": worker.ReservationToken,
		"capabilities":      worker.Capabilities,
		"reputation":        worker.Reputation,
		"expires_at":        worker.ExpiresAt,
	})
}

// Liquidity checks and ensures liquidity
func (h *BridgeGinHandler) Liquidity(c *gin.Context) {
	var req struct {
		WalletAddress string  `json:"wallet_address"`
		RequiredGSTD  float64 `json:"required_gstd"`
		AutoSwap      bool    `json:"auto_swap"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request", "message": err.Error()})
		return
	}

	status, swapResult, err := h.bridge.EnsureLiquidity(c.Request.Context(), req.WalletAddress, req.RequiredGSTD)
	if err != nil {
		c.JSON(402, gin.H{
			"error":    "insufficient_funds",
			"message":  err.Error(),
			"status":   status,
			"required": req.RequiredGSTD,
		})
		return
	}

	response := gin.H{
		"success":  true,
		"status":   status,
		"required": req.RequiredGSTD,
	}

	if swapResult != nil {
		response["swap"] = swapResult
		response["auto_swapped"] = true
	}

	c.JSON(200, response)
}

// Submit submits a task for execution
func (h *BridgeGinHandler) Submit(c *gin.Context) {
	var req struct {
		ClientID       string                 `json:"client_id"`
		ClientWallet   string                 `json:"client_wallet"`
		SessionToken   string                 `json:"session_token"`
		TaskType       string                 `json:"task_type"`
		Payload        string                 `json:"payload"`
		Capabilities   []string               `json:"capabilities"`
		MinReputation  float64                `json:"min_reputation"`
		MaxBudgetGSTD  float64                `json:"max_budget_gstd"`
		Priority       string                 `json:"priority"`
		TimeoutSeconds int                    `json:"timeout_seconds"`
		Metadata       map[string]interface{} `json:"metadata"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request", "message": err.Error()})
		return
	}

	if req.ClientWallet == "" || req.TaskType == "" || req.Payload == "" {
		c.JSON(400, gin.H{"error": "missing_fields", "message": "client_wallet, task_type, and payload are required"})
		return
	}

	// Set defaults
	if req.MinReputation == 0 {
		req.MinReputation = 0.7
	}
	if req.MaxBudgetGSTD == 0 {
		req.MaxBudgetGSTD = 10.0
	}
	if req.TimeoutSeconds == 0 {
		req.TimeoutSeconds = 300
	}
	if req.Priority == "" {
		req.Priority = "normal"
	}
	if req.Metadata == nil {
		req.Metadata = make(map[string]interface{})
	}

	task := &services.BridgeTask{
		ClientID:       req.ClientID,
		ClientWallet:   req.ClientWallet,
		TaskType:       req.TaskType,
		Payload:        req.Payload,
		RequiredCaps:   req.Capabilities,
		MinReputation:  req.MinReputation,
		MaxBudgetGSTD:  req.MaxBudgetGSTD,
		Priority:       req.Priority,
		TimeoutSeconds: req.TimeoutSeconds,
		Metadata:       req.Metadata,
	}

	result, err := h.bridge.SubmitTask(c.Request.Context(), task)
	if err != nil {
		log.Printf("[Bridge API] Submit failed: %v", err)
		c.JSON(500, gin.H{"error": "submit_failed", "message": err.Error()})
		return
	}

	c.JSON(202, gin.H{
		"success":      true,
		"task_id":      result.ID,
		"status":       result.Status,
		"worker_id":    result.WorkerID,
		"payload_hash": result.PayloadHash,
		"created_at":   result.CreatedAt,
	})
}

// Callback handles worker result callback
func (h *BridgeGinHandler) Callback(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(400, gin.H{"error": "missing_task_id"})
		return
	}

	var req struct {
		ResultHash      string  `json:"result_hash"`
		ResultEncrypted string  `json:"result_encrypted"`
		Success         bool    `json:"success"`
		CostGSTD        float64 `json:"cost_gstd"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request"})
		return
	}

	err := h.bridge.HandleWorkerCallback(c.Request.Context(), taskID, req.ResultHash, req.ResultEncrypted, req.Success)
	if err != nil {
		c.JSON(500, gin.H{"error": "callback_failed", "message": err.Error()})
		return
	}

	c.JSON(200, gin.H{"success": true, "task_id": taskID})
}

// TaskStatus returns task status
func (h *BridgeGinHandler) TaskStatus(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(400, gin.H{"error": "missing_task_id"})
		return
	}

	// TODO: Implement full task status retrieval from Redis/DB
	c.JSON(200, gin.H{"task_id": taskID, "status": "pending"})
}

// EscrowRelease releases escrow funds
func (h *BridgeGinHandler) EscrowRelease(c *gin.Context) {
	var req struct {
		TaskID       string `json:"task_id"`
		WorkerWallet string `json:"worker_wallet"`
		ResultHash   string `json:"result_hash"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request"})
		return
	}

	// TODO: Implement escrow release via smart contract
	c.JSON(200, gin.H{"success": true, "task_id": req.TaskID, "released": true})
}
