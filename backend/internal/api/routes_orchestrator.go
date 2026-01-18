package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

// OrchestratorHandler handles task orchestration and PoW endpoints
type OrchestratorHandler struct {
	db           *sql.DB
	orchestrator *services.TaskOrchestrator
	pow          *services.ProofOfWorkService
	ton          *services.TONService
}

// NewOrchestratorHandler creates a new orchestrator handler
func NewOrchestratorHandler(db *sql.DB, orchestrator *services.TaskOrchestrator, pow *services.ProofOfWorkService, ton *services.TONService) *OrchestratorHandler {
	return &OrchestratorHandler{
		db:           db,
		orchestrator: orchestrator,
		pow:          pow,
		ton:          ton,
	}
}

// ... unchanged setup ...

// GetWalletBalance returns wallet balance
// @Summary Get wallet balance
// @Description Returns GSTD and TON balance for a wallet
// @Tags Wallet
// @Produce json
// @Param wallet query string true "Wallet address"
// @Success 200 {object} map[string]interface{}
// @Router /wallet/balance [get]
func (h *OrchestratorHandler) GetWalletBalance(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet is required"})
		return
	}

	var balance struct {
		GSTDBalance     float64 `json:"gstd_balance"`
		TONBalance      float64 `json:"ton_balance"`
		PendingEarnings float64 `json:"pending_earnings"`
		PendingPayouts  float64 `json:"pending_payouts"`
		TotalEarned     float64 `json:"total_earned"`
		LockedInEscrow  float64 `json:"locked_in_escrow"`
	}

	// Get pending earnings (completed tasks awaiting payout)
	h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(SUM(reward_gstd), 0)
		FROM worker_task_assignments
		WHERE worker_wallet = $1 AND status = 'completed' AND paid_at IS NULL
	`, wallet).Scan(&balance.PendingEarnings)

	// Get total earned
	h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(SUM(reward_gstd), 0)
		FROM worker_task_assignments
		WHERE worker_wallet = $1 AND status = 'completed' AND paid_at IS NOT NULL
	`, wallet).Scan(&balance.TotalEarned)

	// Also check worker_ratings for historical data
	var workerEarnings float64
	h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(total_earnings_gstd, 0)
		FROM worker_ratings
		WHERE worker_wallet = $1
	`, wallet).Scan(&workerEarnings)
	if workerEarnings > balance.TotalEarned {
		balance.TotalEarned = workerEarnings
	}

	// Get locked escrow amount
	h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(SUM(total_locked_gstd), 0)
		FROM task_escrow
		WHERE creator_wallet = $1 AND status = 'locked'
	`, wallet).Scan(&balance.LockedInEscrow)

	// Fetch real balances from blockchain if TONService is available
	if h.ton != nil {
		// Get TON Balance
		tonBalNano, err := h.ton.GetContractBalance(c.Request.Context(), wallet)
		if err == nil {
			balance.TONBalance = float64(tonBalNano) / 1e9
		} else {
			log.Printf("Failed to get TON balance for %s: %v", wallet, err)
		}

		// Get GSTD Balance
		// Get GSTD Jetton Address from env or constant
		gstdAddress := os.Getenv("GSTD_JETTON_ADDRESS")
		if gstdAddress != "" {
			gstdBal, err := h.ton.GetJettonBalance(c.Request.Context(), wallet, gstdAddress)
			if err == nil {
				balance.GSTDBalance = gstdBal
			} else {
				log.Printf("Failed to get GSTD balance for %s: %v", wallet, err)
			}
		}
	}

	c.JSON(http.StatusOK, balance)
}

// SetupOrchestratorRoutes registers orchestrator and PoW routes
func SetupOrchestratorRoutes(router *gin.RouterGroup, handler *OrchestratorHandler) {
	// PoW routes
	pow := router.Group("/pow")
	{
		pow.POST("/challenge", handler.GenerateChallenge)
		pow.POST("/verify", handler.VerifyProof)
		pow.GET("/status", handler.GetChallengeStatus)
	}

	// Orchestrator routes
	orch := router.Group("/orchestrator")
	{
		orch.GET("/queue/stats", handler.GetQueueStats)
		orch.GET("/next-task", handler.GetNextTask)
		orch.POST("/claim", handler.ClaimWithPoW)
		orch.POST("/complete", handler.CompleteWithPoW)
	}

	// Client routes
	client := router.Group("/client")
	{
		client.GET("/stats", handler.GetClientStats)
		client.GET("/escrows", handler.GetClientEscrows)
	}

	// Wallet routes
	wallet := router.Group("/wallet")
	{
		wallet.GET("/balance", handler.GetWalletBalance)
	}
}

