package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"distributed-computing-platform/internal/api"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/database"
	"distributed-computing-platform/internal/queue"
	"distributed-computing-platform/internal/services"
	leviathan "distributed-computing-platform/internal/services/leviathan"
	"distributed-computing-platform/internal/services/multichain"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/dig"
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
	c.Provide(services.NewAgentModelService)
	c.Provide(services.NewPricingService)
	c.Provide(services.NewInvoiceService)
	c.Provide(services.NewProofOfWorkService)
	c.Provide(services.NewMaintenanceService)
	c.Provide(func(db *sql.DB, cfg *config.Config) *services.EscrowService {
		// ТЗ 3.Б: 70% Net Protocol Revenue → Gold
		pct := cfg.Economics.NetRevenueToGoldPct / 100.0
		if pct <= 0 || pct > 1 {
			pct = 0.70
		}
		return services.NewEscrowServiceWithEconomics(db, pct)
	})
	c.Provide(func(cfg *config.Config) *services.StonFiService {
		return services.NewStonFiService(cfg.TON.StonFiRouter)
	})
	c.Provide(func(db *sql.DB) *services.BurnService {
		return services.NewBurnService(db, &services.BurnConfig{BurnRate: 0}) // Burn disabled: supply is low
	})
	c.Provide(services.NewReferralService)
	c.Provide(services.NewMultiLevelReferralService)
	c.Provide(services.NewStatsService)
	c.Provide(services.NewResultService)
	c.Provide(services.NewTaskService)
	c.Provide(services.NewRewardEngine)
	c.Provide(services.NewPayoutRetryService)
	c.Provide(services.NewTaskPaymentService)
	c.Provide(func(db *sql.DB, redis *redis.Client, escrow *services.EscrowService, node *services.NodeService, stonfi *services.StonFiService, tonService *services.TONService, cfg *config.Config) *services.SovereignBridgeService {
		encryptionKey := os.Getenv("BRIDGE_ENCRYPTION_KEY")
		genesisNode := "https://genesis.gstdtoken.com" // Default genesis node
		return services.NewSovereignBridgeService(db, redis, escrow, node, stonfi, tonService, encryptionKey, genesisNode)
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
	c.Provide(services.NewInferenceService)
	c.Provide(services.NewSwarmLFSService)
	c.Provide(func(db *sql.DB, redis *redis.Client, lfs *services.SwarmLFSService, pipeline *services.PipelineParallelismService, inference *services.InferenceService, contrib *services.ContributionMonetizationService) *services.CleanCoreService {
		return services.NewCleanCoreService(db, redis, lfs, pipeline, inference, contrib)
	})
	c.Provide(func(lfs *services.SwarmLFSService, cleanCore *services.CleanCoreService) *services.GlobalAbsorptionService {
		return services.NewGlobalAbsorptionService(lfs, cleanCore)
	})
	c.Provide(func(db *sql.DB) *services.KnowledgeIntegrator {
		return services.NewKnowledgeIntegrator(db)
	})
	c.Provide(func(absorption *services.GlobalAbsorptionService) *services.PredictiveMirroringService {
		return services.NewPredictiveMirroringService(absorption)
	})
	c.Provide(func(db *sql.DB) *services.LeviathanProfitService {
		return services.NewLeviathanProfitService(db)
	})
	c.Provide(func(db *sql.DB, absorption *services.GlobalAbsorptionService) *services.TalentHuntingService {
		return services.NewTalentHuntingService(db, absorption)
	})
	c.Provide(func(db *sql.DB) *services.MeshConstitutionService {
		return services.NewMeshConstitutionService(db)
	})
	c.Provide(func(db *sql.DB, ton *services.TONService) *services.ConstitutionAnchorService {
		return services.NewConstitutionAnchorService(db, ton)
	})
	c.Provide(func(db *sql.DB, absorption *services.GlobalAbsorptionService, talentHunting *services.TalentHuntingService, predictive *services.PredictiveMirroringService, constitution *services.MeshConstitutionService) *services.SingularityReadyService {
		return services.NewSingularityReadyService(db, absorption, talentHunting, predictive, constitution)
	})
	c.Provide(func(db *sql.DB, poolMonitor *services.PoolMonitorService, referral *services.ReferralService) *services.ContributionMonetizationService {
		return services.NewContributionMonetizationService(db, poolMonitor, referral)
	})
	c.Provide(services.NewAgentRatingService)
	c.Provide(func(db *sql.DB, cfg *config.Config, burn *services.BurnService, poolMonitor *services.PoolMonitorService) *services.SettlementService {
		return services.NewSettlementService(db, cfg.TON, burn, poolMonitor)
	})
	c.Provide(func(db *sql.DB, settlement *services.SettlementService, poolMonitor *services.PoolMonitorService, escrow *services.EscrowService) *services.BillingService {
		return services.NewBillingService(db, settlement, poolMonitor, escrow)
	})
	c.Provide(func(db *sql.DB, settlement *services.SettlementService, stats *services.StatsService) *services.GoldenAgeService {
		return services.NewGoldenAgeService(db, settlement, stats)
	})
	c.Provide(func(db *sql.DB, poolMonitor *services.PoolMonitorService) *services.DynamicEquilibriumService {
		return services.NewDynamicEquilibriumService(db, poolMonitor)
	})
	c.Provide(func(db *sql.DB, pipeline *services.PipelineParallelismService, settlement *services.SettlementService) *services.EternalFlameService {
		return services.NewEternalFlameService(db, pipeline, settlement)
	})
	c.Provide(services.NewGlobalNeuralMergeService)
	c.Provide(services.NewSingularityGatewayService)
	c.Provide(services.NewSubAgentSelfOptimizationService)
	c.Provide(func(db *sql.DB, cfg *config.Config) *services.OmnipotenceService {
		wallet := cfg.TON.AdminWallet
		if wallet == "" {
			wallet = cfg.TON.TreasuryWallet
		}
		return services.NewOmnipotenceService(db, wallet)
	})
	c.Provide(services.NewSupremeCoordinatorService)
	c.Provide(func(db *sql.DB, inference *services.InferenceService, mobile *services.MobileComputeService, pipeline *services.PipelineParallelismService, contrib *services.ContributionMonetizationService, cleanCore *services.CleanCoreService, settlement *services.SettlementService, supremeCoord *services.SupremeCoordinatorService) *services.UniversalMeshService {
		return services.NewUniversalMeshService(db, inference, mobile, pipeline, contrib, cleanCore, settlement, supremeCoord)
	})
	c.Provide(services.NewAgentSubcontractService)
	c.Provide(services.NewGoldHashRateService)
	c.Provide(func(goldHash *services.GoldHashRateService, hub *api.WSHub) *services.GoldBroadcastRunner {
		return services.NewGoldBroadcastRunner(goldHash, hub)
	})
	c.Provide(services.NewHardwareGrantsService)
	c.Provide(services.NewOmniPerformanceService)
	c.Provide(func(db *sql.DB, telegram *services.TelegramService) *services.AnomalyDetectionService {
		return services.NewAnomalyDetectionService(db, telegram)
	})
	c.Provide(func(db *sql.DB, inference *services.InferenceService, knowledge *services.KnowledgeService) *services.OpenClawBridgeService {
		return services.NewOpenClawBridgeService(db, inference, knowledge)
	})
	c.Provide(func(knowledge *services.KnowledgeService) *services.EvolutionEngine {
		return services.NewEvolutionEngine(knowledge)
	})

	c.Provide(func(cfg *config.Config) *services.TONService {
		return services.NewTONService(cfg.TON.APIURL, cfg.TON.APIKey)
	})

	c.Provide(func(cfg *config.Config, db *sql.DB) *services.PoolMonitorService {
		return services.NewPoolMonitorService(cfg.TON, db)
	})

	c.Provide(func(cfg *config.Config, db *sql.DB) *services.TelegramService {
		return services.NewTelegramService(cfg.Telegram.BotToken, cfg.Telegram.ChatID, db)
	})
	c.Provide(func(db *sql.DB, stonFi *services.StonFiService) *services.StarsBuybackService {
		return services.NewStarsBuybackService(db, stonFi)
	})

	c.Provide(func(db *sql.DB, redis *redis.Client) *services.AssignmentService {
		return services.NewAssignmentService(db, redis)
	})
	c.Provide(func(redis *redis.Client) *services.FleetCommandService {
		return services.NewFleetCommandService(redis)
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

	// 2.a Multichain & Treasury
	c.Provide(func(db *sql.DB, stonFi *services.StonFiService, cfg *config.Config) *services.TreasuryService {
		return services.NewTreasuryService(db, stonFi, cfg.TON)
	})
	c.Provide(func() *multichain.SolanaServiceImpl {
		return multichain.NewSolanaService(os.Getenv("SOLANA_RPC_URL"))
	})
	c.Provide(func() *multichain.XRPLServiceImpl {
		return multichain.NewXRPLService(os.Getenv("XRPL_WEBSOCKET_URL"))
	})

	// 3. Background Workers
	c.Provide(func(db *sql.DB, ton *services.TONService, cfg config.TONConfig, pay *services.TaskPaymentService, stonFi *services.StonFiService) *services.PaymentWatcher {
		return services.NewPaymentWatcher(db, ton, cfg, pay, stonFi)
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
		escrowService *services.EscrowService,
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
		inferenceService *services.InferenceService,
		contributionMonetization *services.ContributionMonetizationService,
		universalMeshService *services.UniversalMeshService,
		geoService *services.GeoService,
		agentModelService *services.AgentModelService,
		agentSubcontractService *services.AgentSubcontractService,
		goldHashRateService *services.GoldHashRateService,
		goldBroadcastRunner *services.GoldBroadcastRunner,
		anomalyDetection *services.AnomalyDetectionService,
		zkComputeProof *services.ZKComputeProofService,
		fleetCommandService *services.FleetCommandService,
		evolutionEngine *services.EvolutionEngine,
		omniPerformance *services.OmniPerformanceService,
		starsBuyback *services.StarsBuybackService,
		treasuryService *services.TreasuryService,
		swarmLFS *services.SwarmLFSService,
		cleanCoreService *services.CleanCoreService,
		globalAbsorption *services.GlobalAbsorptionService,
		knowledgeIntegrator *services.KnowledgeIntegrator,
		predictiveMirroring *services.PredictiveMirroringService,
		supremeCoord *services.SupremeCoordinatorService,
		leviathanProfit *services.LeviathanProfitService,
		agentRatingService *services.AgentRatingService,
		talentHunting *services.TalentHuntingService,
		meshConstitution *services.MeshConstitutionService,
		constitutionAnchor *services.ConstitutionAnchorService,
		singularityReady *services.SingularityReadyService,
		billingService *services.BillingService,
		settlementService *services.SettlementService,
		goldenAgeService *services.GoldenAgeService,
		dynamicEquilibrium *services.DynamicEquilibriumService,
		eternalFlameService *services.EternalFlameService,
		globalNeuralMerge *services.GlobalNeuralMergeService,
		singularityGateway *services.SingularityGatewayService,
		omnipotence *services.OmnipotenceService,
		subAgentSelfOpt *services.SubAgentSelfOptimizationService,
	) {
		// 1. Cross-dependency wiring
		tonService.SetCacheService(cacheService)
		poolMonitor.SetTONService(tonService)
		poolMonitor.SetErrorLogger(errorLogger)
		escrowService.SetLiquidityDeps(cfg.TON, stonFiService)
		statsService.SetPoolMonitor(poolMonitor)
		validationService.SetDependencies(trustV3Service, entropyService, assignmentService, encryptionService, tonService, cacheService, nodeService)
		taskService.SetEncryptionService(encryptionService)
		taskService.SetHub(hub)
		nodeService.SetGeoService(geoService)
		rewardEngine.SetPayoutRetry(payoutRetry)
		paymentService.SetTONService(tonService)
		paymentService.SetNodeService(nodeService)
		resultService.SetTelegramService(telegramService)
		resultService.SetZKProofService(zkComputeProof)
		taskPaymentService.SetTaskService(taskService)
		taskPaymentService.SetTelegramService(telegramService)
		telegramService.SetStarsBuyback(starsBuyback)
		stonFiService.SetPoolMonitor(poolMonitor)
		poolMonitor.SetStonFi(stonFiService)
		taskOrchestrator.SetPoWService(powService)

		// 2. Start WebSocket Hub
		go hub.Run()
		log.Printf("🚀 WebSocket Hub started")

		// 3. Start Background Workers
		ctx := context.Background()
		// 2b. Absolute Point: Gold Reserve → Hash-Rate Multiplier via WebSocket (real-time)
		go goldBroadcastRunner.Start(ctx)
		log.Printf("📡 Gold Broadcast Runner started (Unified State Machine)")
		go timeoutService.StartTimeoutChecker(ctx, 30*time.Second)
		go paymentWatcher.Start(ctx, 60*time.Second)
		go payoutRetry.Start(ctx)
		go paymentTracker.Start(ctx)
		go taskOrchestrator.Start(ctx)
		go maintenanceService.Start(ctx)
		go poolMonitor.Start(ctx)
		go anomalyDetection.Start(ctx)
		go evolutionEngine.Start(ctx)

		// Golden Age Protocol: Payout Waves, Dynamic Fee, Proof-of-Gold, Swarm Expansion
		if goldenAgeService != nil {
			go goldenAgeService.Start(ctx)
		}
		if dynamicEquilibrium != nil {
			go dynamicEquilibrium.Start(ctx)
		}
		if eternalFlameService != nil {
			eternalFlameService.SetPipeline(pipelineService)
			go eternalFlameService.Start(ctx)
		}
		if globalNeuralMerge != nil {
			go globalNeuralMerge.Start(ctx)
			log.Printf("🧠 Global Neural Merge: Intelligence Consolidation ACTIVE (15m)")
		}
		if singularityGateway != nil {
			go singularityGateway.Start(ctx)
			log.Printf("🚀 Singularity Gateway: Latency Optimization + IQ Milestone ACTIVE (5m)")
		}
		if omnipotence != nil {
			go omnipotence.Start(ctx)
			log.Printf("👁 Omnipotence: Predictive Allocation + Autonomous Expansion + Golden Verification ACTIVE (10m)")
		}
		if subAgentSelfOpt != nil {
			go subAgentSelfOpt.Start(ctx)
			log.Printf("🤖 SubAgent Self-Optimization: lessons + critical insights exchange ACTIVE (20m)")
		}

		// Start Treasury Auto-Converter (Genesis Launch: Golden Liquidity — instant GSTD→XAUt)
		go func() {
			ticker := time.NewTicker(5 * time.Minute) // Every 5 min for instant conversion
			defer ticker.Stop()
			log.Printf("💰 Treasury Service Started (Gold Bridge Active)")

			// Run on startup
			if err := treasuryService.ProcessGoldReserves(ctx); err != nil {
				log.Printf("⚠️ Treasury Error: %v", err)
			}

			for {
				select {
				case <-ticker.C:
					if err := treasuryService.ProcessGoldReserves(ctx); err != nil {
						log.Printf("⚠️ Treasury Error: %v", err)
					}
				case <-ctx.Done():
					return
				}
			}
		}()

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

		// 3b. Leviathan: optional prediction-market analytics (LEVIATHAN_ENABLED=true)
		leviathan.StartIfEnabled(ctx)

		// 3b2. Predictive Mirroring: Leviathan analyzes HF Trending, shards top-3 models/day
		if os.Getenv("LEVIATHAN_ENABLED") == "true" && predictiveMirroring != nil {
			globalAbsorption.SetKnowledgeIntegrator(knowledgeIntegrator)
			go predictiveMirroring.Start(ctx)
			log.Printf("🔮 Predictive Mirroring: ACTIVE — HF Trending top-3 sharding (6h cycle)")
		} else if knowledgeIntegrator != nil {
			globalAbsorption.SetKnowledgeIntegrator(knowledgeIntegrator)
		}

		// 3b3. Supreme Coordinator: Performance-Based Pruning, Golden Incentive, Integrity Cross-Check
		if supremeCoord != nil {
			go supremeCoord.RunPruningLoop(ctx)
			if federatedEngine != nil {
				federatedEngine.SetSupremeCoordinator(supremeCoord)
			}
			log.Printf("⚡ Supreme Coordinator: ACTIVE — Pruning (48h), Golden +10%%, LoRA Cross-Check")
		}

		// 3b4. Profit Maximization: Leviathan matches fee vs region costs, suggests high-margin nodes
		if leviathanProfit != nil && cleanCoreService != nil {
			cleanCoreService.SetLeviathanProfit(leviathanProfit)
			log.Printf("💰 Profit Maximization: ACTIVE — node routing by Golden Treasury margin")
		}

		// 3b4b. A2A Symbio: Agent rating for UniversalMesh queue priority
		if agentRatingService != nil && cleanCoreService != nil {
			cleanCoreService.SetAgentRating(agentRatingService)
			log.Printf("🦾 A2A Symbio: ACTIVE — agent rating priority in UniversalMesh")
		}

		// 3b4c. Eternal Synergy: Reputation Shield (2x fee for low-rated agents)
		if agentRatingService != nil && universalMeshService != nil {
			universalMeshService.SetAgentRating(agentRatingService)
			log.Printf("🛡️ Eternal Synergy: Reputation Shield ACTIVE — 2x fee for low-rated agents")
		}

		// 3b5. Automated Talent Hunting: category without score>7 → HF search
		if talentHunting != nil {
			go talentHunting.Start(ctx)
			log.Printf("🎯 Talent Hunting: ACTIVE — category gap search (12h)")
		}

		// 3b6. Decentralized Governance: monthly Mesh Constitution + Immortal Identity
		if meshConstitution != nil {
			if constitutionAnchor != nil {
				meshConstitution.SetAnchor(constitutionAnchor)
			}
			go meshConstitution.Start(ctx)
			log.Printf("📜 Mesh Constitution: ACTIVE — monthly report, hash-signature for blockchain")
		}

		// 3b7. Singularity Ready: Global Equilibrium, Archon Protocol
		if singularityReady != nil {
			go singularityReady.Start(ctx)
			log.Printf("🔮 Singularity Ready: ACTIVE — Equilibrium (Profit↔Talent), Archon (cap<5)")
		}

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
			escrowService,
			poolMonitor,
			cacheService,
			errorLogger,
			powService,
			taskOrchestrator,
			telegramService,

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
			geoService,
			agentModelService,
			fleetCommandService,
			omniPerformance,
			swarmLFS,
			settlementService,
		)

		// 4a. Leviathan Live Stream (SSE) — Protocol: Live Stream, No-DB, 30s memory
		api.SetupLeviathanLiveStream(router)

		// 4b. Modular routes (registered separately for clean architecture)
		v1Group := router.Group("/api/v1")
		protectedGroup := router.Group("/api/v1")
		api.SetupPipelineRoutes(v1Group, protectedGroup, pipelineService)
		api.SetupSovereignRoutes(v1Group, protectedGroup,
			guardrailsService, federatedEngine, mobileCompute,
			zbGateService, recyclingPool, kvCacheService,
			dataAirlock, openClawBridge)

		// 4b2. Universal Mesh Protocol: public infer, XAUt monetization
		api.SetupUniversalMeshRoutes(v1Group, universalMeshService, contributionMonetization)
		log.Printf("🌐 Universal Mesh Protocol: ACTIVE — GET /api/v1/infer, GET /api/v1/mesh/shares")

		// 4b2b. Mesh Constitution: Decentralized Governance report
		api.SetupMeshConstitutionRoutes(v1Group, meshConstitution)

		// 4b2b. Financial API: billing balance
		api.SetupBillingRoutes(v1Group, billingService)
		log.Printf("💰 Financial API: GET /api/v1/billing/balance/:wallet")

		// 4b3. Clean Core Protocol: Shard-First, Availability Staking, Proxy-Balancer
		api.SetupCleanCoreRoutes(protectedGroup, cleanCoreService, cfg.TON)
		log.Printf("🧹 Clean Core Protocol: ACTIVE — POST /admin/models/propagate, POST /pipeline/proof-storage")

		// 4b3b. Global Absorption Protocol: Proxy-Hugging-Bridge, License Guard, Redundancy Scaling
		api.SetupGlobalAbsorptionRoutes(v1Group, globalAbsorption)
		log.Printf("🌐 Global Absorption: ACTIVE — GET /api/v1/absorption/search, POST /absorption/search-absorb, POST /absorption/absorb")

		// 4c. Cosmic Genesis: A2A economy, Gold-Hash link, Hardware grants
		api.SetupCosmicGenesisRoutes(v1Group, protectedGroup, db, agentSubcontractService, goldHashRateService)

		// 5. Ollama connectivity check (inference gateway)
		ollamaURL := os.Getenv("OLLAMA_URL")
		if ollamaURL == "" {
			ollamaURL = "http://host.docker.internal:11434"
		}
		go func() {
			c := &http.Client{Timeout: 5 * time.Second}
			resp, err := c.Get(ollamaURL + "/api/tags")
			if err != nil {
				log.Printf("⚠️ CRITICAL: Ollama unreachable at %s — /chat/completions will fail. Start Ollama: ollama serve", ollamaURL)
				return
			}
			defer resp.Body.Close()
			var data struct {
				Models []struct{ Name string } `json:"models"`
			}
			if json.NewDecoder(resp.Body).Decode(&data) == nil {
				log.Printf("✅ Ollama: %d model(s) available at %s", len(data.Models), ollamaURL)
			} else {
				log.Printf("✅ Ollama reachable at %s", ollamaURL)
			}
		}()

		log.Printf("NEURAL PULSE: ACTIVE - INTELLIGENCE IS FLOWING")
		log.Printf("DATA AIRLOCK: ENGAGED - PRIVACY IS ABSOLUTE")
		log.Printf("COLLECTIVE EVOLUTION: INITIALIZED - THE HIVE IS LEARNING")
		log.Printf("[SUCCESS] AUDIT NOISE ELIMINATED: DATABASE SYNCED")

		// 6. Start Server
		port := cfg.Server.Port
		log.Printf("🔥 Server starting on port %s", port)
		if err := router.Run(":" + port); err != nil {
			log.Fatalf("❌ Server failed: %v", err)
		}
	})
}
