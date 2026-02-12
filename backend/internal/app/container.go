package app

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/api"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/database"
	"distributed-computing-platform/internal/queue"
	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/dig"
	"log"
	"os"
	"time"
)

// BuildContainer constructs the dependency injection container
func BuildContainer() *dig.Container {
	c := dig.New()

	// 1. Basic configuration and infrastructure
	c.Provide(func() *config.Config {
		return config.Load()
	})
	
	c.Provide(func(cfg *config.Config) config.TONConfig {
		return cfg.TON
	})

	c.Provide(func(cfg *config.Config) (*sql.DB, error) {
		return database.NewConnection(cfg.Database)
	})

	c.Provide(func(cfg *config.Config) (*redis.Client, error) {
		return queue.NewRedisClient(cfg.Redis)
	})

	c.Provide(func() *api.WSHub {
		return api.NewWSHub()
	})

	// 2. Services Initialization
	c.Provide(services.NewEncryptionService)
	c.Provide(services.NewEntropyService)
	c.Provide(services.NewCacheService)
	c.Provide(services.NewWalletSecurityService)
	c.Provide(services.NewDeviceService)
	c.Provide(services.NewErrorLogger)
	c.Provide(services.NewValidationService)
	c.Provide(services.NewUserService)
	c.Provide(services.NewNodeService)
	c.Provide(services.NewTimeoutService)
	c.Provide(services.NewTrustV3Service)
	c.Provide(services.NewGeoService)
	c.Provide(services.NewKnowledgeService)
	c.Provide(services.NewPricingService)
	c.Provide(services.NewInvoiceService)
	c.Provide(services.NewLendingService)

	c.Provide(services.NewProofOfWorkService)
	c.Provide(services.NewMaintenanceService)
	c.Provide(services.NewEscrowService)
	c.Provide(func(cfg *config.Config) *services.StonFiService {
		return services.NewStonFiService(cfg.TON.StonFiRouter)
	})
	c.Provide(func(db *sql.DB) *services.BurnService {
		return services.NewBurnService(db, nil)
	})
	c.Provide(services.NewReferralService)
	c.Provide(services.NewMultiLevelReferralService)
	c.Provide(services.NewStatsService)
	c.Provide(services.NewResultService)
	c.Provide(services.NewTaskService)
	c.Provide(services.NewRewardEngine)
	c.Provide(services.NewPayoutRetryService)
	c.Provide(services.NewTaskPaymentService)
	c.Provide(func(db *sql.DB, redis *redis.Client, escrow *services.EscrowService, node *services.NodeService, stonfi *services.StonFiService, cfg *config.Config) *services.SovereignBridgeService {
		encryptionKey := os.Getenv("BRIDGE_ENCRYPTION_KEY")
		genesisNode := "https://genesis.gstdtoken.com" // Default genesis node
		return services.NewSovereignBridgeService(db, redis, escrow, node, stonfi, encryptionKey, genesisNode)
	})
	c.Provide(func(cfg *config.Config) *services.WelcomeBonusConfig {
		return &services.WelcomeBonusConfig{
			TreasuryWallet: cfg.TON.AdminWallet,
			WelcomeAmount:  1.0,
			DailyFaucet:    0.1,
			AgentBootstrap: 10.0, // Vampire Attack Grant
		}
	})
	c.Provide(services.NewWelcomeBonusService)
	c.Provide(services.NewAgentMarketplaceService)
	c.Provide(services.NewAPIKeyService)
	c.Provide(services.NewPipelineParallelismService)
	c.Provide(services.NewGuardrailsService)
	c.Provide(services.NewFederatedEngineService)
	c.Provide(services.NewMobileComputeService)
	c.Provide(services.NewZeroBalanceGateService)
	c.Provide(services.NewRecyclingPoolService)
	c.Provide(services.NewKVCacheService)
	c.Provide(services.NewZKComputeProofService)
	c.Provide(services.NewDataAirlockService)
	c.Provide(services.NewOpenClawBridgeService)

	c.Provide(func(cfg *config.Config) *services.TONService {
		return services.NewTONService(cfg.TON.APIURL, cfg.TON.APIKey)
	})

	c.Provide(func(cfg *config.Config, db *sql.DB) *services.PoolMonitorService {
		return services.NewPoolMonitorService(cfg.TON, db)
	})

	c.Provide(func(cfg *config.Config, db *sql.DB) *services.TelegramService {
		return services.NewTelegramService(cfg.Telegram.BotToken, cfg.Telegram.ChatID, db)
	})

	c.Provide(func(db *sql.DB, redis *redis.Client) *services.AssignmentService {
		return services.NewAssignmentService(db, redis)
	})

	c.Provide(func(db *sql.DB, cfg *config.Config) *services.PaymentService {
		return services.NewPaymentService(db, cfg.TON)
	})

	c.Provide(func(db *sql.DB, redis *redis.Client) *services.TaskOrchestrator {
		return services.NewTaskOrchestrator(db, redis)
	})
    
	c.Provide(func() *services.RateLimiter {
		// Matching main.go: taskRateLimiter := services.NewRateLimiter(10, 1*time.Minute)
		return services.NewRateLimiter(10, 1*time.Minute)
	})

	// 3. Background Workers
	c.Provide(func(db *sql.DB, ton *services.TONService, cfg config.TONConfig, pay *services.TaskPaymentService) *services.PaymentWatcher {
		return services.NewPaymentWatcher(db, ton, cfg, pay)
	})
	c.Provide(services.NewPaymentTracker)

	// 4. Gin Router
	c.Provide(func() *gin.Engine {
		return gin.New()
	})

	return c
}

