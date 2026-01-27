package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"encoding/json"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MarketplaceHandler handles marketplace API routes
type MarketplaceHandler struct {
	db          *sql.DB
	marketplace *services.MarketplaceService
	escrow      *services.EscrowService
	referral    *services.ReferralService
}

// NewMarketplaceHandler creates a new marketplace handler
func NewMarketplaceHandler(db *sql.DB, referral *services.ReferralService) *MarketplaceHandler {
	escrow := services.NewEscrowService(db)
	marketplace := services.NewMarketplaceService(db, escrow, referral)
	return &MarketplaceHandler{
		db:          db,
		marketplace: marketplace,
		escrow:      escrow,
		referral:    referral,
	}
}

// SetupMarketplaceRoutes registers all marketplace routes (legacy, deprecated)
// Use SetupMarketplaceProtectedRoutes for protected endpoints only
func SetupMarketplaceRoutes(router *gin.RouterGroup, handler *MarketplaceHandler) {
	marketplace := router.Group("/marketplace")
	{
		// Public endpoints
		marketplace.GET("/tasks", handler.GetAvailableTasks)
		marketplace.GET("/stats", handler.GetMarketplaceStats)

		// Protected endpoints (require wallet)
		marketplace.POST("/tasks/create", handler.CreateTaskWithEscrow)
		marketplace.POST("/tasks/:id/claim", handler.ClaimTask)
		marketplace.POST("/tasks/:id/complete", handler.CompleteTask)
		marketplace.DELETE("/tasks/:id", handler.DeleteTask)
		marketplace.GET("/tasks/:id/receipts", handler.GetTaskReceipts)
		
		// Worker endpoints
		marketplace.GET("/worker/stats", handler.GetWorkerStats)
		marketplace.GET("/worker/earnings", handler.GetWorkerEarnings)
		
		// Creator endpoints
		marketplace.GET("/my-tasks", handler.GetMyTasks)
		marketplace.GET("/my-transactions", handler.GetMyTransactions)
		
		// Platform stats
		marketplace.GET("/funds", handler.GetPlatformFunds)
	}
}

// SetupMarketplaceProtectedRoutes registers only protected marketplace routes
// Public routes (/tasks, /stats, /funds) should be registered separately without session middleware
func SetupMarketplaceProtectedRoutes(router *gin.RouterGroup, handler *MarketplaceHandler) {
	marketplace := router.Group("/marketplace")
	{
		// Protected endpoints (require wallet via session middleware)
		marketplace.POST("/tasks/create", handler.CreateTaskWithEscrow)
		marketplace.POST("/tasks/:id/claim", handler.ClaimTask)
		marketplace.POST("/tasks/:id/complete", handler.CompleteTask)
		marketplace.DELETE("/tasks/:id", handler.DeleteTask)
		marketplace.GET("/tasks/:id/receipts", handler.GetTaskReceipts)
		
		// Worker endpoints
		marketplace.GET("/worker/stats", handler.GetWorkerStats)
		marketplace.GET("/worker/earnings", handler.GetWorkerEarnings)
		
		// Creator endpoints
		marketplace.GET("/my-tasks", handler.GetMyTasks)
		marketplace.GET("/my-transactions", handler.GetMyTransactions)

		// Payout
		marketplace.POST("/tasks/:id/payout", handler.PayoutTask)
		
		// Crowdfunding
		marketplace.POST("/tasks/:id/contribute", handler.ContributeToTask)
	}
}

// CreateTaskRequest represents a task creation request
type CreateTaskRequest struct {
	TaskType         string  `json:"task_type" binding:"required"`     // network_survey, js_script, wasm_binary
	Operation        string  `json:"operation"`
	BudgetGSTD       float64 `json:"budget_gstd" binding:"required"`
	Difficulty       string  `json:"difficulty"`                        // easy, medium, hard
	MaxWorkers       int     `json:"max_workers"`
	EstimatedTimeSec int     `json:"estimated_time_sec"`
	MinTrustScore    float64 `json:"min_trust_score"`
	Geography        struct {
		Type      string   `json:"type"`      // global, countries
		Countries []string `json:"countries"`
	} `json:"geography"`
	InputSource string `json:"input_source"`
	InputHash   string `json:"input_hash"`
	Model       string `json:"model"`
}

