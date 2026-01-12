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

// verifyDatabaseTables checks that all required tables exist
func verifyDatabaseTables(db *sql.DB) {
	requiredTables := []string{
		"tasks",
		"devices",
		"payout_transactions",
		"failed_payouts",
		"nodes",
		"users",
		"golden_reserve_log",
	}

	ctx := context.Background()
	missingTables := []string{}

	for _, tableName := range requiredTables {
		var exists int
		query := `
			SELECT COUNT(*) 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name = $1
		`
		err := db.QueryRowContext(ctx, query, tableName).Scan(&exists)
		if err != nil || exists == 0 {
			missingTables = append(missingTables, tableName)
		}
	}

	if len(missingTables) > 0 {
		log.Printf("⚠️  Warning: Missing database tables: %v", missingTables)
		log.Printf("   Attempting to create missing tables...")
		
		// Automatically create missing tables
		for _, tableName := range missingTables {
			if err := createMissingTable(ctx, db, tableName); err != nil {
				log.Printf("   ❌ Failed to create table %s: %v", tableName, err)
			} else {
				log.Printf("   ✅ Created table %s", tableName)
			}
		}
	} else {
		log.Println("✅ All required database tables verified")
	}
}

// createMissingTable creates a missing table if it doesn't exist
func createMissingTable(ctx context.Context, db *sql.DB, tableName string) error {
	switch tableName {
	case "devices":
		_, err := db.ExecContext(ctx, `
			CREATE TABLE IF NOT EXISTS devices (
				device_id VARCHAR(255) PRIMARY KEY,
				wallet_address VARCHAR(48) NOT NULL,
				device_type VARCHAR(20) NOT NULL,
				reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
				total_tasks INTEGER NOT NULL DEFAULT 0,
				successful_tasks INTEGER NOT NULL DEFAULT 0,
				failed_tasks INTEGER NOT NULL DEFAULT 0,
				total_energy_consumed INTEGER NOT NULL DEFAULT 0,
				average_response_time_ms INTEGER NOT NULL DEFAULT 0,
				cached_models TEXT[],
				last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
				is_active BOOLEAN NOT NULL DEFAULT true,
				slashing_count INTEGER NOT NULL DEFAULT 0
			)
		`)
		if err != nil {
			return err
		}
		
		// Create indexes
		_, err = db.ExecContext(ctx, `
			CREATE INDEX IF NOT EXISTS idx_devices_reputation ON devices(reputation DESC);
			CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active, reputation DESC);
			CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
			CREATE INDEX IF NOT EXISTS idx_devices_wallet_address ON devices(wallet_address);
		`)
		return err
	default:
		// For other tables, just log that they need manual creation
		log.Printf("   Table %s needs to be created manually via migrations", tableName)
		return nil
	}
}

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

	// Run database migrations (if migrations directory exists)
	// Note: Migrations should be applied manually or via init script
	// This is a fallback for development
	migrationService := services.NewMigrationService(db)
	migrationsDir := "/app/migrations"
	if _, err := os.Stat(migrationsDir); err == nil {
		log.Println("Running database migrations...")
		if err := migrationService.RunMigrations(context.Background(), migrationsDir); err != nil {
			log.Printf("Warning: Failed to run migrations: %v", err)
			// Don't fail startup if migrations fail - might be permission issues
		} else {
			log.Println("✅ Database migrations completed")
		}
	} else {
		// Also try ./migrations (for local development)
		migrationsDir = "./migrations"
		if _, err := os.Stat(migrationsDir); err == nil {
			log.Println("Running database migrations from ./migrations...")
			if err := migrationService.RunMigrations(context.Background(), migrationsDir); err != nil {
				log.Printf("Warning: Failed to run migrations: %v", err)
			} else {
				log.Println("✅ Database migrations completed")
			}
		} else {
			log.Printf("Migrations directory not found (tried /app/migrations and ./migrations) - skipping auto-migrations")
			log.Printf("Please apply migrations manually: docker exec -i gstd_postgres psql -U postgres -d distributed_computing < backend/migrations/fix_devices_table.sql")
		}
	}

	// Verify critical tables exist
	verifyDatabaseTables(db)

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
	cacheService := services.NewCacheService(redisClient) // Cache service for public keys and other data
	tonService.SetCacheService(cacheService)              // Enable caching for TON service
	walletSecurityService := services.NewWalletSecurityService(db)
	deviceService := services.NewDeviceService(db)

	// Initialize ErrorLogger for centralized error logging
	errorLogger := services.NewErrorLogger(db)

	poolMonitorService := services.NewPoolMonitorService(cfg.TON)
	poolMonitorService.SetTONService(tonService)    // Enable real pool balance monitoring
	poolMonitorService.SetErrorLogger(errorLogger) // Enable error logging for pool monitoring
	telegramService := services.NewTelegramService(cfg.Telegram.BotToken, cfg.Telegram.ChatID)
	if telegramService.IsEnabled() {
		log.Println("✅ Telegram notifications enabled")
	}
	
	// Create wallet security log table
	if err := walletSecurityService.CreateWalletAccessLogTable(context.Background()); err != nil {
		log.Printf("Warning: Failed to create wallet access log table: %v", err)
	}
	
	// SECURITY: Validate and secure wallet configuration if provided
	// Check that private key is not empty if wallet address is set
	if cfg.TON.PlatformWalletAddress != "" {
		if cfg.TON.PlatformWalletPrivateKey == "" {
			log.Printf("⚠️  Warning: PLATFORM_WALLET_ADDRESS is set but PLATFORM_WALLET_PRIVATE_KEY is empty")
			log.Printf("   Platform wallet operations will not work without private key")
		} else {
			// Validate private key format
			if err := walletSecurityService.SecureWalletConfig(context.Background(), cfg.TON.PlatformWalletAddress, cfg.TON.PlatformWalletPrivateKey); err != nil {
				log.Printf("⚠️  Warning: Wallet configuration validation failed: %v", err)
				log.Printf("   Platform wallet operations may not work correctly")
			} else {
				log.Printf("✅ Platform wallet configuration validated and secured")
			}
		}
	} else {
		log.Printf("ℹ️  PLATFORM_WALLET_ADDRESS not set - using pull-model (users sign transactions)")
	}
	
	trustService := services.NewTrustV3Service(db)
	assignmentService := services.NewAssignmentService(db, redisClient)
	paymentService := services.NewPaymentService(db, cfg.TON)
	paymentService.SetTONService(tonService) // Enable contract balance checks
	resultService := services.NewResultService(db, encryptionService, paymentService, cfg.TON)
	validationService := services.NewValidationService(db)
	taskService := services.NewTaskService(db, redisClient, tonService, cfg.TON)
	taskService.SetTelegramService(telegramService) // Enable Telegram notifications for new tasks
	timeoutService := services.NewTimeoutService(db)
	timeoutService.SetErrorLogger(errorLogger) // Enable error logging for timeouts
	statsService := services.NewStatsService(db)
	userService := services.NewUserService(db)
	nodeService := services.NewNodeService(db)
	// Enable node_id to wallet_address resolution in payment service
	paymentService.SetNodeService(nodeService)
	taskPaymentService := services.NewTaskPaymentService(db, tonService, cfg.TON)
	taskPaymentService.SetTelegramService(telegramService) // Enable Telegram notifications for completed tasks
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
	
	// Initialize PaymentTracker for reconciliation
	paymentTracker := services.NewPaymentTracker(db, tonService, cfg.TON)
	// Start payment tracker for reconciliation (check every 2 minutes)
	go paymentTracker.Start(ctx)

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
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		
		// CORS headers (adjust for production)
		origin := c.GetHeader("Origin")
		allowedOrigins := []string{"https://app.gstdtoken.com", "http://82.115.48.228", "http://localhost:3000"}
		
		// Always set CORS headers for allowed origins
		if origin != "" {
			for _, allowed := range allowedOrigins {
				if origin == allowed {
					c.Header("Access-Control-Allow-Origin", origin)
					c.Header("Access-Control-Allow-Credentials", "true")
					c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
					// CORS: Explicitly allow Authorization and Content-Type headers for mobile device requests
					c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Wallet-Address, DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Range")
					c.Header("Access-Control-Expose-Headers", "Content-Length, Content-Range")
					break
				}
			}
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
		cacheService,
		errorLogger,
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
