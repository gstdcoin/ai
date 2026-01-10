package api

import (
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"log"

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
) {
	// Initialize ValidationService dependencies
	validationService.SetDependencies(trustService, entropyService, assignmentService, encryptionService, tonService)

	// Add error handler middleware
	router.Use(ErrorHandler())

	v1 := router.Group("/api/v1")
	{
		// Tasks
		v1.POST("/tasks", ValidateTaskRequest(), createTask(taskService))
		v1.GET("/tasks", getTasks(taskService))
		v1.GET("/tasks/:id", getTask(taskService))
		v1.GET("/tasks/:id/payment", getTaskWithPayment(taskPaymentService))

		// Devices
		v1.POST("/devices/register", ValidateDeviceRequest(), registerDevice(deviceService))
		v1.GET("/devices", getDevices(deviceService))
		v1.GET("/devices/my", getMyDevices(deviceService))

		// Device endpoints
		v1.GET("/device/tasks/available", getAvailableTasks(assignmentService))
		v1.POST("/device/tasks/:id/claim", claimTask(assignmentService))
		v1.POST("/device/tasks/:id/result", ValidateResultSubmission(), submitResult(resultService, validationService))
		v1.GET("/device/tasks/:id/result", getTaskResult(resultService))

		// Stats
		v1.GET("/stats", getStats(statsService))
		v1.GET("/stats/public", getPublicStats(db.(*sql.DB), tonService, tonConfig))

		// Admin (protected by RequireAdminWallet middleware)
		admin := v1.Group("/admin")
		admin.Use(RequireAdminWallet(tonConfig))
		{
			admin.GET("/health", getAdminHealth(db.(*sql.DB), redisClient.(*redis.Client), rewardEngine, payoutRetryService))
			admin.GET("/withdrawals/pending", getPendingWithdrawals(db.(*sql.DB)))
			admin.POST("/withdrawals/:id/approve", approveWithdrawal(db.(*sql.DB), rewardEngine))
		}

		// Admin commission endpoints (require admin wallet authorization)
		adminCommissionGroup := v1.Group("/admin/commission")
		adminCommissionGroup.Use(RequireAdminWallet(tonConfig))
		{
			adminCommissionGroup.GET("/balance", getCommissionBalance(paymentService))
			adminCommissionGroup.GET("/withdraw-intent", getCommissionWithdrawIntent(paymentService, tonConfig))
		}

		// Wallet
		v1.GET("/wallet/gstd-balance", getGSTDBalance(tonService, tonConfig))
		v1.GET("/wallet/efficiency", getEfficiency(tonService, tonConfig))

		// Network
		v1.GET("/network/entropy", getEntropyStats(taskService))
		
		// Payments
		v1.POST("/payments/payout-intent", createPayoutIntent(paymentService))
		
		// Pool Monitoring
		v1.GET("/pool/status", getPoolStatus(poolMonitorService))

		// Users
		v1.POST("/users/login", loginUser(userService))

		// Nodes
		v1.POST("/nodes/register", registerNode(nodeService))
		v1.GET("/nodes/my", getMyNodes(nodeService))

		// Task Payment
		v1.POST("/tasks/create", createTaskWithPayment(taskPaymentService, taskRateLimiter))

		// Worker endpoints
		v1.GET("/tasks/worker/pending", getWorkerPendingTasks(taskPaymentService))
		v1.POST("/tasks/worker/submit", submitWorkerResult(taskPaymentService, rewardEngine))
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
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
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
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
		}

		c.JSON(200, gin.H{"devices": devices})
	}
}

func getStats(service *services.StatsService) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := service.GetGlobalStats(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
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

func getPoolStatus(pms *services.PoolMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if pms == nil {
			c.JSON(503, gin.H{"error": "Pool monitor service not available"})
			return
		}
		
		status, err := pms.GetPoolStatusCached(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
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

