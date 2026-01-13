package api

import (
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
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
) {
	log.Printf("🔧 SetupRoutes: Starting route setup, redisClient type: %T", redisClient)
	
	// Initialize ValidationService dependencies
	validationService.SetDependencies(trustService, entropyService, assignmentService, encryptionService, tonService, cacheService, nodeService)

	// Add error handler middleware
	router.Use(ErrorHandler())
	
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

	// API versioning
	api := router.Group("/api")
	api.Use(APIVersionMiddleware())
	
	v1 := api.Group("/v1")
	{
		// Public endpoints (no session required)
		v1.GET("/version", GetAPIVersion())
		v1.GET("/health", getHealth(db.(*sql.DB), tonService, tonConfig))
		v1.GET("/stats/public", getPublicStats(db.(*sql.DB), tonService, tonConfig, errorLogger))
		v1.GET("/openapi.json", GetOpenAPISpec())
		v1.GET("/network/entropy", getEntropyStats(taskService))
		v1.GET("/pool/status", getPoolStatus(poolMonitorService))
		
		// Metrics endpoint (Prometheus format) - public
		metricsService := NewMetricsService(db.(*sql.DB), redisClient.(*redis.Client))
		v1.GET("/metrics", metricsService.GetMetrics())
		
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
		
		// Tasks (protected)
		protected.POST("/tasks", ValidateTaskRequest(), createTask(taskService))
		protected.GET("/tasks", getTasks(taskService))
		protected.GET("/tasks/:id", getTask(taskService))
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
		
		// Payments (protected)
		protected.POST("/payments/payout-intent", createPayoutIntent(paymentService))

		// Nodes (protected)
		geoService := services.NewGeoService()
		protected.POST("/nodes/register", registerNode(nodeService, geoService))
		protected.GET("/nodes/my", getMyNodes(nodeService))

		// Task Payment (protected)
		protected.POST("/tasks/create", createTaskWithPayment(taskPaymentService, taskRateLimiter))

		// Worker endpoints (protected)
		protected.GET("/tasks/worker/pending", getWorkerPendingTasks(taskPaymentService))
		protected.POST("/tasks/worker/submit", submitWorkerResult(taskPaymentService, rewardEngine))
	}

	// WebSocket endpoint
	router.GET("/ws", HandleWebSocket(hub, deviceService, assignmentService))
}

func getEntropyStats(s *services.TaskService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Public endpoint for network transparency
		c.JSON(200, gin.H{"message": "Entropy monitoring active"})
	}
}

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
			LaborCompensationTon float64                     `json:"labor_compensation_ton"`
			ValidationMethod string                      `json:"validation_method"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
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
				AmountTon: req.LaborCompensationTon,
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
			// Return empty array instead of 500 error to prevent frontend crashes
			c.JSON(200, gin.H{"tasks": []interface{}{}})
			return
		}

		// Ensure we always return an array, even if nil
		if tasks == nil {
			tasks = []*models.Task{}
		}

		c.JSON(200, gin.H{"tasks": tasks})
	}
}

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
					"total_rewards_ton":    0.0,
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
				"total_rewards_ton":    0.0,
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
				"total_rewards_ton":    0.0,
				"active_devices_count": 0,
			})
			return
		}
		
		c.JSON(200, stats)
	}
}

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

func getHealth(db *sql.DB, tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		
		// Check database connection
		dbStatus := "connected"
		if err := db.PingContext(ctx); err != nil {
			dbStatus = "disconnected"
			log.Printf("Health check: Database ping failed: %v", err)
		}
		
		// Get contract balance
		var contractBalance float64 = 0
		var contractStatus string = "unknown"
		if tonConfig.ContractAddress != "" {
			balanceNano, err := tonService.GetContractBalance(ctx, tonConfig.ContractAddress)
			if err != nil {
				contractStatus = "error"
				log.Printf("Health check: Failed to get contract balance: %v", err)
			} else {
				contractStatus = "reachable"
				contractBalance = float64(balanceNano) / 1e9
			}
		} else {
			contractStatus = "not_configured"
		}
		
		// Determine overall health
		status := "healthy"
		if dbStatus != "connected" || contractStatus == "error" {
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