// GetAvailableTasks returns available tasks for workers
// @Summary Get available marketplace tasks
// @Description Returns list of tasks available for workers based on their capabilities
// @Tags Marketplace
// @Produce json
// @Param country query string false "Worker's country code"
// @Param cpu query int false "Worker's CPU cores"
// @Param ram query float64 false "Worker's RAM in GB"
// @Success 200 {array} services.AvailableTask
// @Router /marketplace/tasks [get]
func (h *MarketplaceHandler) GetAvailableTasks(c *gin.Context) {
	workerWallet, _ := c.Get("wallet_address")
	wallet := ""
	if w, ok := workerWallet.(string); ok {
		wallet = w
	}

	country := c.DefaultQuery("country", "")
	
	tasks, err := h.marketplace.GetAvailableTasks(c.Request.Context(), wallet, 0, 0, country)
	if err != nil {
		log.Printf("⚠️  Failed to get available tasks: %v", err)
		c.JSON(http.StatusOK, gin.H{"tasks": []interface{}{}})
		return
	}

	if tasks == nil {
		tasks = []services.AvailableTask{}
	}

	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

// CreateTaskWithEscrow creates a new task with escrow
// @Summary Create a marketplace task
// @Description Creates a new task and locks funds in escrow (budget + 5% fee)
// @Tags Marketplace
// @Accept json
// @Produce json
// @Param request body CreateTaskRequest true "Task creation request"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Router /marketplace/tasks/create [post]
func (h *MarketplaceHandler) CreateTaskWithEscrow(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate
	if req.BudgetGSTD < 0.001 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "minimum budget is 0.001 GSTD"})
		return
	}

	// Default values
	if req.Difficulty == "" {
		req.Difficulty = "medium"
	}
	if req.MaxWorkers <= 0 {
		req.MaxWorkers = 1
	}
	if req.EstimatedTimeSec <= 0 {
		req.EstimatedTimeSec = 30
	}
	if req.Geography.Type == "" {
		req.Geography.Type = "global"
	}

	// Calculate reward per worker
	rewardPerWorker := req.BudgetGSTD / float64(req.MaxWorkers)

	// Create geography object
	geography := &services.Geography{
		Type:      req.Geography.Type,
		Countries: req.Geography.Countries,
	}

	// Create task first (simplified - in production, use TaskService)
	taskID := generateTaskID()
	
	// Insert task into database
	_, err := h.db.ExecContext(c.Request.Context(), `
		INSERT INTO tasks (
			task_id, requester_address, task_type, operation, status,
			budget_gstd, difficulty, max_workers, reward_per_worker,
			estimated_time_sec, min_trust_score, geography,
			input_source, input_hash, model, created_at
		) VALUES (
			$1, $2, $3, $4, 'pending',
			$5, $6, $7, $8,
			$9, $10, $11,
			$12, $13, $14, NOW()
		)
	`, taskID, walletAddress, req.TaskType, req.Operation,
		req.BudgetGSTD, req.Difficulty, req.MaxWorkers, rewardPerWorker,
		req.EstimatedTimeSec, req.MinTrustScore, toJSON(geography),
		req.InputSource, req.InputHash, req.Model)

	if err != nil {
		log.Printf("❌ Failed to create task: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create task"})
		return
	}

	// Create escrow
	escrow, err := h.escrow.LockFunds(
		c.Request.Context(),
		taskID,
		walletAddress.(string),
		req.BudgetGSTD,
		req.TaskType,
		req.Difficulty,
		geography,
	)

	if err != nil {
		log.Printf("❌ Failed to create escrow: %v", err)
		// Rollback task creation
		h.db.ExecContext(c.Request.Context(), 
			"DELETE FROM tasks WHERE task_id = $1", taskID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lock funds"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id":          taskID,
		"escrow_id":        escrow.ID,
		"budget_gstd":      req.BudgetGSTD,
		"platform_fee":     escrow.PlatformFeeGSTD,
		"total_locked":     escrow.TotalLockedGSTD,
		"max_workers":      req.MaxWorkers,
		"reward_per_worker": rewardPerWorker * 0.95, // 95% to worker
		"status":           "pending",
		"message":          "Task created and funds locked in escrow",
	})
}

// ClaimTask allows a worker to claim a task
// @Summary Claim a task
// @Description Worker claims a task for execution
// @Tags Marketplace
// @Param id path string true "Task ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Router /marketplace/tasks/{id}/claim [post]
func (h *MarketplaceHandler) ClaimTask(c *gin.Context) {
	taskID := c.Param("id")
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	var req struct {
		DeviceID string `json:"device_id"`
	}
	c.ShouldBindJSON(&req)

	err := h.marketplace.ClaimTask(c.Request.Context(), taskID, walletAddress.(string), req.DeviceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id": taskID,
		"status":  "claimed",
		"message": "Task claimed successfully",
	})
}