// GenerateChallengeRequest is the request body for generating a PoW challenge
type GenerateChallengeRequest struct {
	TaskID       string `json:"task_id" binding:"required"`
	WorkerWallet string `json:"worker_wallet" binding:"required"`
}

// GenerateChallenge creates a PoW challenge for a task claim
// @Summary Generate PoW challenge
// @Description Creates a proof-of-work challenge for task claiming
// @Tags PoW
// @Accept json
// @Produce json
// @Param request body GenerateChallengeRequest true "Challenge request"
// @Success 200 {object} services.PoWChallenge
// @Failure 400 {object} map[string]string
// @Router /pow/challenge [post]
func (h *OrchestratorHandler) GenerateChallenge(c *gin.Context) {
	var req GenerateChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	// Get task reward to calculate difficulty
	var rewardGSTD float64
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(reward_per_worker, 0.1) FROM tasks WHERE task_id = $1
	`, req.TaskID).Scan(&rewardGSTD)
	if err != nil {
		rewardGSTD = 0.1 // Default reward
	}

	// Generate challenge
	challenge, err := h.pow.GenerateChallenge(c.Request.Context(), req.TaskID, req.WorkerWallet, rewardGSTD)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate challenge: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"challenge":      challenge.Challenge,
		"difficulty":     challenge.Difficulty,
		"expires_at":     challenge.ExpiresAt,
		"task_id":        challenge.TaskID,
		"worker_wallet":  challenge.WorkerWallet,
		"estimated_time": h.pow.GetDifficultyEstimate(challenge.Difficulty),
	})
}

// VerifyProofRequest is the request body for verifying a PoW proof
type VerifyProofRequest struct {
	TaskID       string `json:"task_id" binding:"required"`
	WorkerWallet string `json:"worker_wallet" binding:"required"`
	Nonce        string `json:"nonce" binding:"required"`
}

// VerifyProof verifies a submitted proof-of-work
// @Summary Verify PoW proof
// @Description Verifies a proof-of-work solution
// @Tags PoW
// @Accept json
// @Produce json
// @Param request body VerifyProofRequest true "Proof request"
// @Success 200 {object} services.PoWResult
// @Failure 400 {object} map[string]string
// @Router /pow/verify [post]
func (h *OrchestratorHandler) VerifyProof(c *gin.Context) {
	var req VerifyProofRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	// Validate nonce format
	if err := services.ValidateNonceFormat(req.Nonce); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid nonce: " + err.Error()})
		return
	}

	// Verify proof
	result, err := h.pow.VerifyProof(c.Request.Context(), req.TaskID, req.WorkerWallet, req.Nonce)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "valid": false})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetChallengeStatus gets the current challenge status for a worker
// @Summary Get challenge status
// @Description Returns the current PoW challenge status
// @Tags PoW
// @Produce json
// @Param task_id query string true "Task ID"
// @Param wallet query string true "Worker wallet"
// @Success 200 {object} services.PoWChallenge
// @Router /pow/status [get]
func (h *OrchestratorHandler) GetChallengeStatus(c *gin.Context) {
	taskID := c.Query("task_id")
	wallet := c.Query("wallet")

	if taskID == "" || wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task_id and wallet are required"})
		return
	}

	challenge, err := h.pow.GetChallenge(c.Request.Context(), taskID, wallet)
	if err != nil || challenge == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active challenge found"})
		return
	}

	c.JSON(http.StatusOK, challenge)
}

// GetQueueStats returns queue statistics
// @Summary Get queue stats
// @Description Returns task queue statistics
// @Tags Orchestrator
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /orchestrator/queue/stats [get]
func (h *OrchestratorHandler) GetQueueStats(c *gin.Context) {
	if h.orchestrator == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Orchestrator not available"})
		return
	}

	stats, err := h.orchestrator.GetQueueStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetNextTask returns the next available task for a worker
// @Summary Get next task
// @Description Returns the best available task for the worker
// @Tags Orchestrator
// @Produce json
// @Param wallet query string true "Worker wallet"
// @Success 200 {object} services.TaskQueueItem
// @Router /orchestrator/next-task [get]
func (h *OrchestratorHandler) GetNextTask(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet is required"})
		return
	}

	if h.orchestrator == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Orchestrator not available"})
		return
	}

	// Get worker info from database
	worker := &services.WorkerInfo{
		WalletAddress: wallet,
		TrustScore:    0.5,
		MaxCapacity:   5,
		LastSeen:      time.Now(),
	}

	// Query worker stats
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(trust_score, 0.5), COALESCE(total_tasks_completed, 0)
		FROM worker_ratings WHERE worker_wallet = $1
	`, wallet).Scan(&worker.TrustScore, &worker.ActiveTasks)
	if err != nil {
		// Use defaults for new workers
	}

	task, err := h.orchestrator.GetNextTaskForWorker(c.Request.Context(), worker)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	if task == nil {
		c.JSON(http.StatusNoContent, gin.H{"message": "No suitable tasks available"})
		return
	}

	c.JSON(http.StatusOK, task)
}

