package api

import (
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/redis/go-redis/v9"
	"github.com/gin-contrib/gzip"
)

func SetupRoutes(
	router *gin.Engine,
	taskService *services.TaskService,
	deviceService *services.DeviceService,
	validationService *services.ValidationService,
	paymentService *services.PaymentService,
	tonService *services.TONService,
	tonConfig config.TONConfig,
	assignmentService *services.AssignmentService,
	resultService *services.ResultService,
	statsService *services.StatsService,
	trustService *services.TrustV3Service,
	hub *WSHub,
	encryptionService *services.EncryptionService,
	entropyService *services.EntropyService,
	userService *services.UserService,
	nodeService *services.NodeService,
	taskPaymentService *services.TaskPaymentService,
	rewardEngine *services.RewardEngine,
	taskRateLimiter *services.RateLimiter,
	db interface{},
	redisClient interface{},
	payoutRetryService *services.PayoutRetryService,
	poolMonitorService *services.PoolMonitorService,
	cacheService *services.CacheService,
	errorLogger *services.ErrorLogger,
	powService *services.ProofOfWorkService,
	taskOrchestrator *services.TaskOrchestrator,
	telegramService *services.TelegramService,
	lendingService *services.LendingService,
) {
	log.Printf("🔧 SetupRoutes: Starting route setup, redisClient type: %T", redisClient)
	
	// Initialize ValidationService dependencies
	validationService.SetDependencies(trustService, entropyService, assignmentService, encryptionService, tonService, cacheService, nodeService)

	// [MOBILE_OPTIMIZATION_START]
	// Enable Gzip compression (Level 5 for balance between CPU/Bandwidth)
	router.Use(gzip.Gzip(gzip.BestSpeed))
	
	// Add Mobile Optimization Middleware
	router.Use(func(c *gin.Context) {
		userAgent := c.GetHeader("User-Agent")
		if isMobile(userAgent) {
			// Set shorter timeout for mobile to fail fast and retry
			c.Header("X-Mobile-Optimization", "Active")
			c.Set("is_mobile", true)
		}
		c.Next()
	})
	// [MOBILE_OPTIMIZATION_END]

	// Add error handler middleware
	router.Use(ErrorHandler())

    // LIMIT PAYLOAD SIZE (Security)
    router.Use(func(c *gin.Context) {
        c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2 * 1024 * 1024) // 2MB Limit
        c.Next()
    })
	
	// Add rate limiter if Redis is available
	var rateLimiter *RateLimiter
	if redisClient != nil {
		if rc, ok := redisClient.(*redis.Client); ok && rc != nil {
			rateLimiter = NewRateLimiter(rc)
			router.Use(rateLimiter.RateLimitMiddleware())
			log.Printf("✅ Rate limiter initialized with Redis client")
		} else {
			log.Printf("⚠️  Rate limiter: Redis client type assertion failed")
		}
	} else {
		log.Printf("⚠️  Rate limiter: Redis client is nil")
	}

	// Services - Initialize ReferralService locally as it was added later
	// We cast the interface{} db to *sql.DB safely because we know it is *sql.DB from main.go
	dbConn, ok := db.(*sql.DB)
	if !ok {
		log.Fatal("SetupRoutes: db is not *sql.DB")
	}
	referralService := services.NewReferralService(dbConn)

	// API versioning
	api := router.Group("/api")
	api.Use(APIVersionMiddleware())
	
	v1 := api.Group("/v1")
	{
		// Public endpoints (no session required)
		v1.GET("/version", GetAPIVersion())
		// @Summary Health check
		// @Description Returns the health status of the API, database, and TON contract
		// @Tags Public
		// @Produce json
		// @Success 200 {object} map[string]interface{} "Service health status"
		// @Router /health [get]
		// Cast redisClient to *redis.Client for health handler
		var rClient *redis.Client
		if redisClient != nil {
			if rc, ok := redisClient.(*redis.Client); ok {
				rClient = rc
			}
		}
		v1.GET("/health", getHealth(db.(*sql.DB), tonService, tonConfig, rClient))
		// @Summary Get public statistics
		// @Description Returns public platform statistics (no authentication required)
		// @Tags Public
		// @Produce json
		// @Success 200 {object} map[string]interface{} "Public statistics"
		// @Router /stats/public [get]
		v1.GET("/stats/public", getPublicStats(db.(*sql.DB), tonService, tonConfig, errorLogger))
		v1.GET("/openapi.json", GetOpenAPISpec())
		v1.GET("/network/entropy", getEntropyStats(taskService))
		v1.GET("/network/stats", getNetworkStats(statsService))
		v1.GET("/network/map", getNetworkMap(db.(*sql.DB)))
		// @Summary Get pool status
		// @Description Returns GSTD/XAUt liquidity pool status
		// @Tags Public
		// @Produce json
		// @Success 200 {object} map[string]interface{} "Pool status"
		// @Router /pool/status [get]
		v1.GET("/pool/status", getPoolStatus(poolMonitorService))
		
		v1.GET("/lending/quote", getLoanQuote(lendingService))
		
		// Metrics endpoint (Prometheus format) - public
		metricsService := NewMetricsService(db.(*sql.DB), redisClient.(*redis.Client))
		v1.GET("/metrics", metricsService.GetMetrics())
		

		// Telegram Webhook
		v1.POST("/telegram/webhook", func(c *gin.Context) {
			body, err := c.GetRawData()
			if err != nil {
				c.JSON(400, gin.H{"error": "failed to read body"})
				return
			}
			// Process in background or synchronously? Synchronous is fine for now as it just sends a request.
			// But keep it fast.
			if err := telegramService.ProcessWebhook(c.Request.Context(), body); err != nil {
				log.Printf("Telegram webhook error: %v", err)
			}
			c.Status(200)
		})

		// Users - login is public
		tonConnectValidator := services.NewTonConnectValidator(tonService)
		if errorLogger != nil {
			tonConnectValidator.SetErrorLogger(errorLogger)
		}
		var redisClientForLogin *redis.Client
		if redisClient != nil {
			if rc, ok := redisClient.(*redis.Client); ok && rc != nil {
				redisClientForLogin = rc
			}
		}
		v1.POST("/users/login", loginUser(userService, tonConnectValidator, redisClientForLogin))

		// Protected endpoints (require session)
		var sessionMiddleware gin.HandlerFunc
		if redisClient != nil {
			if rc, ok := redisClient.(*redis.Client); ok && rc != nil {
				sessionMiddleware = ValidateSession(rc)
				log.Printf("✅ Session middleware initialized and will be applied to protected routes")
			} else {
				log.Printf("⚠️  Redis client type assertion failed or is nil")
			}
		} else {
			log.Printf("⚠️  Redis client is nil - session middleware will not be applied")
		}
		
		// Apply session middleware to protected routes
		protected := v1.Group("")
		if sessionMiddleware != nil {
			protected.Use(sessionMiddleware)
			log.Printf("✅ Session middleware applied to protected group (includes /tasks and /nodes)")
		} else {
			log.Printf("⚠️  Session middleware is nil - protected routes will NOT require session")
		}
		
		// Referrals
		referrals := protected.Group("/referrals")
		{
			referrals.GET("/stats", getReferralStats(referralService, userService))
			referrals.POST("/apply", applyReferralCode(referralService, userService))
		}

		// User data
		protected.GET("/users/balance", getUserBalance(tonService, tonConfig))

		// Tasks (protected)
		protected.POST("/tasks", ValidateTaskRequest(), createTask(taskService))
		protected.GET("/tasks", getTasks(taskService))
		protected.GET("/tasks/:id", getTask(taskService))
		protected.DELETE("/tasks/:id", deleteTask(db.(*sql.DB)))
		protected.GET("/tasks/:id/payment", getTaskWithPayment(taskPaymentService))

		// Devices (protected)
		protected.POST("/devices/register", ValidateDeviceRequest(errorLogger), registerDevice(deviceService, errorLogger))
		protected.GET("/devices", getDevices(deviceService))
		protected.GET("/devices/my", getMyDevices(deviceService))

		// Device endpoints (protected)
		protected.GET("/device/tasks/available", getAvailableTasks(assignmentService))
		protected.POST("/device/tasks/:id/claim", claimTask(assignmentService))
		protected.POST("/device/tasks/:id/result", ValidateResultSubmission(), submitResult(resultService, validationService))
		protected.GET("/device/tasks/:id/result", getTaskResult(resultService))

		// Stats (protected, except /stats/public which is public)
		protected.GET("/stats", getStats(statsService))
		protected.GET("/stats/tasks/completion", getTaskCompletionHistory(statsService))

		// Admin (protected by session + RequireAdminWallet middleware)
		admin := protected.Group("/admin")
		admin.Use(RequireAdminWallet(tonConfig))
		{
			admin.GET("/health", getAdminHealth(db.(*sql.DB), redisClient.(*redis.Client), rewardEngine, payoutRetryService))
			admin.GET("/withdrawals/pending", getPendingWithdrawals(db.(*sql.DB)))
			admin.POST("/withdrawals/:id/approve", approveWithdrawal(db.(*sql.DB), rewardEngine))
		}

		// Admin commission endpoints (require session + admin wallet authorization)
		adminCommissionGroup := protected.Group("/admin/commission")
		adminCommissionGroup.Use(RequireAdminWallet(tonConfig))
		{
			adminCommissionGroup.GET("/balance", getCommissionBalance(paymentService))
			adminCommissionGroup.GET("/withdraw-intent", getCommissionWithdrawIntent(paymentService, tonConfig))
		}

		// Wallet (protected)
		protected.GET("/wallet/gstd-balance", getGSTDBalance(tonService, tonConfig))
		protected.GET("/wallet/efficiency", getEfficiency(tonService, tonConfig))
		protected.GET("/wallet/jetton-address", getJettonAddress(tonService, tonConfig))
		
		// Payments (protected)
		protected.POST("/payments/payout-intent", createPayoutIntent(paymentService))

		// Nodes (protected)
		geoService := services.NewGeoService(rClient)
		protected.POST("/nodes/register", registerNode(nodeService, geoService, telegramService))
		protected.GET("/nodes/my", getMyNodes(nodeService))

		// Task Payment (protected)
		protected.POST("/tasks/create", createTaskWithPayment(taskPaymentService, taskRateLimiter))

		// Worker endpoints (protected)
		protected.GET("/tasks/worker/pending", getWorkerPendingTasks(taskPaymentService))
		protected.POST("/tasks/worker/submit", submitWorkerResult(taskPaymentService, rewardEngine))

		// Marketplace endpoints - split into public and protected
		marketplaceHandler := NewMarketplaceHandler(db.(*sql.DB), referralService)
		// Public marketplace endpoints (no session required)
		v1.GET("/marketplace/tasks", marketplaceHandler.GetAvailableTasks)
		v1.GET("/marketplace/stats", marketplaceHandler.GetMarketplaceStats)
		v1.GET("/marketplace/funds", marketplaceHandler.GetPlatformFunds)
		// Protected marketplace endpoints (require session)
		SetupMarketplaceProtectedRoutes(protected, marketplaceHandler)

		// Initialize and setup Orchestrator routes (PoW, Task Queue, Client Dashboard)
		orchestratorHandler := NewOrchestratorHandler(db.(*sql.DB), taskOrchestrator, powService, tonService)
		SetupOrchestratorRoutes(v1, orchestratorHandler)
		log.Printf("✅ Orchestrator routes registered")
	}

	// WebSocket endpoint
	router.GET("/ws", HandleWebSocket(hub, deviceService, assignmentService))
}