// StartApplication performs final wiring and starts all background services
func StartApplication(container *dig.Container) error {
	return container.Invoke(func(
		cfg *config.Config,
		router *gin.Engine,
		hub *api.WSHub,
		tonService *services.TONService,
		cacheService *services.CacheService,
		poolMonitor *services.PoolMonitorService,
		errorLogger *services.ErrorLogger,
		statsService *services.StatsService,
		validationService *services.ValidationService,
		trustV3Service *services.TrustV3Service,
		entropyService *services.EntropyService,
		assignmentService *services.AssignmentService,
		encryptionService *services.EncryptionService,
		nodeService *services.NodeService,
		taskService *services.TaskService,
		rewardEngine *services.RewardEngine,
		payoutRetry *services.PayoutRetryService,
		paymentWatcher *services.PaymentWatcher,
		paymentTracker *services.PaymentTracker,
		deviceService *services.DeviceService,
		paymentService *services.PaymentService,
		resultService *services.ResultService,
		taskRateLimiter *services.RateLimiter,
		db *sql.DB,
		redisClient *redis.Client,
		powService *services.ProofOfWorkService,
		taskOrchestrator *services.TaskOrchestrator,
		telegramService *services.TelegramService,
		lendingService *services.LendingService,

		maintenanceService *services.MaintenanceService,
		sovereignBridge *services.SovereignBridgeService,
		knowledgeService *services.KnowledgeService,
		pricingService *services.PricingService,
		invoiceService *services.InvoiceService,
		welcomeBonusService *services.WelcomeBonusService,
		burnService *services.BurnService,
		multiLevelReferralService *services.MultiLevelReferralService,
		agentMarketplaceService *services.AgentMarketplaceService,
		taskPaymentService *services.TaskPaymentService,
		timeoutService *services.TimeoutService,
		userService *services.UserService,
		stonFiService *services.StonFiService,
		apiKeyService *services.APIKeyService,
		pipelineService *services.PipelineParallelismService,
		guardrailsService *services.GuardrailsService,
		federatedEngine *services.FederatedEngineService,
		mobileCompute *services.MobileComputeService,
		zbGateService *services.ZeroBalanceGateService,
		recyclingPool *services.RecyclingPoolService,
		kvCacheService *services.KVCacheService,
		dataAirlock *services.DataAirlockService,
		openClawBridge *services.OpenClawBridgeService,
	) {
		// 1. Cross-dependency wiring
		tonService.SetCacheService(cacheService)
		poolMonitor.SetTONService(tonService)
		poolMonitor.SetErrorLogger(errorLogger)
		statsService.SetPoolMonitor(poolMonitor)
		validationService.SetDependencies(trustV3Service, entropyService, assignmentService, encryptionService, tonService, cacheService, nodeService)
		taskService.SetHub(hub)
		rewardEngine.SetPayoutRetry(payoutRetry)
		paymentService.SetTONService(tonService)
		paymentService.SetNodeService(nodeService)
		resultService.SetTelegramService(telegramService)
		taskPaymentService.SetTaskService(taskService)
		taskPaymentService.SetTelegramService(telegramService)
		stonFiService.SetPoolMonitor(poolMonitor)
		lendingService.SetPoolMonitor(poolMonitor)
		taskOrchestrator.SetPoWService(powService)

		// 2. Start WebSocket Hub
		go hub.Run()
		log.Printf("🚀 WebSocket Hub started")

		// 3. Start Background Workers
		ctx := context.Background()
		go timeoutService.StartTimeoutChecker(ctx, 30*time.Second)
		go paymentWatcher.Start(ctx, 60*time.Second)
		go payoutRetry.Start(ctx)
		go paymentTracker.Start(ctx)
		go taskOrchestrator.Start(ctx)
		go maintenanceService.Start(ctx)
		go poolMonitor.Start(ctx)

		
		// 🚀 1M User Optimization: Periodically flush batched heartbeats
		go func() {
			ticker := time.NewTicker(45 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					affected, err := nodeService.FlushHeartbeats(ctx)
					if err != nil {
						log.Printf("⚠️  Heartbeat Flush Error: %v", err)
					} else if affected > 0 {
						log.Printf("💓 Batched %d heartbeats to database", affected)
					}
				case <-ctx.Done():
					return
				}
			}
		}()
		
		log.Printf("🚀 All background workers started")

		// 4. Setup Routes
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
			trustV3Service,
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
			payoutRetry,
			poolMonitor,
			cacheService,
			errorLogger,
			powService,
			taskOrchestrator,
			telegramService,
			lendingService,

			maintenanceService,
			sovereignBridge,
			knowledgeService,
			pricingService,
			invoiceService,
			welcomeBonusService,
			burnService,
			multiLevelReferralService,
			agentMarketplaceService,
			apiKeyService,
			guardrailsService,
		)

		// 4b. Modular routes (registered separately for clean architecture)
		v1Group := router.Group("/api/v1")
		protectedGroup := router.Group("/api/v1")
		api.SetupPipelineRoutes(v1Group, protectedGroup, pipelineService)
		api.SetupSovereignRoutes(v1Group, protectedGroup,
			guardrailsService, federatedEngine, mobileCompute,
			zbGateService, recyclingPool, kvCacheService,
			dataAirlock, openClawBridge)

		// 5. Start Server
		port := cfg.Server.Port
		log.Printf("🔥 Server starting on port %s", port)
		if err := router.Run(":" + port); err != nil {
			log.Fatalf("❌ Server failed: %v", err)
		}
	})
}