// ClaimWithPoWRequest is the request for claiming with PoW
type ClaimWithPoWRequest struct {
	TaskID       string `json:"task_id" binding:"required"`
	WorkerWallet string `json:"worker_wallet" binding:"required"`
	DeviceID     string `json:"device_id"`
}

// ClaimWithPoW claims a task and returns a PoW challenge
// @Summary Claim task with PoW
// @Description Claims a task and returns PoW challenge
// @Tags Orchestrator
// @Accept json
// @Produce json
// @Param request body ClaimWithPoWRequest true "Claim request"
// @Success 200 {object} services.PoWChallenge
// @Router /orchestrator/claim [post]
func (h *OrchestratorHandler) ClaimWithPoW(c *gin.Context) {
	var req ClaimWithPoWRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	if h.orchestrator == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Orchestrator not available"})
		return
	}

	worker := &services.WorkerInfo{
		WalletAddress: req.WorkerWallet,
		TrustScore:    0.5,
		MaxCapacity:   5,
		LastSeen:      time.Now(),
	}

	challenge, err := h.orchestrator.ClaimTaskForWorker(c.Request.Context(), req.TaskID, worker)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if challenge != nil {
		c.JSON(http.StatusOK, gin.H{
			"claimed":        true,
			"task_id":        req.TaskID,
			"challenge":      challenge.Challenge,
			"difficulty":     challenge.Difficulty,
			"expires_at":     challenge.ExpiresAt,
			"estimated_time": h.pow.GetDifficultyEstimate(challenge.Difficulty),
		})
	} else {
		c.JSON(http.StatusOK, gin.H{
			"claimed": true,
			"task_id": req.TaskID,
			"message": "Task claimed without PoW requirement",
		})
	}
}

// CompleteWithPoWRequest is the request for completing with PoW
type CompleteWithPoWRequest struct {
	TaskID        string `json:"task_id" binding:"required"`
	WorkerWallet  string `json:"worker_wallet" binding:"required"`
	Nonce         string `json:"nonce" binding:"required"`
	ResultData    string `json:"result_data"`
	ExecutionTime int    `json:"execution_time_ms"`
}

// CompleteWithPoW completes a task with PoW verification
// @Summary Complete task with PoW
// @Description Completes a task after verifying PoW
// @Tags Orchestrator
// @Accept json
// @Produce json
// @Param request body CompleteWithPoWRequest true "Completion request"
// @Success 200 {object} map[string]interface{}
// @Router /orchestrator/complete [post]
func (h *OrchestratorHandler) CompleteWithPoW(c *gin.Context) {
	var req CompleteWithPoWRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	if h.orchestrator == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Orchestrator not available"})
		return
	}

	result := &services.TaskResult{
		TaskID:        req.TaskID,
		WorkerWallet:  req.WorkerWallet,
		PoWNonce:      req.Nonce,
		ResultData:    []byte(req.ResultData),
		ExecutionTime: req.ExecutionTime,
		Success:       true,
	}

	if err := h.orchestrator.CompleteTask(c.Request.Context(), result); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"completed": true,
		"task_id":   req.TaskID,
		"message":   "Task completed and verified",
	})
}

