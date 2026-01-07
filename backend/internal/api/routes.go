package api

import (
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"

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
) {
	// Initialize ValidationService dependencies
	validationService.SetDependencies(trustService, entropyService, assignmentService, encryptionService, tonService)

	v1 := router.Group("/api/v1")
	{
		// Tasks
		v1.POST("/tasks", createTask(taskService))
		v1.GET("/tasks", getTasks(taskService))
		v1.GET("/tasks/:id", getTask(taskService))
		v1.GET("/tasks/:id/payment", getTaskWithPayment(taskPaymentService))

		// Devices
		v1.POST("/devices/register", registerDevice(deviceService))
		v1.GET("/devices", getDevices(deviceService))
		v1.GET("/devices/my", getMyDevices(deviceService))

		// Device endpoints
		v1.GET("/device/tasks/available", getAvailableTasks(assignmentService))
		v1.POST("/device/tasks/:id/claim", claimTask(assignmentService))
		v1.POST("/device/tasks/:id/result", submitResult(resultService, validationService))
		v1.GET("/device/tasks/:id/result", getTaskResult(resultService))

		// Stats
		v1.GET("/stats", getStats(statsService))
		v1.GET("/stats/public", getPublicStats(db.(*sql.DB), tonService, tonConfig))

		// Admin (protected by AdminAuth middleware)
		admin := v1.Group("/admin")
		admin.Use(AdminAuth())
		{
			admin.GET("/health", getAdminHealth(db.(*sql.DB), redisClient.(*redis.Client), rewardEngine, payoutRetryService))
			admin.GET("/withdrawals/pending", getPendingWithdrawals(db.(*sql.DB)))
			admin.POST("/withdrawals/:id/approve", approveWithdrawal(db.(*sql.DB), rewardEngine))
		}

		// Wallet
		v1.GET("/wallet/gstd-balance", getGSTDBalance(tonService, tonConfig))
		v1.GET("/wallet/efficiency", getEfficiency(tonService, tonConfig))

		// Network
		v1.GET("/network/entropy", getEntropyStats(taskService))
		
		// Payments
		v1.POST("/payments/payout-intent", createPayoutIntent(paymentService))

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
		// Implementation
		c.JSON(200, gin.H{"message": "Not implemented"})
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

		balance, err := tonService.GetJettonBalance(c.Request.Context(), address, tonConfig.GSTDJettonAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
		}

		hasGSTD, err := tonService.CheckGSTDBalance(c.Request.Context(), address, tonConfig.GSTDJettonAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
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

		balance, err := tonService.GetJettonBalance(c.Request.Context(), address, tonConfig.GSTDJettonAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
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

