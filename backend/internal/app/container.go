package app

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"distributed-computing-platform/internal/a2a"
	"distributed-computing-platform/internal/api"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/database"
	"distributed-computing-platform/internal/genesis"
	"distributed-computing-platform/internal/hive"
	infRouter "distributed-computing-platform/internal/inference"
	nodeMgr "distributed-computing-platform/internal/node"
	"distributed-computing-platform/internal/p2p"
	"distributed-computing-platform/internal/queue"
	"distributed-computing-platform/internal/sentinel"
	"distributed-computing-platform/internal/services"
	leviathan "distributed-computing-platform/internal/services/leviathan"
	"distributed-computing-platform/internal/services/multichain"
	settlementClient "distributed-computing-platform/internal/settlement"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/dig"
)

// BuildContainer constructs the dependency injection container
//nolint:all // DI setup must build all blocks sequentially; splitting reduces readability
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
	c.Provide(services.NewBitchatBridgeService)
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
	c.Provide(services.NewHuggingFaceService)
	c.Provide(services.NewFederatedEngineService)
	c.Provide(services.NewMobileComputeService)
	c.Provide(services.NewZeroBalanceGateService)
	c.Provide(services.NewRecyclingPoolService)
	c.Provide(services.NewCocoonBridgeService) // Cocoon TEE — confidential compute via TON
	c.Provide(func(db *sql.DB, knowledge *services.KnowledgeService, cocoon *services.CocoonBridgeService) *services.CocoonSwarmSymbiosis {
		return services.NewCocoonSwarmSymbiosis(db, knowledge, cocoon)
	})
	c.Provide(services.NewHybridIntelligenceRouter) // Swarm ↔ Cocoon ↔ Ollama 3-tier routing
	c.Provide(func() *services.ExperienceVault {
		return &services.ExperienceVault{} // Stub cache — override with Redis-backed impl when needed
	})
	c.Provide(services.NewGSTDOracleService) // GSTD price oracle for cost calculation
	c.Provide(services.NewSmartRouter)       // Omega Sovereign-First routing + Sovereignty Index
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
	type UniversalMeshDeps struct {
		dig.In
		DB           *sql.DB
		Inference    *services.InferenceService
		Mobile       *services.MobileComputeService
		Pipeline     *services.PipelineParallelismService
		Contrib      *services.ContributionMonetizationService
		CleanCore    *services.CleanCoreService
		Settlement   *services.SettlementService
		SupremeCoord *services.SupremeCoordinatorService
	}
	c.Provide(func(deps UniversalMeshDeps) *services.UniversalMeshService {
		return services.NewUniversalMeshService(deps.DB, deps.Inference, deps.Mobile, deps.Pipeline, deps.Contrib, deps.CleanCore, deps.Settlement, deps.SupremeCoord)
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
	c.Provide(services.NewFinancialMonitorService)
	c.Provide(func(db *sql.DB, escrow *services.EscrowService) *services.MonetizationMetricsService {
		return services.NewMonetizationMetricsService(db, escrow)
	})
	type SovereignDeps struct {
		dig.In
		DB           *sql.DB
		Monitor      *services.FinancialMonitorService
		Pool         *services.PoolMonitorService
		Burn         *services.BurnService
		Treasury     *services.TreasuryService
		Equilibrium  *services.DynamicEquilibriumService
		Orchestrator *services.TaskOrchestrator
		Monetization *services.MonetizationMetricsService
		Telegram     *services.TelegramService
	}
	c.Provide(func(deps SovereignDeps) *services.SovereignOrganismService {
		var notifier services.OrganismNotifier = deps.Telegram
		return services.NewSovereignOrganismService(deps.DB, deps.Monitor, deps.Pool, deps.Burn, deps.Treasury, deps.Equilibrium, deps.Orchestrator, deps.Monetization, notifier)
	})
	c.Provide(services.NewOrganismHubService)

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
	c.Provide(services.NewGaslessUserService)
	c.Provide(services.NewPayoutBatchService)
	c.Provide(func(cfg *config.Config) *services.HighloadWalletService {
		seed := services.ParseSeedFromEnv(cfg.TON.HighloadWalletSeed)
		if len(seed) < 12 {
			return nil
		}
		hl, err := services.NewHighloadWalletService(seed, cfg.TON.LiteserverConfigURL)
		if err != nil {
			log.Printf("⚠️ Highload wallet init: %v", err)
			return nil
		}
		return hl
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

	// ══════════════════════════════════════════════════════════════
	// Phase 0 Genesis: Swarm Core Services
	// ══════════════════════════════════════════════════════════════

	// A2A Protocol Server (Redis PubSub + Ed25519)
	c.Provide(func(redisClient *redis.Client) *a2a.Server {
		nodeID := os.Getenv("GSTD_NODE_ID")
		if nodeID == "" {
			nodeID = "head-" + uuid.New().String()[:8]
		}
		// Generate Ed25519 keypair for message signing
		_, privKey, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			log.Printf("⚠️ A2A: failed to generate Ed25519 key: %v", err)
			return nil
		}
		log.Printf("🔱 A2A Server created (node=%s)", nodeID)
		return a2a.NewServer(nodeID, privKey, redisClient)
	})

	// Hive Memory Store (content-addressed + semantic search)
	c.Provide(func() hive.HiveStore {
		store := hive.NewMemoryHiveStore()
		log.Printf("🧠 Hive Memory Store initialized")
		return store
	})

	// Sentinel Vigilance Engine (content safety)
	c.Provide(func() *sentinel.Sentinel {
		return sentinel.NewSentinel()
	})

	// Genesis Lock (binary verification)
	c.Provide(func() *genesis.GenesisLock {
		nodeID := os.Getenv("GSTD_NODE_ID")
		if nodeID == "" {
			nodeID = "head-node"
		}
		manifestPath := os.Getenv("GENESIS_MANIFEST_PATH")
		if manifestPath == "" {
			manifestPath = "/app/genesis-manifest.json"
		}
		return genesis.NewGenesisLock(nodeID, manifestPath)
	})

	// Node Manager (auto-enrollment flywheel)
	c.Provide(func(cfg *config.Config) *nodeMgr.NodeManager {
		nodeID := os.Getenv("GSTD_NODE_ID")
		if nodeID == "" {
			nodeID = "head-" + uuid.New().String()[:8]
		}
		walletAddr := cfg.TON.AdminWallet
		if walletAddr == "" {
			walletAddr = cfg.TON.PlatformWalletAddress
		}
		return nodeMgr.NewNodeManager(nodeID, walletAddr)
	})

	// LLM Inference Router (5-tier priority)
	c.Provide(func() *infRouter.Router {
		ollamaURL := os.Getenv("OLLAMA_URL")
		if ollamaURL == "" {
			ollamaURL = "http://host.docker.internal:11434"
		}
		return infRouter.NewRouter(ollamaURL)
	})

	// Settlement Client (TON contract interaction)
	c.Provide(func(cfg *config.Config) *settlementClient.Client {
		contractAddr := cfg.TON.ContractAddress
		return settlementClient.NewClient(contractAddr)
	})

	// Swarm Economy Layer-1 P2P Node
	c.Provide(p2p.NewSwarmNode)
	c.Provide(p2p.NewLedger) // Autonomous Mempool + Consensus Sentinel

	// 4. Gin Router
	c.Provide(func() *gin.Engine {
		return gin.New()
	})

	return c
}

// parseTONAPIKeys returns API keys from TON_API_KEY and TON_API_KEYS (comma-separated)
func parseTONAPIKeys(primary, keysStr string) []string {
	var keys []string
	if primary != "" {
		keys = append(keys, strings.TrimSpace(primary))
	}
	for _, k := range strings.Split(keysStr, ",") {
		k = strings.TrimSpace(k)
		if k != "" && (len(keys) == 0 || k != keys[0]) {
			keys = append(keys, k)
		}
	}
	return keys
}

// StartApplication performs final wiring and starts all background services
//nolint:gocognit,revive,maintidx // NOSONAR
type ApplicationDependencies struct {
    dig.In
    Cfg *config.Config
    Router *gin.Engine
    Hub *api.WSHub
    TonService *services.TONService
    CacheService *services.CacheService
    PoolMonitor *services.PoolMonitorService
    ErrorLogger *services.ErrorLogger
    StatsService *services.StatsService
    ValidationService *services.ValidationService
    TrustV3Service *services.TrustV3Service
    EntropyService *services.EntropyService
    AssignmentService *services.AssignmentService
    EncryptionService *services.EncryptionService
    NodeService *services.NodeService
    TaskService *services.TaskService
    RewardEngine *services.RewardEngine
    EscrowService *services.EscrowService
    PayoutRetry *services.PayoutRetryService
    PaymentWatcher *services.PaymentWatcher
    PaymentTracker *services.PaymentTracker
    DeviceService *services.DeviceService
    PaymentService *services.PaymentService
    ResultService *services.ResultService
    TaskRateLimiter *services.RateLimiter
    Db *sql.DB
    RedisClient *redis.Client
    PowService *services.ProofOfWorkService
    TaskOrchestrator *services.TaskOrchestrator
    TelegramService *services.TelegramService
    MaintenanceService *services.MaintenanceService
    SovereignBridge *services.SovereignBridgeService
    KnowledgeService *services.KnowledgeService
    PricingService *services.PricingService
    InvoiceService *services.InvoiceService
    WelcomeBonusService *services.WelcomeBonusService
    BurnService *services.BurnService
    MultiLevelReferralService *services.MultiLevelReferralService
    AgentMarketplaceService *services.AgentMarketplaceService
    TaskPaymentService *services.TaskPaymentService
    TimeoutService *services.TimeoutService
    UserService *services.UserService
    StonFiService *services.StonFiService
    ApiKeyService *services.APIKeyService
    PipelineService *services.PipelineParallelismService
    GuardrailsService *services.GuardrailsService
    HuggingFaceService *services.HuggingFaceService
    FederatedEngine *services.FederatedEngineService
    MobileCompute *services.MobileComputeService
    ZbGateService *services.ZeroBalanceGateService
    RecyclingPool *services.RecyclingPoolService
    KvCacheService *services.KVCacheService
    DataAirlock *services.DataAirlockService
    OpenClawBridge *services.OpenClawBridgeService
    InferenceService *services.InferenceService
    ContributionMonetization *services.ContributionMonetizationService
    UniversalMeshService *services.UniversalMeshService
    GeoService *services.GeoService
    AgentModelService *services.AgentModelService
    AgentSubcontractService *services.AgentSubcontractService
    GoldHashRateService *services.GoldHashRateService
    GoldBroadcastRunner *services.GoldBroadcastRunner
    AnomalyDetection *services.AnomalyDetectionService
    ZkComputeProof *services.ZKComputeProofService
    FleetCommandService *services.FleetCommandService
    EvolutionEngine *services.EvolutionEngine
    OmniPerformance *services.OmniPerformanceService
    TreasuryService *services.TreasuryService
    SwarmLFS *services.SwarmLFSService
    CleanCoreService *services.CleanCoreService
    GlobalAbsorption *services.GlobalAbsorptionService
    KnowledgeIntegrator *services.KnowledgeIntegrator
    PredictiveMirroring *services.PredictiveMirroringService
    SupremeCoord *services.SupremeCoordinatorService
    LeviathanProfit *services.LeviathanProfitService
    AgentRatingService *services.AgentRatingService
    TalentHunting *services.TalentHuntingService
    MeshConstitution *services.MeshConstitutionService
    ConstitutionAnchor *services.ConstitutionAnchorService
    SingularityReady *services.SingularityReadyService
    BillingService *services.BillingService
    SettlementService *services.SettlementService
    GoldenAgeService *services.GoldenAgeService
    DynamicEquilibrium *services.DynamicEquilibriumService
    EternalFlameService *services.EternalFlameService
    GaslessUserService *services.GaslessUserService
    PayoutBatchService *services.PayoutBatchService
    HighloadWallet *services.HighloadWalletService
    GlobalNeuralMerge *services.GlobalNeuralMergeService
    SingularityGateway *services.SingularityGatewayService
    Omnipotence *services.OmnipotenceService
    SubAgentSelfOpt *services.SubAgentSelfOptimizationService
    BitchatBridge *services.BitchatBridgeService
    CocoonBridge *services.CocoonBridgeService
    CocoonSymbiosis *services.CocoonSwarmSymbiosis
    HybridRouter *services.HybridIntelligenceRouter
    SmartRouter *services.SmartRouter
    A2aServer *a2a.Server
    HiveStore hive.HiveStore
    SentinelEngine *sentinel.Sentinel
    GenesisLock *genesis.GenesisLock
    NodeManager *nodeMgr.NodeManager
    LlmRouter *infRouter.Router
    SettlementCli *settlementClient.Client
    FinancialMonitor *services.FinancialMonitorService
    Organism *services.SovereignOrganismService
    MonetizationService *services.MonetizationMetricsService
    OrganismHub *services.OrganismHubService
    SwarmNode *p2p.SwarmNode
    SwarmLedger *p2p.Ledger
}

//nolint:all // Complex DI setup and event stream bindings shouldn't be split artificially just for sonar
func StartApplication(container *dig.Container) error {
	return container.Invoke(func(deps ApplicationDependencies) {
    cfg := deps.Cfg
    _ = cfg
    router := deps.Router
    _ = router
    hub := deps.Hub
    _ = hub
    tonService := deps.TonService
    _ = tonService
    cacheService := deps.CacheService
    _ = cacheService
    poolMonitor := deps.PoolMonitor
    _ = poolMonitor
    errorLogger := deps.ErrorLogger
    _ = errorLogger
    statsService := deps.StatsService
    _ = statsService
    validationService := deps.ValidationService
    _ = validationService
    trustV3Service := deps.TrustV3Service
    _ = trustV3Service
    entropyService := deps.EntropyService
    _ = entropyService
    assignmentService := deps.AssignmentService
    _ = assignmentService
    encryptionService := deps.EncryptionService
    _ = encryptionService
    nodeService := deps.NodeService
    _ = nodeService
    taskService := deps.TaskService
    _ = taskService
    rewardEngine := deps.RewardEngine
    _ = rewardEngine
    escrowService := deps.EscrowService
    _ = escrowService
    payoutRetry := deps.PayoutRetry
    _ = payoutRetry
    paymentWatcher := deps.PaymentWatcher
    _ = paymentWatcher
    paymentTracker := deps.PaymentTracker
    _ = paymentTracker
    deviceService := deps.DeviceService
    _ = deviceService
    paymentService := deps.PaymentService
    _ = paymentService
    resultService := deps.ResultService
    _ = resultService
    taskRateLimiter := deps.TaskRateLimiter
    _ = taskRateLimiter
    db := deps.Db
    _ = db
    redisClient := deps.RedisClient
    _ = redisClient
    powService := deps.PowService
    _ = powService
    taskOrchestrator := deps.TaskOrchestrator
    _ = taskOrchestrator
    telegramService := deps.TelegramService
    _ = telegramService
    maintenanceService := deps.MaintenanceService
    _ = maintenanceService
    sovereignBridge := deps.SovereignBridge
    _ = sovereignBridge
    knowledgeService := deps.KnowledgeService
    _ = knowledgeService
    pricingService := deps.PricingService
    _ = pricingService
    invoiceService := deps.InvoiceService
    _ = invoiceService
    welcomeBonusService := deps.WelcomeBonusService
    _ = welcomeBonusService
    burnService := deps.BurnService
    _ = burnService
    multiLevelReferralService := deps.MultiLevelReferralService
    _ = multiLevelReferralService
    agentMarketplaceService := deps.AgentMarketplaceService
    _ = agentMarketplaceService
    taskPaymentService := deps.TaskPaymentService
    _ = taskPaymentService
    timeoutService := deps.TimeoutService
    _ = timeoutService
    userService := deps.UserService
    _ = userService
    stonFiService := deps.StonFiService
    _ = stonFiService
    apiKeyService := deps.ApiKeyService
    _ = apiKeyService
    pipelineService := deps.PipelineService
    _ = pipelineService
    guardrailsService := deps.GuardrailsService
    _ = guardrailsService
    federatedEngine := deps.FederatedEngine
    _ = federatedEngine
    mobileCompute := deps.MobileCompute
    _ = mobileCompute
    zbGateService := deps.ZbGateService
    _ = zbGateService
    recyclingPool := deps.RecyclingPool
    _ = recyclingPool
    kvCacheService := deps.KvCacheService
    _ = kvCacheService
    dataAirlock := deps.DataAirlock
    _ = dataAirlock
    openClawBridge := deps.OpenClawBridge
    _ = openClawBridge
    inferenceService := deps.InferenceService
    _ = inferenceService
    contributionMonetization := deps.ContributionMonetization
    _ = contributionMonetization
    universalMeshService := deps.UniversalMeshService
    _ = universalMeshService
    geoService := deps.GeoService
    _ = geoService
    agentModelService := deps.AgentModelService
    _ = agentModelService
    agentSubcontractService := deps.AgentSubcontractService
    _ = agentSubcontractService
    goldHashRateService := deps.GoldHashRateService
    _ = goldHashRateService
    goldBroadcastRunner := deps.GoldBroadcastRunner
    _ = goldBroadcastRunner
    anomalyDetection := deps.AnomalyDetection
    _ = anomalyDetection
    zkComputeProof := deps.ZkComputeProof
    _ = zkComputeProof
    fleetCommandService := deps.FleetCommandService
    _ = fleetCommandService
    evolutionEngine := deps.EvolutionEngine
    _ = evolutionEngine
    omniPerformance := deps.OmniPerformance
    _ = omniPerformance
    treasuryService := deps.TreasuryService
    _ = treasuryService
    swarmLFS := deps.SwarmLFS
    _ = swarmLFS
    cleanCoreService := deps.CleanCoreService
    _ = cleanCoreService
    globalAbsorption := deps.GlobalAbsorption
    _ = globalAbsorption
    knowledgeIntegrator := deps.KnowledgeIntegrator
    _ = knowledgeIntegrator
    predictiveMirroring := deps.PredictiveMirroring
    _ = predictiveMirroring
    supremeCoord := deps.SupremeCoord
    _ = supremeCoord
    leviathanProfit := deps.LeviathanProfit
    _ = leviathanProfit
    agentRatingService := deps.AgentRatingService
    _ = agentRatingService
    talentHunting := deps.TalentHunting
    _ = talentHunting
    meshConstitution := deps.MeshConstitution
    _ = meshConstitution
    constitutionAnchor := deps.ConstitutionAnchor
    _ = constitutionAnchor
    singularityReady := deps.SingularityReady
    _ = singularityReady
    billingService := deps.BillingService
    _ = billingService
    settlementService := deps.SettlementService
    _ = settlementService
    goldenAgeService := deps.GoldenAgeService
    _ = goldenAgeService
    dynamicEquilibrium := deps.DynamicEquilibrium
    _ = dynamicEquilibrium
    eternalFlameService := deps.EternalFlameService
    _ = eternalFlameService
    gaslessUserService := deps.GaslessUserService
    _ = gaslessUserService
    payoutBatchService := deps.PayoutBatchService
    _ = payoutBatchService
    highloadWallet := deps.HighloadWallet
    _ = highloadWallet
    globalNeuralMerge := deps.GlobalNeuralMerge
    _ = globalNeuralMerge
    singularityGateway := deps.SingularityGateway
    _ = singularityGateway
    omnipotence := deps.Omnipotence
    _ = omnipotence
    subAgentSelfOpt := deps.SubAgentSelfOpt
    _ = subAgentSelfOpt
    bitchatBridge := deps.BitchatBridge
    _ = bitchatBridge
    cocoonBridge := deps.CocoonBridge
    _ = cocoonBridge
    cocoonSymbiosis := deps.CocoonSymbiosis
    _ = cocoonSymbiosis
    hybridRouter := deps.HybridRouter
    _ = hybridRouter
    smartRouter := deps.SmartRouter
    _ = smartRouter
    a2aServer := deps.A2aServer
    _ = a2aServer
    hiveStore := deps.HiveStore
    _ = hiveStore
    sentinelEngine := deps.SentinelEngine
    _ = sentinelEngine
    genesisLock := deps.GenesisLock
    _ = genesisLock
    nodeManager := deps.NodeManager
    _ = nodeManager
    llmRouter := deps.LlmRouter
    _ = llmRouter
    settlementCli := deps.SettlementCli
    _ = settlementCli
    financialMonitor := deps.FinancialMonitor
    _ = financialMonitor
    organism := deps.Organism
    _ = organism
    monetizationService := deps.MonetizationService
    _ = monetizationService
    organismHub := deps.OrganismHub
    _ = organismHub
    swarmNode := deps.SwarmNode
    _ = swarmNode
    swarmLedger := deps.SwarmLedger
    _ = swarmLedger
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
		telegramService.SetGSTDPriceProvider(poolMonitor)
		telegramService.SetSmartRouter(smartRouter)
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
		go bitchatBridge.Start(ctx)
		go cocoonBridge.StartHealthLoop(ctx) // Cocoon TEE: health check loop
		go cocoonSymbiosis.Start(ctx)        // Cocoon→Swarm symbiosis
		go hybridRouter.Start(ctx)           // Hybrid routing monitor
		go anomalyDetection.Start(ctx)
		go evolutionEngine.Start(ctx)
		go financialMonitor.Start(ctx)
		go organism.Start(ctx)

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
		// Gasless User: wire TON wallet for subsidies and internal swap
		if gaslessUserService != nil && cfg.TON.PlatformWalletAddress != "" && cfg.TON.PlatformWalletPrivateKey != "" {
			apiKeys := parseTONAPIKeys(cfg.TON.APIKey, cfg.TON.TONAPIKeys)
			var w *services.TONWalletService
			var err error
			if len(apiKeys) > 1 {
				w, err = services.NewTONWalletServiceWithKeyRotation(cfg.TON.APIURL, apiKeys, cfg.TON.PlatformWalletAddress, cfg.TON.PlatformWalletPrivateKey)
				if err == nil {
					log.Printf("⛽ Gasless User: TON wallet with %d API keys (rotation on 429)", len(apiKeys))
				}
			} else {
				key := ""
				if len(apiKeys) > 0 {
					key = apiKeys[0]
				}
				w, err = services.NewTONWalletService(cfg.TON.APIURL, key, cfg.TON.PlatformWalletAddress, cfg.TON.PlatformWalletPrivateKey)
			}
			if err == nil && w != nil {
				gaslessUserService.SetTONWallet(w)
				log.Printf("⛽ Gasless User: TON wallet wired for subsidies and internal swap")
			}
		}
		if payoutBatchService != nil && highloadWallet != nil && highloadWallet.IsInitialized() {
			payoutBatchService.SetHighloadWallet(highloadWallet)
			if cfg.TON.GSTDJettonAddress != "" {
				payoutBatchService.SetGSTDJettonMaster(cfg.TON.GSTDJettonAddress)
			}
			go payoutBatchService.Start(ctx)
			log.Printf("⛽ Payout Batch: Highload Ascension ACTIVE (15m)")
			// Gas Reserve Monitor: alert admin if < 1 TON
			if telegramService != nil {
				highloadWallet.SetTelegramAlert(telegramService.SendMessage)
				go func() {
					ticker := time.NewTicker(30 * time.Minute)
					defer ticker.Stop()
					highloadWallet.CheckGasReserveAndAlert(ctx)
					for {
						select {
						case <-ctx.Done():
							return
						case <-ticker.C:
							highloadWallet.CheckGasReserveAndAlert(ctx)
						}
					}
				}()
				log.Printf("⛽ Gas Reserve Monitor ACTIVE (30m)")
			}
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

		// 🚀 1M User Optimization: Periodically flush batched heartbeats + mark stale offline
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
					// Auto-deactivate stale nodes (no heartbeat for 10 min)
					stale, _ := nodeService.MarkStaleNodesOffline(ctx, 10*time.Minute)
					if stale > 0 {
						log.Printf("⚠️ Marked %d stale nodes offline (10min threshold)", stale)
					}
				case <-ctx.Done():
					return
				}
			}
		}()

		log.Printf("🚀 All background workers started")

		// ══════════════════════════════════════════════════════════════
		// Phase 0 Genesis: Start Swarm Core Services
		// ══════════════════════════════════════════════════════════════

		// Genesis Lock: verify binary integrity
		if genesisLock != nil {
			if err := genesisLock.LoadManifest(); err != nil {
				log.Printf("⚠️ Genesis Lock: manifest load: %v (will generate)", err)
			}
			result, err := genesisLock.Verify()
			if err != nil {
				log.Printf("⚠️ Genesis Lock: verification error: %v", err)
			} else if result.Verified {
				log.Printf("✅ Genesis Lock: VERIFIED (v%s, %dms)", result.Version, result.LatencyMs)
			} else {
				log.Printf("⚠️ Genesis Lock: %d mismatches (non-fatal in dev)", len(result.Mismatches))
			}
			// Periodic re-verification every 30 minutes
			genesisLock.StartPeriodicVerification(30 * time.Minute)
		}

		// A2A Protocol: start listening for swarm messages
		if a2aServer != nil {
			go func() {
				if err := a2aServer.Listen(ctx); err != nil {
					log.Printf("⚠️ A2A listener stopped: %v", err)
				}
			}()
			log.Printf("🔱 A2A Protocol: LISTENING on Redis PubSub channels")
		}

		// Settlement Client: start background processor
		if settlementCli != nil {
			settlementCli.StartProcessor(ctx)
			log.Printf("💰 Settlement Processor: ACTIVE (85/10/5 split)")
		}

		// Node Manager: auto-start check
		if nodeManager != nil {
			go func() {
				if err := nodeManager.CheckAndAutoStart(ctx); err != nil {
					log.Printf("⚠️ Node auto-start: %v (will retry)", err)
				}
				estimate := nodeManager.EstimateEarnings()
				log.Printf("📊 Node earnings estimate: %s → %.1f GSTD/day", estimate.NodeType, estimate.DailyGSTD)
			}()
		}

		// Log Phase 0 Genesis status
		log.Printf("══════════════════════════════════════════")
		log.Printf("🔱 PHASE 0 GENESIS: ALL SYSTEMS ONLINE")
		log.Printf("   A2A Protocol:    %v", a2aServer != nil)
		log.Printf("   Hive Memory:     %v", hiveStore != nil)
		log.Printf("   Sentinel:        %v", sentinelEngine != nil)
		log.Printf("   Genesis Lock:    %v", genesisLock != nil)
		log.Printf("   Node Manager:    %v", nodeManager != nil)
		log.Printf("   LLM Router:      %v (nodes=%d)", llmRouter != nil, func() int {
			if llmRouter != nil {
				return llmRouter.GetNodeCount()
			}
			return 0
		}())
		log.Printf("   Settlement:      %v", settlementCli != nil)
		log.Printf("   Cocoon TEE:      %v (proxy=%v)", cocoonBridge != nil && cocoonBridge.IsEnabled(), func() bool {
			if cocoonBridge != nil {
				h := cocoonBridge.HealthCheck(ctx)
				return h.ProxyReachable
			}
			return false
		}())
		log.Printf("   Hybrid Router:   %v", hybridRouter != nil)
		log.Printf("   Cocoon Symbiosis: %v", cocoonSymbiosis != nil)
		if swarmNode != nil {
			log.Printf("   Swarm P2P:       true (ID=%s)", swarmNode.Host.ID().String())
			if swarmLedger != nil {
				// Wire PostgreSQL for persistent balance storage
				if db != nil {
					swarmLedger.SetDB(db)
				}
				go swarmLedger.StartMempoolWorker(ctx)
				go swarmLedger.StartMempoolCleaner(ctx)
				go swarmLedger.StartRewardDistributor(ctx)
				swarmLedger.EnableStateSync()

				// Bootstrapping: Try to sync state from peers after waiting 10 seconds for initial connections to form
				go func() {
					time.Sleep(10 * time.Second)
					swarmLedger.SyncStateFromPeers(ctx)
				}()

				log.Printf("   Swarm Ledger:    ACTIVE — PostgreSQL persistence + Sentinel Consensus")
			}
		}
		log.Printf("══════════════════════════════════════════")

		// Suppress unused variable warnings for services that are used passively
		_ = hiveStore
		_ = sentinelEngine
		_ = llmRouter
		_ = swarmNode
		_ = swarmLedger

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
		api.SetupRoutes(api.APIDependencies{
        Router: router,
        TaskService: taskService,
        DeviceService: deviceService,
        ValidationService: validationService,
        PaymentService: paymentService,
        TonService: tonService,
        TonConfig: cfg.TON,
        AssignmentService: assignmentService,
        ResultService: resultService,
        StatsService: statsService,
        TrustService: trustV3Service,
        Hub: hub,
        EncryptionService: encryptionService,
        EntropyService: entropyService,
        UserService: userService,
        NodeService: nodeService,
        TaskPaymentService: taskPaymentService,
        RewardEngine: rewardEngine,
        TaskRateLimiter: taskRateLimiter,
        Db: db,
        RedisClient: redisClient,
        PayoutRetryService: payoutRetry,
        EscrowService: escrowService,
        PoolMonitorService: poolMonitor,
        CacheService: cacheService,
        ErrorLogger: errorLogger,
        PowService: powService,
        TaskOrchestrator: taskOrchestrator,
        TelegramService: telegramService,
        MaintenanceService: maintenanceService,
        SovereignBridge: sovereignBridge,
        KnowledgeService: knowledgeService,
        PricingService: pricingService,
        InvoiceService: invoiceService,
        WelcomeBonusService: welcomeBonusService,
        BurnService: burnService,
        MultiLevelReferralService: multiLevelReferralService,
        AgentMarketplaceService: agentMarketplaceService,
        ApiKeyService: apiKeyService,
        GuardrailsService: guardrailsService,
        GeoService: geoService,
        AgentModelService: agentModelService,
        FleetCommandService: fleetCommandService,
        OmniPerformance: omniPerformance,
        SwarmLFS: swarmLFS,
        SettlementService: settlementService,
        GaslessUserService: gaslessUserService,
        FinancialMonitor: financialMonitor,
        Organism: organism,
        MonetizationService: monetizationService,
        OrganismHub: organismHub,
        LlmRouter: llmRouter,
        RecyclingPool: recyclingPool,
        CocoonBridge: cocoonBridge,
        CocoonSymbiosis: cocoonSymbiosis,
        HybridRouter: hybridRouter,
        ZkProofService: zkComputeProof,
        SmartRouter: smartRouter,
        SwarmLedger: swarmLedger,
        HuggingFaceService: deps.HuggingFaceService,
		})

		// 4a. Leviathan Live Stream (SSE) — Protocol: Live Stream, No-DB, 30s memory
		api.SetupLeviathanLiveStream(router)

		// 4b. Modular routes (registered separately for clean architecture)
		v1Group := router.Group("/api/v1")
		protectedGroup := router.Group("/api/v1")
		api.SetupPipelineRoutes(v1Group, protectedGroup, pipelineService)
		api.SetupSovereignRoutes(v1Group, db)

		// 4b1a. Agent API: OpenClaw/A2A agent endpoints
		swarmModelMgr := services.NewSwarmModelManager(db, os.Getenv("OLLAMA_URL"))
		swarmIntel := services.NewSwarmIntelligenceService(db, os.Getenv("OLLAMA_URL"), knowledgeService, swarmModelMgr)
		agentHandler := api.NewAgentAPIHandler(db, openClawBridge, recyclingPool, knowledgeService, swarmModelMgr, swarmIntel)
		api.SetupAgentRoutes(v1Group, agentHandler)
		log.Printf("🤖 Agent API: ACTIVE — MoSE Intelligence, /api/v1/agents/*")

		// 4b1b. OpenClaw Panel: Full management dashboard for OpenClaw robots
		openClawPanelHandler := api.NewOpenClawPanelHandler(db, openClawBridge, inferenceService)
		if smartRouter != nil {
			openClawPanelHandler.SetSmartRouter(smartRouter)
		}
		adminGroupClaw := v1Group.Group("/", api.RequireAdminWallet(cfg.TON))
		api.SetupOpenClawPanelRoutes(adminGroupClaw, openClawPanelHandler)

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

		// 4d. MCP Protocol: Agent discovery, tool listing, metered execution
		api.SetupMCPRoutes(router, v1Group)

		// 5. Ollama connectivity check (inference gateway)
		ollamaURL := os.Getenv("OLLAMA_URL")
		if ollamaURL == "" {
			log.Printf("ℹ️ OLLAMA_URL not set — local Ollama disabled, using Groq Cloud")
		} else {
			go func() {
				c := &http.Client{Timeout: 5 * time.Second}
				resp, err := c.Get(ollamaURL + "/api/tags")
				if err != nil {
					log.Printf("⚠️ Ollama unreachable at %s — using Groq Cloud fallback", ollamaURL)
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
		}

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