// GetClientStats returns statistics for a task creator
// @Summary Get client stats
// @Description Returns task and escrow statistics for a client
// @Tags Client
// @Produce json
// @Param wallet query string true "Client wallet"
// @Success 200 {object} map[string]interface{}
// @Router /client/stats [get]
func (h *OrchestratorHandler) GetClientStats(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet is required"})
		return
	}

	var stats struct {
		TotalTasksCreated    int     `json:"total_tasks_created"`
		ActiveTasks          int     `json:"active_tasks"`
		CompletedTasks       int     `json:"completed_tasks"`
		FailedTasks          int     `json:"failed_tasks"`
		TotalSpentGSTD       float64 `json:"total_spent_gstd"`
		TotalLockedGSTD      float64 `json:"total_locked_gstd"`
		AvgCompletionTimeMin float64 `json:"avg_completion_time_min"`
	}

	// Query task stats
	h.db.QueryRowContext(c.Request.Context(), `
		SELECT 
			COUNT(*),
			COUNT(*) FILTER (WHERE status IN ('queued', 'assigned', 'pending')),
			COUNT(*) FILTER (WHERE status = 'completed'),
			COUNT(*) FILTER (WHERE status = 'failed'),
			COALESCE(SUM(budget_gstd), 0),
			COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) FILTER (WHERE completed_at IS NOT NULL), 0)
		FROM tasks WHERE requester_address = $1 OR creator_wallet = $1
	`, wallet).Scan(
		&stats.TotalTasksCreated,
		&stats.ActiveTasks,
		&stats.CompletedTasks,
		&stats.FailedTasks,
		&stats.TotalSpentGSTD,
		&stats.AvgCompletionTimeMin,
	)

	// Query locked escrow
	h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(SUM(total_locked_gstd), 0) 
		FROM task_escrow 
		WHERE creator_wallet = $1 AND status = 'locked'
	`, wallet).Scan(&stats.TotalLockedGSTD)

	c.JSON(http.StatusOK, stats)
}

// GetClientEscrows returns escrow records for a client
// @Summary Get client escrows
// @Description Returns all escrow records for a client
// @Tags Client
// @Produce json
// @Param wallet query string true "Client wallet"
// @Success 200 {object} map[string]interface{}
// @Router /client/escrows [get]
func (h *OrchestratorHandler) GetClientEscrows(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet is required"})
		return
	}

	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT id, task_id, creator_wallet, budget_gstd, platform_fee_gstd, total_locked_gstd,
			   difficulty, task_type, geography, status, locked_at, workers_paid, total_paid_gstd
		FROM task_escrow
		WHERE creator_wallet = $1
		ORDER BY locked_at DESC
		LIMIT 50
	`, wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var escrows []map[string]interface{}
	for rows.Next() {
		var id int
		var taskID, creatorWallet, difficulty, taskType, geography, status string
		var budgetGSTD, platformFeeGSTD, totalLockedGSTD, totalPaidGSTD float64
		var workersPaid int
		var lockedAt time.Time

		if err := rows.Scan(
			&id, &taskID, &creatorWallet, &budgetGSTD, &platformFeeGSTD, &totalLockedGSTD,
			&difficulty, &taskType, &geography, &status, &lockedAt, &workersPaid, &totalPaidGSTD,
		); err != nil {
			continue
		}

		escrows = append(escrows, map[string]interface{}{
			"id":                 id,
			"task_id":            taskID,
			"creator_wallet":     creatorWallet,
			"budget_gstd":        budgetGSTD,
			"platform_fee_gstd":  platformFeeGSTD,
			"total_locked_gstd":  totalLockedGSTD,
			"difficulty":         difficulty,
			"task_type":          taskType,
			"geography":          geography,
			"status":             status,
			"locked_at":          lockedAt,
			"workers_paid":       workersPaid,
			"total_paid_gstd":    totalPaidGSTD,
		})
	}

	if escrows == nil {
		escrows = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{"escrows": escrows})
}