func isMobile(ua string) bool {
	// Simple heuristic
	ua = strings.ToLower(ua)
	return strings.Contains(ua, "android") || strings.Contains(ua, "iphone")
}

func getEntropyStats(s *services.TaskService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Public endpoint for network transparency
		c.JSON(200, gin.H{"message": "Entropy monitoring active"})
	}
}

// createPayoutIntent creates a payout intent for task execution
// @Summary Create payout intent
// @Description Create a payout intent for task executor to claim rewards
// @Tags Payments
// @Accept json
// @Produce json
// @Security SessionToken
// @Param request body object true "Payout intent request" example({"task_id":"...","executor_address":"EQ..."})
// @Success 200 {object} services.PayoutIntent "Payout intent created"
// @Failure 400 {object} map[string]string "Invalid request"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /payments/payout-intent [post]
func createPayoutIntent(service *services.PaymentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TaskID          string `json:"task_id"`
			ExecutorAddress string `json:"executor_address"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": SanitizeError(err)})
			return
		}

		if req.TaskID == "" || req.ExecutorAddress == "" {
			c.JSON(400, gin.H{"error": "task_id and executor_address are required"})
			return
		}

		intent, err := service.BuildPayoutIntent(c.Request.Context(), req.TaskID, req.ExecutorAddress)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, intent)
	}
}

// createTask creates a new computing task
// @Summary Create task
// @Description Create a new distributed computing task
// @Tags Tasks
// @Accept json
// @Produce json
// @Security SessionToken
// @Param request body object true "Task creation request"
// @Success 200 {object} models.Task "Task created successfully"
// @Failure 400 {object} map[string]string "Invalid request"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /tasks [post]
func createTask(service *services.TaskService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			RequesterAddress string                      `json:"requester_address"`
			TaskType         string                      `json:"task_type"`
			Operation        string                      `json:"operation"`
			Model            string                      `json:"model"`
			InputSource      string                      `json:"input_source"`
			InputHash        string                      `json:"input_hash"`
			TimeLimitSec     int                         `json:"time_limit_sec"`
			MaxEnergyMwh     int                         `json:"max_energy_mwh"`
			LaborCompensationGSTD float64                     `json:"labor_compensation_gstd"`
			ValidationMethod string                      `json:"validation_method"`
		}

		if err := c.ShouldBindBodyWith(&req, binding.JSON); err != nil {
			c.JSON(400, gin.H{"error": SanitizeError(err)})
			return
		}

		descriptor := &models.TaskDescriptor{
			TaskType: req.TaskType,
			Operation: req.Operation,
			Model: req.Model,
			Input: models.InputData{
				Source: req.InputSource,
				Hash:   req.InputHash,
			},
			Constraints: models.Constraints{
				TimeLimitSec: req.TimeLimitSec,
				MaxEnergyMwh: req.MaxEnergyMwh,
			},
			Reward: models.Reward{
				AmountGSTD: req.LaborCompensationGSTD,
			},
			Validation: req.ValidationMethod,
			MinTrust: c.GetFloat64("min_trust"), // Optional from middleware or query
			IsPrivate: c.GetBool("is_private"),
		}

		task, err := service.CreateTask(c.Request.Context(), req.RequesterAddress, descriptor)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, task)
	}
}

func getTasks(service *services.TaskService) gin.HandlerFunc {
	return func(c *gin.Context) {
		requester := c.Query("requester")
		var requesterPtr *string
		if requester != "" {
			requesterPtr = &requester
		}

		tasks, err := service.GetTasks(c.Request.Context(), requesterPtr)
		if err != nil {
			log.Printf("Error getting tasks: %v", err)
			// Return 500 to signal real backend error instead of silently hiding it
			c.JSON(500, gin.H{
				"error":   "failed to load tasks",
				"message": "Unable to retrieve tasks. Please try again later.",
			})
			return
		}

		// Ensure we always return an array, even if nil
		if tasks == nil {
			tasks = []*models.Task{}
		}

		c.JSON(200, gin.H{"tasks": tasks})
	}
}

// getTask retrieves a specific task by ID
// @Summary Get task by ID
// @Description Get detailed information about a specific task
// @Tags Tasks
// @Produce json
// @Security SessionToken
// @Param id path string true "Task ID"
// @Success 200 {object} models.Task "Task details"
// @Failure 400 {object} map[string]string "Task not found"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /tasks/{id} [get]
func getTask(service *services.TaskService) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		if taskID == "" {
			c.JSON(400, gin.H{"error": "task id is required"})
			return
		}

		// Use GetTaskByID method directly (efficient query by ID)
		task, err := service.GetTaskByID(c.Request.Context(), taskID)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(404, gin.H{"error": "task not found"})
				return
			}
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
		}
		c.JSON(200, task)
	}
}

func getTaskWithPayment(taskPaymentService *services.TaskPaymentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		if taskID == "" {
			c.JSON(400, gin.H{"error": "task id is required"})
			return
		}

		task, err := taskPaymentService.GetTaskByID(c.Request.Context(), taskID)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(404, gin.H{"error": "task not found"})
				return
			}
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, task)
	}
}

// deleteTask deletes a pending task
// @Summary Delete task
// @Description Delete a pending task that hasn't been claimed yet
// @Tags Tasks
// @Param id path string true "Task ID"
// @Success 200 {object} map[string]interface{} "Task deleted"
// @Failure 400 {object} map[string]string "Task cannot be deleted"
// @Failure 403 {object} map[string]string "Not authorized"
// @Failure 404 {object} map[string]string "Task not found"
// @Router /tasks/{id} [delete]
func deleteTask(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		if taskID == "" {
			c.JSON(400, gin.H{"error": "task id is required"})
			return
		}

		walletAddress, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "wallet address required"})
			return
		}

		// Check if task exists and belongs to the user
		var requesterAddress string
		var status string
		err := db.QueryRowContext(c.Request.Context(), `
			SELECT requester_address, status FROM tasks WHERE task_id = $1
		`, taskID).Scan(&requesterAddress, &status)

		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(404, gin.H{"error": "task not found"})
				return
			}
			log.Printf("Failed to get task: %v", err)
			c.JSON(500, gin.H{"error": "failed to get task"})
			return
		}

		// Check ownership
		if requesterAddress != walletAddress.(string) {
			c.JSON(403, gin.H{"error": "you can only delete your own tasks"})
			return
		}

		// Check status - can only delete if pending or queued (not claimed yet)
		if status != "pending" && status != "queued" {
			c.JSON(400, gin.H{
				"error": "cannot delete task",
				"reason": "task is already " + status + " - can only delete pending or queued tasks",
			})
			return
		}

		// Delete the task
		result, err := db.ExecContext(c.Request.Context(), 
			"DELETE FROM tasks WHERE task_id = $1 AND requester_address = $2", taskID, walletAddress)
		
		if err != nil {
			log.Printf("Failed to delete task: %v", err)
			c.JSON(500, gin.H{"error": "failed to delete task"})
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			c.JSON(404, gin.H{"error": "task not found or already deleted"})
			return
		}

		log.Printf("Task %s deleted by %s", taskID, walletAddress)
		c.JSON(200, gin.H{
			"task_id": taskID,
			"status":  "deleted",
			"message": "Task deleted successfully",
		})
	}
}

func getDevices(service *services.DeviceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		devices, err := service.GetDevices(c.Request.Context())
		if err != nil {
			log.Printf("Error getting devices: %v", err)
			// Return empty array instead of 500 error to prevent frontend crashes
			c.JSON(200, gin.H{"devices": []interface{}{}})
			return
		}

		// Ensure we always return an array, even if nil
		if devices == nil {
			devices = []map[string]interface{}{}
		}

		c.JSON(200, gin.H{"devices": devices})
	}
}

// getStats retrieves user statistics
// @Summary Get user statistics
// @Description Get statistics for the authenticated user
// @Tags Statistics
// @Produce json
// @Security SessionToken
// @Success 200 {object} map[string]interface{} "User statistics"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /stats [get]
func getStats(service *services.StatsService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Recover from any panics to prevent 500 errors
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic in getStats handler: %v", r)
				c.JSON(200, gin.H{
					"processing_tasks":    0,
					"queued_tasks":         0,
					"completed_tasks":      0,
					"total_rewards_gstd":   0.0,
					"active_devices_count": 0,
				})
			}
		}()

		stats, err := service.GetGlobalStats(c.Request.Context())
		if err != nil {
			log.Printf("Error getting global stats: %v", err)
			// Return safe defaults instead of 500 error to prevent frontend crashes
			c.JSON(200, gin.H{
				"processing_tasks":    0,
				"queued_tasks":         0,
				"completed_tasks":      0,
				"total_rewards_gstd":   0.0,
				"active_devices_count": 0,
			})
			return
		}
		
		// Ensure stats is not nil
		if stats == nil {
			log.Printf("Warning: GetGlobalStats returned nil stats")
			c.JSON(200, gin.H{
				"processing_tasks":    0,
				"queued_tasks":         0,
				"completed_tasks":      0,
				"total_rewards_gstd":   0.0,
				"active_devices_count": 0,
			})
			return
		}
		
		c.JSON(200, stats)
	}
}

// getGSTDBalance retrieves GSTD token balance for the authenticated user
// @Summary Get GSTD balance
// @Description Get GSTD token balance from TON blockchain
// @Tags Wallet
// @Produce json
// @Security SessionToken
// @Success 200 {object} map[string]interface{} "GSTD balance information"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /wallet/gstd-balance [get]
func getGSTDBalance(tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		address := c.Query("address")
		if address == "" {
			c.JSON(400, gin.H{"error": "address parameter is required"})
			return
		}

		// Normalize address for TON API (convert raw to user-friendly if needed)
		normalizedAddress := services.NormalizeAddressForAPI(address)

		balance, err := tonService.GetJettonBalance(c.Request.Context(), normalizedAddress, tonConfig.GSTDJettonAddress)
		if err != nil {
			// Don't fail completely - return 0 balance if API fails
			log.Printf("GetGSTDBalance: Error getting balance: %v, returning 0", err)
			balance = 0
		}

		hasGSTD, err := tonService.CheckGSTDBalance(c.Request.Context(), normalizedAddress, tonConfig.GSTDJettonAddress)
		if err != nil {
			// Don't fail completely - assume false if check fails
			log.Printf("GetGSTDBalance: Error checking balance: %v, assuming false", err)
			hasGSTD = false
		}

		c.JSON(200, gin.H{
			"balance":  balance,
			"has_gstd": hasGSTD,
		})
	}
}

func getJettonAddress(tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		owner := c.Query("owner")
		if owner == "" {
			c.JSON(400, gin.H{"error": "owner parameter is required"})
			return
		}

		jettonMaster := c.DefaultQuery("jetton", tonConfig.GSTDJettonAddress)

		address, err := tonService.GetJettonWalletAddress(c.Request.Context(), owner, jettonMaster)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		// Normalize to user-friendly format (EQ...) for TonConnect SDK
		normalizedAddress := services.NormalizeAddressForAPI(address)

		c.JSON(200, gin.H{"address": normalizedAddress})
	}
}

func getEfficiency(tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		address := c.Query("address")
		if address == "" {
			c.JSON(400, gin.H{"error": "address parameter is required"})
			return
		}

		// Normalize address for TON API (convert raw to user-friendly if needed)
		normalizedAddress := services.NormalizeAddressForAPI(address)

		balance, err := tonService.GetJettonBalance(c.Request.Context(), normalizedAddress, tonConfig.GSTDJettonAddress)
		if err != nil {
			// Don't fail completely - return 0 balance if API fails
			log.Printf("GetEfficiency: Error getting balance: %v, using 0", err)
			balance = 0
		}

		// Calculate efficiency
		efficiencyService := services.NewEfficiencyService()
		breakdown := efficiencyService.GetEfficiencyBreakdown(balance)

		c.JSON(200, gin.H{
			"gstd_balance":          breakdown.GSTDBalance,
			"efficiency":            breakdown.Efficiency,
			"cost_reduction_percent": breakdown.CostReduction,
			"final_cost_multiplier":  breakdown.FinalCostMultiplier,
			"priority_multiplier":    1.0 / breakdown.Efficiency,
		})
	}
}

func getHealth(db *sql.DB, tonService *services.TONService, tonConfig config.TONConfig, rClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		
		// Check database connection
		dbStatus := "connected"
		if err := db.PingContext(ctx); err != nil {
			dbStatus = "disconnected"
			log.Printf("Health check: Database ping failed: %v", err)
		}
		
		// Get contract balance (cached for 2 minutes to avoid rate limits)
		var contractBalance float64 = 0
		var contractStatus string = "unknown"
		if tonConfig.ContractAddress != "" {
			// Try to get cached balance from Redis
			cacheKey := "health:contract_balance"
			cacheHit := false
			
			if rClient != nil {
				if val, err := rClient.Get(ctx, cacheKey).Float64(); err == nil {
					cacheHit = true
					contractStatus = "reachable"
					contractBalance = val
				}
			}
			
			// If cache miss, fetch from TON API
			if !cacheHit {
				balanceNano, err := tonService.GetContractBalance(ctx, tonConfig.ContractAddress)
				if err != nil {
					contractStatus = "error"
					// Don't spam logs with rate limit errors
					if !strings.Contains(err.Error(), "429") {
						log.Printf("Health check: Failed to get contract balance: %v", err)
					}
				} else {
					contractStatus = "reachable"
					contractBalance = float64(balanceNano) / 1e9
					// Cache for 30 seconds
					if rClient != nil {
						rClient.Set(ctx, cacheKey, contractBalance, 30*time.Second)
					}
				}
			}
		} else {
			contractStatus = "not_configured"
		}
		
		// Determine overall health
		status := "healthy"
		if dbStatus != "connected" {
			status = "unhealthy"
		}
		
		c.JSON(200, gin.H{
			"status": status,
			"database": gin.H{
				"status": dbStatus,
			},
			"contract": gin.H{
				"address": tonConfig.ContractAddress,
				"status":  contractStatus,
				"balance_ton": contractBalance,
			},
			"timestamp": time.Now().Unix(),
		})
	}
}

func getPoolStatus(pms *services.PoolMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if pms == nil {
			c.JSON(503, gin.H{"error": "Pool monitor service not available"})
			return
		}
		
		status, err := pms.GetPoolStatusCached(c.Request.Context())
		if err != nil {
			// Log error but return a safe default status instead of 500
			// This prevents API failures when balance queries fail
			log.Printf("⚠️  Pool status error (returning safe default): %v", err)
			c.JSON(200, gin.H{
				"pool_address": "",
				"gstd_balance": 0,
				"xaut_balance": 0,
				"total_value_usd": 0,
				"last_updated": time.Now(),
				"is_healthy": false,
				"reserve_ratio": 0,
				"error": "Failed to fetch pool status",
			})
			return
		}
		
		c.JSON(200, status)
	}
}

func getCommissionBalance(service *services.PaymentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		balance, err := service.GetCommissionBalance(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		
		c.JSON(200, balance)
	}
}

func getCommissionWithdrawIntent(service *services.PaymentService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get admin wallet from context (set by RequireAdminWallet middleware)
		adminWallet, exists := c.Get("admin_wallet")
		if !exists {
			c.JSON(500, gin.H{"error": "Admin wallet not found in context"})
			return
		}

		// Get commission balance
		balance, err := service.GetCommissionBalance(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		if balance.TotalCommission <= 0 {
			c.JSON(400, gin.H{"error": "No commission available to withdraw"})
			return
		}

		// Generate withdraw intent for admin
		// Admin will sign this transaction via TonConnect to withdraw commission
		amountNano := int64(balance.TotalCommission * 1e9)

		// For now, commission is already in admin wallet (sent by escrow contract)
		// This endpoint just returns the balance information
		// In future, if commission accumulates elsewhere, we can add actual withdrawal logic
		
		c.JSON(200, gin.H{
			"admin_wallet":      adminWallet,
			"total_commission":  balance.TotalCommission,
			"amount_nano":       amountNano,
			"pending_tasks":     balance.PendingTasks,
			"claimed_tasks":     balance.ClaimedTasks,
			"message":           "Commission is automatically sent to admin wallet by escrow contract. Check your wallet balance.",
		})
	}
}


// getLoanQuote calculates loan terms
// getLoanQuote calculates loan terms
// @Summary Get loan quote
// @Description Calculate loan terms (LTV, APR) for GSTD collateral
// @Tags Finance
// @Produce json
// @Security SessionToken
// @Param amount_gstd query number true "GSTD Amount"
// @Success 200 {object} services.LoanOffer "Loan offer"
// @Failure 400 {object} map[string]string "Invalid request"
// @Router /lending/quote [get]
func getLoanQuote(service *services.LendingService) gin.HandlerFunc {
	return func(c *gin.Context) {
		amountStr := c.Query("amount_gstd")
		if amountStr == "" {
			c.JSON(400, gin.H{"error": "amount_gstd is required"})
			return
		}
		
		var amount float64
		if _, err := fmt.Sscanf(amountStr, "%f", &amount); err != nil {
			c.JSON(400, gin.H{"error": "invalid amount format"})
			return
		}

		offer, err := service.CalculateLoanTerms(amount)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, offer)
	}
}