// CompleteTask marks a task as completed and triggers payout
// @Summary Complete a task
// @Description Worker submits task result and receives payout
// @Tags Marketplace
// @Param id path string true "Task ID"
// @Accept json
// @Produce json
// @Success 200 {object} services.TaskReceipt
// @Failure 400 {object} map[string]string
// @Router /marketplace/tasks/{id}/complete [post]
func (h *MarketplaceHandler) CompleteTask(c *gin.Context) {
	taskID := c.Param("id")
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	var req struct {
		ExecutionTimeMs int             `json:"execution_time_ms"`
		QualityScore    float64         `json:"quality_score"`
		ResultData      json.RawMessage `json:"result_data"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.QualityScore <= 0 {
		req.QualityScore = 0.9 // Default quality
	}

	receipt, err := h.marketplace.CompleteTask(
		c.Request.Context(),
		taskID,
		walletAddress.(string),
		req.ExecutionTimeMs,
		req.QualityScore,
		req.ResultData,
	)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, receipt)
}

// GetTaskReceipts returns receipts for a task
// @Summary Get task receipts
// @Description Returns all completion receipts for a task
// @Tags Marketplace
// @Param id path string true "Task ID"
// @Success 200 {array} services.TaskReceipt
// @Router /marketplace/tasks/{id}/receipts [get]
func (h *MarketplaceHandler) GetTaskReceipts(c *gin.Context) {
	taskID := c.Param("id")
	
	receipts, err := h.marketplace.GetTaskReceipts(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if receipts == nil {
		receipts = []services.TaskReceipt{}
	}

	c.JSON(http.StatusOK, gin.H{"receipts": receipts})
}

// GetWorkerStats returns worker statistics
// @Summary Get worker stats
// @Description Returns statistics for the authenticated worker
// @Tags Marketplace
// @Success 200 {object} services.WorkerStats
// @Router /marketplace/worker/stats [get]
func (h *MarketplaceHandler) GetWorkerStats(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	stats, err := h.marketplace.GetWorkerStats(c.Request.Context(), walletAddress.(string))
	if err != nil {
		log.Printf("❌ GetWorkerStats failed for wallet %s: %v", walletAddress.(string), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetWorkerEarnings returns worker earnings history
// @Summary Get worker earnings
// @Description Returns earnings history for the authenticated worker
// @Tags Marketplace
// @Success 200 {array} services.TransactionRecord
// @Router /marketplace/worker/earnings [get]
func (h *MarketplaceHandler) GetWorkerEarnings(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	transactions, err := h.escrow.GetTransactionHistory(c.Request.Context(), walletAddress.(string), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if transactions == nil {
		transactions = []services.TransactionRecord{}
	}

	c.JSON(http.StatusOK, gin.H{"transactions": transactions})
}

// GetMyTasks returns tasks created by the user
// @Summary Get my tasks
// @Description Returns tasks created by the authenticated user
// @Tags Marketplace
// @Success 200 {array} map[string]interface{}
// @Router /marketplace/my-tasks [get]
func (h *MarketplaceHandler) GetMyTasks(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	tasks, err := h.marketplace.GetMyTasks(c.Request.Context(), walletAddress.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if tasks == nil {
		tasks = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

// GetMyTransactions returns transaction history for the user
// @Summary Get my transactions
// @Description Returns transaction history for the authenticated user
// @Tags Marketplace
// @Success 200 {array} services.TransactionRecord
// @Router /marketplace/my-transactions [get]
func (h *MarketplaceHandler) GetMyTransactions(c *gin.Context) {
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	transactions, err := h.escrow.GetTransactionHistory(c.Request.Context(), walletAddress.(string), 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if transactions == nil {
		transactions = []services.TransactionRecord{}
	}

	c.JSON(http.StatusOK, gin.H{"transactions": transactions})
}

// GetPlatformFunds returns platform fund balances (public)
// @Summary Get platform funds
// @Description Returns current platform fund balances (dev fund, gold reserve)
// @Tags Marketplace
// @Success 200 {object} map[string]float64
// @Router /marketplace/funds [get]
func (h *MarketplaceHandler) GetPlatformFunds(c *gin.Context) {
	funds, err := h.escrow.GetPlatformFunds(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"dev_fund":     funds["dev_fund"],
		"gold_reserve": funds["gold_reserve"],
		"description":  "Platform funds: 2% to development, 3% to gold reserve",
	})
}

// GetMarketplaceStats returns marketplace statistics
// @Summary Get marketplace stats
// @Description Returns overall marketplace statistics
// @Tags Marketplace
// @Success 200 {object} map[string]interface{}
// @Router /marketplace/stats [get]
func (h *MarketplaceHandler) GetMarketplaceStats(c *gin.Context) {
	ctx := c.Request.Context()
	
	var totalTasks, activeTasks, completedTasks int
	var totalVolume, totalPayouts float64
	var activeWorkers int

	// Get task counts
	h.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks
	`).Scan(&totalTasks)

	h.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'queued', 'assigned')
	`).Scan(&activeTasks)

	h.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status = 'completed'
	`).Scan(&completedTasks)

	// Get volume
	h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(total_locked_gstd), 0) FROM task_escrow
	`).Scan(&totalVolume)

	// Get payouts
	h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM transaction_history WHERE tx_type = 'worker_payout'
	`).Scan(&totalPayouts)

	// Get active workers
	h.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT worker_wallet) FROM worker_ratings WHERE last_task_at > NOW() - INTERVAL '24 hours'
	`).Scan(&activeWorkers)

	// Get funds
	funds, _ := h.escrow.GetPlatformFunds(ctx)

	c.JSON(http.StatusOK, gin.H{
		"total_tasks":     totalTasks,
		"active_tasks":    activeTasks,
		"completed_tasks": completedTasks,
		"total_volume":    totalVolume,
		"total_payouts":   totalPayouts,
		"active_workers":  activeWorkers,
		"platform_funds":  funds,
	})
}

// DeleteTask allows creators to delete their pending tasks
// @Summary Delete a task
// @Description Creator can delete their own task if it hasn't been claimed yet
// @Tags Marketplace
// @Param id path string true "Task ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /marketplace/tasks/{id} [delete]
func (h *MarketplaceHandler) DeleteTask(c *gin.Context) {
	taskID := c.Param("id")
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	// Check if task exists and belongs to the user
	var requesterAddress string
	var status string
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT requester_address, status FROM tasks WHERE task_id = $1
	`, taskID).Scan(&requesterAddress, &status)

	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}
		log.Printf("❌ Failed to get task: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get task"})
		return
	}

	// Check ownership
	if requesterAddress != walletAddress.(string) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you can only delete your own tasks"})
		return
	}

	// Check status - can only delete if pending or queued (not claimed yet)
	if status != "pending" && status != "queued" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "cannot delete task",
			"reason": "task is already " + status + " - can only delete pending or queued tasks",
		})
		return
	}

	// Delete escrow record first (if exists)
	_, _ = h.db.ExecContext(c.Request.Context(), 
		"DELETE FROM task_escrow WHERE task_id = $1", taskID)

	// Delete the task
	result, err := h.db.ExecContext(c.Request.Context(), 
		"DELETE FROM tasks WHERE task_id = $1 AND requester_address = $2", taskID, walletAddress)
	
	if err != nil {
		log.Printf("❌ Failed to delete task: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete task"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found or already deleted"})
		return
	}

	log.Printf("✅ Task %s deleted by %s", taskID, walletAddress)
	c.JSON(http.StatusOK, gin.H{
		"task_id": taskID,
		"status":  "deleted",
		"message": "Task deleted successfully",
	})
}

