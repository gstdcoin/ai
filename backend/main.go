package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"time"

	"distributed-computing-platform/internal/api"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/database"
	"distributed-computing-platform/internal/queue"
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	// Load configuration
	cfg := config.Load()

	// Initialize database with retry logic
	var db *sql.DB
	var err error
	maxRetries := 5
	retryDelay := 5 * time.Second
	
	for i := 0; i < maxRetries; i++ {
		db, err = database.NewConnection(cfg.Database)
		if err == nil {
			break
		}
		log.Printf("Failed to connect to database (attempt %d/%d): %v", i+1, maxRetries, err)
		if i < maxRetries-1 {
			time.Sleep(retryDelay)
		}
	}
	if err != nil {
		log.Fatal("Failed to connect to database after retries:", err)
	}
	defer db.Close()

	// Run database migrations
	migrationService := services.NewMigrationService(db)
	migrationsDir := "./backend/migrations"
	if _, err := os.Stat(migrationsDir); err == nil {
		log.Println("Running database migrations...")
		if err := migrationService.RunMigrations(context.Background(), migrationsDir); err != nil {
			log.Printf("Warning: Failed to run migrations: %v", err)
			// Don't fail startup if migrations fail - might be permission issues
		} else {
			log.Println("✅ Database migrations completed")
		}
	} else {
		log.Printf("Migrations directory not found: %s (skipping migrations)", migrationsDir)
	}

	// Initialize Redis for queue with retry logic
	var redisClient *redis.Client
	for i := 0; i < maxRetries; i++ {
		redisClient, err = queue.NewRedisClient(cfg.Redis)
		if err == nil {
			break
		}
		log.Printf("Failed to connect to Redis (attempt %d/%d): %v", i+1, maxRetries, err)
		if i < maxRetries-1 {
			time.Sleep(retryDelay)
		}
	}
	if err != nil {
		log.Fatal("Failed to connect to Redis after retries:", err)
	}
	defer redisClient.Close()

	// Initialize services
	tonService := services.NewTONService(cfg.TON.APIURL, cfg.TON.APIKey)
	encryptionService := services.NewEncryptionService()
	entropyService := services.NewEntropyService(db)
	_ = services.NewCacheService(redisClient) // Cache service initialized but not directly used in main
	walletSecurityService := services.NewWalletSecurityService(db)
	deviceService := services.NewDeviceService(db)
	poolMonitorService := services.NewPoolMonitorService(cfg.TON)
	
	// Create wallet security log table
	if err := walletSecurityService.CreateWalletAccessLogTable(context.Background()); err != nil {
		log.Printf("Warning: Failed to create wallet access log table: %v", err)
	}
	
	// Validate and secure wallet configuration if provided
	if cfg.TON.PlatformWalletAddress != "" && cfg.TON.PlatformWalletPrivateKey != "" {
		if err := walletSecurityService.SecureWalletConfig(context.Background(), cfg.TON.PlatformWalletAddress, cfg.TON.PlatformWalletPrivateKey); err != nil {
			log.Printf("⚠️  Warning: Wallet configuration validation failed: %v", err)
			log.Printf("   Platform wallet operations may not work correctly")
		} else {
			log.Printf("✅ Platform wallet configuration validated and secured")
		}
	}
	trustService := services.NewTrustV3Service(db)
	assignmentService := services.NewAssignmentService(db, redisClient)
	paymentService := services.NewPaymentService(db, cfg.TON)
	resultService := services.NewResultService(db, encryptionService, paymentService, cfg.TON)
	validationService := services.NewValidationService(db)
	taskService := services.NewTaskService(db, redisClient, tonService, cfg.TON)
	timeoutService := services.NewTimeoutService(db)
	statsService := services.NewStatsService(db)
	userService := services.NewUserService(db)
	nodeService := services.NewNodeService(db)
	// Enable node_id to wallet_address resolution in payment service
	paymentService.SetNodeService(nodeService)
	taskPaymentService := services.NewTaskPaymentService(db, tonService, cfg.TON)
	paymentWatcher := services.NewPaymentWatcher(db, tonService, cfg.TON, taskPaymentService)
	stonFiService := services.NewStonFiService(cfg.TON.StonFiRouter)
	rewardEngine := services.NewRewardEngine(db, tonService, stonFiService, cfg.TON)
	payoutRetryService := services.NewPayoutRetryService(db, rewardEngine)
	rewardEngine.SetPayoutRetry(payoutRetryService)
	taskRateLimiter := services.NewRateLimiter(10, 1*time.Minute) // 10 tasks per minute per wallet

	// Initialize WebSocket hub
	hub := api.NewWSHub()
	go hub.Run()

	// Set task service hub for broadcasting
	taskService.SetHub(hub)
	
	// Set Redis Pub/Sub for horizontal scaling
	// Each server instance subscribes to Redis channel to receive tasks from other instances
	hub.SetRedisPubSub(taskService.GetRedisPubSub())
	
	// Set task service in payment service for broadcasting when payment is confirmed
	taskPaymentService.SetTaskService(taskService)

	// Start timeout checker
	ctx := context.Background()
	go timeoutService.StartTimeoutChecker(ctx, 30*time.Second)

	// Start payment watcher (check every 30 seconds)
	go paymentWatcher.Start(ctx, 30*time.Second)

	// Start payout retry service (check every 15 minutes)
	go payoutRetryService.Start(ctx)

	// Initialize API
	// Set Gin mode from environment (production should use "release")
	ginMode := os.Getenv("GIN_MODE")
	if ginMode == "" {
		// Default to release mode for production safety
		ginMode = "release"
	}
	gin.SetMode(ginMode)
	
	router := gin.Default()
	
	// Add security headers middleware
	router.Use(func(c *gin.Context) {
		// Security headers
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		
		// CORS headers (adjust for production)
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Wallet-Address")
		}
		
		// Handle preflight requests
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})
	api.SetupRoutes(
		router, 
		taskService, 
		deviceService, 
		validationService, 
		paymentService, 
		tonService, 
		cfg.TON, 
		assignmentService, 
		resultService,
		statsService,
		trustService,
		hub,
		encryptionService,
		entropyService,
		userService,
		nodeService,
		taskPaymentService,
		rewardEngine,
		taskRateLimiter,
		db,
		redisClient,
		payoutRetryService,
		poolMonitorService,
	)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