// PayoutTask triggers reward distribution for a completed task
func (h *MarketplaceHandler) PayoutTask(c *gin.Context) {
	taskID := c.Param("id")
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	// Release funds (default quality 100% for manual claim if already validated/completed)
	tx, err := h.escrow.ReleaseToWorker(c.Request.Context(), taskID, walletAddress.(string), 1.0)
	if err != nil {
		log.Printf("❌ Payout failed for task %s, wallet %s: %v", taskID, walletAddress, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "payout failed: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id":      taskID,
		"status":       "paid",
		"tx_id":        tx.TxID,
		"amount_gstd": tx.AmountGSTD,
		"message":      "Rewards distributed successfully",
	})
}

// ContributeToTask allows any user to add additional reward to a task
// @Summary Contribute to task reward
// @Description Add GSTD to the task reward pool
// @Tags Marketplace
// @Param id path string true "Task ID"
// @Param request body object true "Contribution amount"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Router /marketplace/tasks/{id}/contribute [post]
func (h *MarketplaceHandler) ContributeToTask(c *gin.Context) {
	taskID := c.Param("id")
	walletAddress, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wallet address required"})
		return
	}

	var req struct {
		AmountGSTD float64 `json:"amount_gstd" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.AmountGSTD <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be positive"})
		return
	}
    
    // Check if task exists and is active
    var status string
    var maxWorkers int
    err := h.db.QueryRowContext(c.Request.Context(), "SELECT status, COALESCE(max_workers, 1) FROM tasks WHERE task_id = $1", taskID).Scan(&status, &maxWorkers)
    if err != nil {
         if err == sql.ErrNoRows {
             c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
         } else {
             log.Printf("Failed to get task status: %v", err)
             c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check task"})
         }
         return
    }
    
    // Allow contributions to pending, queued, or assigned tasks (not completed/failed)
    if status == "completed" || status == "failed" {
         c.JSON(http.StatusBadRequest, gin.H{"error": "cannot contribute to completed or failed task"})
         return
    }

	// Begin transaction
	tx, err := h.db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer tx.Rollback()

	// 1. Check user balance
	var balance float64
	err = tx.QueryRowContext(c.Request.Context(), "SELECT balance FROM users WHERE wallet_address = $1", walletAddress).Scan(&balance)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check balance"})
		return
	}
	
	if balance < req.AmountGSTD {
		c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient balance"})
		return
	}
	
	// 2. Deduct from user
	_, err = tx.ExecContext(c.Request.Context(), `
		UPDATE users SET balance = balance - $1 WHERE wallet_address = $2
	`, req.AmountGSTD, walletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to deduct balance"})
		return
	}

	// 3. Record contribution
	_, err = tx.ExecContext(c.Request.Context(), `
		INSERT INTO task_contributions (task_id, contributor_wallet, amount_gstd, created_at)
		VALUES ($1, $2, $3, NOW())
	`, taskID, walletAddress.(string), req.AmountGSTD)
	if err != nil {
		log.Printf("Failed to record contribution: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record contribution"})
		return
	}
	
	// 4. Update task rewards
	// Increase total_reward_pool, reward_gstd, and reward_per_worker
	rewardIncreasePerWorker := req.AmountGSTD / float64(maxWorkers)
	
	_, err = tx.ExecContext(c.Request.Context(), `
		UPDATE tasks 
		SET total_reward_pool = COALESCE(total_reward_pool, 0) + $2,
		    reward_gstd = COALESCE(reward_gstd, 0) + $2,
		    reward_per_worker = COALESCE(reward_per_worker, 0) + $3,
            labor_compensation_gstd = COALESCE(labor_compensation_gstd, 0) + $2
		WHERE task_id = $1
	`, taskID, req.AmountGSTD, rewardIncreasePerWorker)

	if err != nil {
		log.Printf("Failed to update task pool: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update task reward"})
		return
	}
	
	// 5. Update Escrow record (funds are now locked in escrow system)
	// We assume escrow_id exists on task
	_, err = tx.ExecContext(c.Request.Context(), `
	    UPDATE task_escrow 
        SET total_locked_gstd = total_locked_gstd + $2
        WHERE task_id = $1
	`, taskID, req.AmountGSTD)
	if err != nil {
	    // It's possible task has no escrow if it was created without one (unlikely for marketplace). 
	    // But ignoring error is risky. Let's log.
	    log.Printf("Warning: Failed to update escrow for contribution: %v", err)
	}

	// 6. Record transaction history
	_, err = tx.ExecContext(c.Request.Context(), `
		INSERT INTO transaction_history (
			tx_id, from_wallet, to_wallet, amount_gstd, tx_type, 
			task_id, description, status
		) VALUES ($1, $2, 'escrow', $3, 'contribution', $4, $5, 'confirmed')
	`, "TX-"+randomString(10), walletAddress, req.AmountGSTD, taskID, "Community contribution to task reward")
	
	if err != nil {
	    log.Printf("Failed to record transaction: %v", err)
	    c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record transaction"})
	    return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "commit failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Contribution added successfully",
		"task_id": taskID,
		"amount_added": req.AmountGSTD,
		"new_total_reward": "updated", // client can refresh
	})
}

// Helper functions
func generateTaskID() string {
	return "TASK-" + randomString(12)
}

func randomString(n int) string {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[i%len(letters)]
	}
	return string(b)
}

func toJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}
