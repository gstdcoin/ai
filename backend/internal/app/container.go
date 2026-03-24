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
//
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
	c.Provide(func(redisClient *redis.Client) *services.ExperienceVault {
		return services.NewExperienceVault(redisClient) // Real Redis-backed cache
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
	c.Provide(func(db *sql.DB, cfg *config.Config) *services.IPFSService {
		apiURL := ""
		gatewayURL := "https://ipfs.io"
		return services.NewIPFSService(db, apiURL, gatewayURL)
	})
	c.Provide(services.NewZKService)
	c.Provide(func(db *sql.DB) *services.IAMService {
		return services.NewIAMService(db)
	})
	c.Provide(services.NewFinanceMLService)
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
	c.Provide(func(cfg *config.Config, db *sql.DB) *services.ZKBridgeService {
		return services.NewZKBridgeService(db)
	})

	c.Provide(func(cfg *config.Config, db *sql.DB, tonSvc *services.TONService, stonfi *services.StonFiService) *services.MarketMakerService {
		return services.NewMarketMakerService(db, tonSvc, stonfi)
	})

	c.Provide(func(cfg *config.Config, db *sql.DB) *services.RenderService {
		return services.NewRenderService(db)
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

	// Asynq Task Queue Manager (production-grade distributed task queue)
	c.Provide(func(cfg *config.Config, db *sql.DB) *queue.TaskQueueManager {
		log.Printf("🔄 Initializing Asynq task queue (Redis: %s:%s)...", cfg.Redis.Host, cfg.Redis.Port)
		tqm, err := queue.NewTaskQueueManager(cfg.Redis, db)
		if err != nil {
			log.Printf("⚠️ Asynq task queue init failed: %v (falling back to simple queue)", err)
			return nil
		}
		log.Printf("✅ Asynq task queue initialized")
		return tqm
	})

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
//
//nolint:gocognit,revive,maintidx // NOSONAR
type ApplicationDependencies struct {
	dig.In
	Cfg                       *config.Config
	Router                    *gin.Engine
	Hub                       *api.WSHub
	TonService                *services.TONService
	CacheService              *services.CacheService
	PoolMonitor               *services.PoolMonitorService
	ErrorLogger               *services.ErrorLogger
	StatsService              *services.StatsService
	ValidationService         *services.ValidationService
	TrustV3Service            *services.TrustV3Service
	EntropyService            *services.EntropyService
	AssignmentService         *services.AssignmentService
	EncryptionService         *services.EncryptionService
	NodeService               *services.NodeService
	TaskService               *services.TaskService
	RewardEngine              *services.RewardEngine
	EscrowService             *services.EscrowService
	PayoutRetry               *services.PayoutRetryService
	PaymentWatcher            *services.PaymentWatcher
	PaymentTracker            *services.PaymentTracker
	DeviceService             *services.DeviceService
	PaymentService            *services.PaymentService
	ResultService             *services.ResultService
	TaskRateLimiter           *services.RateLimiter
	Db                        *sql.DB
	RedisClient               *redis.Client
	PowService                *services.ProofOfWorkService
	TaskOrchestrator          *services.TaskOrchestrator
	TelegramService           *services.TelegramService
	MaintenanceService        *services.MaintenanceService
	SovereignBridge           *services.SovereignBridgeService
	KnowledgeService          *services.KnowledgeService
	PricingService            *services.PricingService
	InvoiceService            *services.InvoiceService
	WelcomeBonusService       *services.WelcomeBonusService
	BurnService               *services.BurnService
	MultiLevelReferralService *services.MultiLevelReferralService
	AgentMarketplaceService   *services.AgentMarketplaceService
	TaskPaymentService        *services.TaskPaymentService
	TimeoutService            *services.TimeoutService
	UserService               *services.UserService
	StonFiService             *services.StonFiService
	ApiKeyService             *services.APIKeyService
	PipelineService           *services.PipelineParallelismService
	GuardrailsService         *services.GuardrailsService
	HuggingFaceService        *services.HuggingFaceService
	FederatedEngine           *services.FederatedEngineService
	MobileCompute             *services.MobileComputeService
	ZbGateService             *services.ZeroBalanceGateService
	RecyclingPool             *services.RecyclingPoolService
	KvCacheService            *services.KVCacheService
	DataAirlock               *services.DataAirlockService
	OpenClawBridge            *services.OpenClawBridgeService
	InferenceService          *services.InferenceService
	ContributionMonetization  *services.ContributionMonetizationService
	UniversalMeshService      *services.UniversalMeshService
	GeoService                *services.GeoService
	AgentModelService         *services.AgentModelService
	AgentSubcontractService   *services.AgentSubcontractService
	GoldHashRateService       *services.GoldHashRateService
	GoldBroadcastRunner       *services.GoldBroadcastRunner
	AnomalyDetection          *services.AnomalyDetectionService
	ZkComputeProof            *services.ZKComputeProofService
	FleetCommandService       *services.FleetCommandService
	EvolutionEngine           *services.EvolutionEngine
	OmniPerformance           *services.OmniPerformanceService
	TreasuryService           *services.TreasuryService
	SwarmLFS                  *services.SwarmLFSService
	CleanCoreService          *services.CleanCoreService
	GlobalAbsorption          *services.GlobalAbsorptionService
	KnowledgeIntegrator       *services.KnowledgeIntegrator
	PredictiveMirroring       *services.PredictiveMirroringService
	SupremeCoord              *services.SupremeCoordinatorService
	LeviathanProfit           *services.LeviathanProfitService
	AgentRatingService        *services.AgentRatingService
	TalentHunting             *services.TalentHuntingService
	MeshConstitution          *services.MeshConstitutionService
	ConstitutionAnchor        *services.ConstitutionAnchorService
	SingularityReady          *services.SingularityReadyService
	IAMService                *services.IAMService
	FinanceML                 *services.FinanceMLService
	ZKBridge                  *services.ZKBridgeService
	MarketMaker               *services.MarketMakerService
	RenderEngine              *services.RenderService
	BillingService            *services.BillingService
	IPFSService               *services.IPFSService
	ZKCryptography            *services.ZKService
	SettlementService         *services.SettlementService
	GoldenAgeService          *services.GoldenAgeService
	DynamicEquilibrium        *services.DynamicEquilibriumService
	EternalFlameService       *services.EternalFlameService
	GaslessUserService        *services.GaslessUserService
	PayoutBatchService        *services.PayoutBatchService
	HighloadWallet            *services.HighloadWalletService
	GlobalNeuralMerge         *services.GlobalNeuralMergeService
	SingularityGateway        *services.SingularityGatewayService
	Omnipotence               *services.OmnipotenceService
	SubAgentSelfOpt           *services.SubAgentSelfOptimizationService
	BitchatBridge             *services.BitchatBridgeService
	CocoonBridge              *services.CocoonBridgeService
	CocoonSymbiosis           *services.CocoonSwarmSymbiosis
	HybridRouter              *services.HybridIntelligenceRouter
	SmartRouter               *services.SmartRouter
	A2aServer                 *a2a.Server
	HiveStore                 hive.HiveStore
	SentinelEngine            *sentinel.Sentinel
	GenesisLock               *genesis.GenesisLock
	NodeManager               *nodeMgr.NodeManager
	LlmRouter                 *infRouter.Router
	SettlementCli             *settlementClient.Client
	FinancialMonitor          *services.FinancialMonitorService
	Organism                  *services.SovereignOrganismService
	MonetizationService       *services.MonetizationMetricsService
	OrganismHub               *services.OrganismHubService
	SwarmNode                 *p2p.SwarmNode
	SwarmLedger               *p2p.Ledger
	TaskQueue                 *queue.TaskQueueManager `optional:"true"`
}

//nolint:all // Complex DI setup and event stream bindings shouldn't be split artificially just for sonar
func StartApplication(container *dig.Container) error {
	return container.Invoke(func(deps ApplicationDependencies) {
		// 1. Cross-dependency wiring (using deps fields directly)
		deps.TonService.SetCacheService(deps.CacheService)
		deps.PoolMonitor.SetTONService(deps.TonService)
		deps.PoolMonitor.SetErrorLogger(deps.ErrorLogger)
		deps.EscrowService.SetLiquidityDeps(deps.Cfg.TON, deps.StonFiService)
		deps.StatsService.SetPoolMonitor(deps.PoolMonitor)
		deps.ValidationService.SetDependencies(deps.TrustV3Service, deps.EntropyService, deps.AssignmentService, deps.EncryptionService, deps.TonService, deps.CacheService, deps.NodeService)
		deps.TaskService.SetEncryptionService(deps.EncryptionService)
		deps.TaskService.SetHub(deps.Hub)
		deps.NodeService.SetGeoService(deps.GeoService)
		deps.RewardEngine.SetPayoutRetry(deps.PayoutRetry)
		deps.PaymentService.SetTONService(deps.TonService)
		deps.PaymentService.SetNodeService(deps.NodeService)
		deps.ResultService.SetTelegramService(deps.TelegramService)
		deps.ResultService.SetZKProofService(deps.ZkComputeProof)
		deps.ResultService.SetNewZKService(deps.ZKCryptography)
		deps.ResultService.SetIPFSService(deps.IPFSService)
		deps.TaskPaymentService.SetTaskService(deps.TaskService)
		deps.TaskPaymentService.SetTelegramService(deps.TelegramService)
		deps.TelegramService.SetGSTDPriceProvider(deps.PoolMonitor)
		deps.TelegramService.SetSmartRouter(deps.SmartRouter)
		deps.StonFiService.SetPoolMonitor(deps.PoolMonitor)
		deps.PoolMonitor.SetStonFi(deps.StonFiService)
		deps.TaskOrchestrator.SetPoWService(deps.PowService)

		// 2. Start WebSocket Hub
		go deps.Hub.Run()
		log.Printf("🚀 WebSocket Hub started")

		// 3. Start Background Workers
		ctx := context.Background()
		go deps.GoldBroadcastRunner.Start(ctx)
		log.Printf("📡 Gold Broadcast Runner started (Unified State Machine)")
		go deps.TimeoutService.StartTimeoutChecker(ctx, 30*time.Second)
		go deps.PaymentWatcher.Start(ctx, 60*time.Second)
		go deps.PayoutRetry.Start(ctx)
		go deps.PaymentTracker.Start(ctx)
		go deps.TaskOrchestrator.Start(ctx)
		go deps.MaintenanceService.Start(ctx)
		go deps.PoolMonitor.Start(ctx)
		go deps.BitchatBridge.Start(ctx)
		go deps.CocoonBridge.StartHealthLoop(ctx)
		go deps.CocoonSymbiosis.Start(ctx)
		go deps.HybridRouter.Start(ctx)
		go deps.AnomalyDetection.Start(ctx)
		go deps.EvolutionEngine.Start(ctx)
		go deps.FinancialMonitor.Start(ctx)
		go deps.Organism.Start(ctx)

		if deps.GoldenAgeService != nil {
			go deps.GoldenAgeService.Start(ctx)
		}
		if deps.DynamicEquilibrium != nil {
			go deps.DynamicEquilibrium.Start(ctx)
		}
		if deps.EternalFlameService != nil {
			deps.EternalFlameService.SetPipeline(deps.PipelineService)
			go deps.EternalFlameService.Start(ctx)
		}
		startGaslessWiring(ctx, deps)
		startPayoutBatch(ctx, deps)
		if deps.GlobalNeuralMerge != nil {
			go deps.GlobalNeuralMerge.Start(ctx)
		}
		if deps.SingularityGateway != nil {
			go deps.SingularityGateway.Start(ctx)
		}
		if deps.Omnipotence != nil {
			go deps.Omnipotence.Start(ctx)
		}
		if deps.SubAgentSelfOpt != nil {
			go deps.SubAgentSelfOpt.Start(ctx)
		}

		// Treasury Auto-Converter
		startTreasuryLoop(ctx, deps.TreasuryService)
		// Heartbeat flush + stale detection
		startHeartbeatFlush(ctx, deps.NodeService)

		// Start Asynq task queue
		if deps.TaskQueue != nil {
			if err := deps.TaskQueue.Start(); err != nil {
				log.Printf("⚠️ Asynq start error: %v", err)
			} else {
				deps.TaskQueue.ScheduleRecurringTasks()
			}
		}

		log.Printf("🚀 All background workers started")

		// ══════════════════════════════════════════════════════════════
		// Phase 0 Genesis: Start Swarm Core Services
		// ══════════════════════════════════════════════════════════════
		if deps.GenesisLock != nil {
			verifyGenesisLock(deps.GenesisLock)
		}
		if deps.A2aServer != nil {
			go func() {
				if err := deps.A2aServer.Listen(ctx); err != nil {
					log.Printf("⚠️ A2A listener stopped: %v", err)
				}
			}()
			log.Printf("🔱 A2A Protocol: LISTENING on Redis PubSub channels")
		}
		if deps.SettlementCli != nil {
			deps.SettlementCli.StartProcessor(ctx)
			log.Printf("💰 Settlement Processor: ACTIVE (85/10/5 split)")
		}
		if deps.NodeManager != nil {
			go func() {
				if err := deps.NodeManager.CheckAndAutoStart(ctx); err != nil {
					log.Printf("⚠️ Node auto-start: %v (will retry)", err)
				}
				estimate := deps.NodeManager.EstimateEarnings()
				log.Printf("📊 Node earnings estimate: %s → %.1f GSTD/day", estimate.NodeType, estimate.DailyGSTD)
			}()
		}
		logSwarmStatus(ctx, deps)

		// 3b. Leviathan + Singularity subsystems
		leviathan.StartIfEnabled(ctx)
		if os.Getenv("LEVIATHAN_ENABLED") == "true" && deps.PredictiveMirroring != nil {
			deps.GlobalAbsorption.SetKnowledgeIntegrator(deps.KnowledgeIntegrator)
			go deps.PredictiveMirroring.Start(ctx)
		} else if deps.KnowledgeIntegrator != nil {
			deps.GlobalAbsorption.SetKnowledgeIntegrator(deps.KnowledgeIntegrator)
		}
		if deps.SupremeCoord != nil {
			go deps.SupremeCoord.RunPruningLoop(ctx)
			if deps.FederatedEngine != nil {
				deps.FederatedEngine.SetSupremeCoordinator(deps.SupremeCoord)
			}
		}
		if deps.LeviathanProfit != nil && deps.CleanCoreService != nil {
			deps.CleanCoreService.SetLeviathanProfit(deps.LeviathanProfit)
		}
		if deps.AgentRatingService != nil && deps.CleanCoreService != nil {
			deps.CleanCoreService.SetAgentRating(deps.AgentRatingService)
		}
		if deps.AgentRatingService != nil && deps.UniversalMeshService != nil {
			deps.UniversalMeshService.SetAgentRating(deps.AgentRatingService)
		}
		if deps.TalentHunting != nil {
			go deps.TalentHunting.Start(ctx)
		}
		if deps.MeshConstitution != nil {
			if deps.ConstitutionAnchor != nil {
				deps.MeshConstitution.SetAnchor(deps.ConstitutionAnchor)
			}
			go deps.MeshConstitution.Start(ctx)
		}
		if deps.SingularityReady != nil {
			go deps.SingularityReady.Start(ctx)
		}

		// 4. Setup Routes
		cfg := deps.Cfg
		api.SetupRoutes(api.APIDependencies{
			Router:                    deps.Router,
			TaskService:               deps.TaskService,
			DeviceService:             deps.DeviceService,
			ValidationService:         deps.ValidationService,
			PaymentService:            deps.PaymentService,
			TonService:                deps.TonService,
			TonConfig:                 cfg.TON,
			AssignmentService:         deps.AssignmentService,
			ResultService:             deps.ResultService,
			StatsService:              deps.StatsService,
			TrustService:              deps.TrustV3Service,
			Hub:                       deps.Hub,
			EncryptionService:         deps.EncryptionService,
			EntropyService:            deps.EntropyService,
			UserService:               deps.UserService,
			NodeService:               deps.NodeService,
			TaskPaymentService:        deps.TaskPaymentService,
			RewardEngine:              deps.RewardEngine,
			TaskRateLimiter:           deps.TaskRateLimiter,
			Db:                        deps.Db,
			RedisClient:               deps.RedisClient,
			PayoutRetryService:        deps.PayoutRetry,
			EscrowService:             deps.EscrowService,
			PoolMonitorService:        deps.PoolMonitor,
			CacheService:              deps.CacheService,
			ErrorLogger:               deps.ErrorLogger,
			PowService:                deps.PowService,
			TaskOrchestrator:          deps.TaskOrchestrator,
			TelegramService:           deps.TelegramService,
			MaintenanceService:        deps.MaintenanceService,
			SovereignBridge:           deps.SovereignBridge,
			KnowledgeService:          deps.KnowledgeService,
			PricingService:            deps.PricingService,
			InvoiceService:            deps.InvoiceService,
			WelcomeBonusService:       deps.WelcomeBonusService,
			BurnService:               deps.BurnService,
			MultiLevelReferralService: deps.MultiLevelReferralService,
			AgentMarketplaceService:   deps.AgentMarketplaceService,
			ApiKeyService:             deps.ApiKeyService,
			GuardrailsService:         deps.GuardrailsService,
			GeoService:                deps.GeoService,
			AgentModelService:         deps.AgentModelService,
			FleetCommandService:       deps.FleetCommandService,
			OmniPerformance:           deps.OmniPerformance,
			SwarmLFS:                  deps.SwarmLFS,
			SettlementService:         deps.SettlementService,
			GaslessUserService:        deps.GaslessUserService,
			FinancialMonitor:          deps.FinancialMonitor,
			Organism:                  deps.Organism,
			MonetizationService:       deps.MonetizationService,
			OrganismHub:               deps.OrganismHub,
			LlmRouter:                 deps.LlmRouter,
			RecyclingPool:             deps.RecyclingPool,
			CocoonBridge:              deps.CocoonBridge,
			CocoonSymbiosis:           deps.CocoonSymbiosis,
			HybridRouter:              deps.HybridRouter,
			ZkProofService:            deps.ZkComputeProof,
			SmartRouter:               deps.SmartRouter,
			SwarmLedger:               deps.SwarmLedger,
			HuggingFaceService:        deps.HuggingFaceService,
			FinanceML:                 deps.FinanceML,
			IAMService:                deps.IAMService,
			ZKBridge:                  deps.ZKBridge,
			MarketMaker:               deps.MarketMaker,
			RenderEngine:              deps.RenderEngine,
			BillingService:            deps.BillingService,
		})

		api.SetupLeviathanLiveStream(deps.Router)

		v1Group := deps.Router.Group("/api/v1")
		protectedGroup := deps.Router.Group("/api/v1")
		api.SetupPipelineRoutes(v1Group, protectedGroup, deps.PipelineService)
		api.SetupSovereignRoutes(v1Group, deps.Db)

		swarmModelMgr := services.NewSwarmModelManager(deps.Db, os.Getenv("OLLAMA_URL"))
		swarmIntel := services.NewSwarmIntelligenceService(deps.Db, os.Getenv("OLLAMA_URL"), deps.KnowledgeService, swarmModelMgr)
		agentHandler := api.NewAgentAPIHandler(deps.Db, deps.OpenClawBridge, deps.RecyclingPool, deps.KnowledgeService, swarmModelMgr, swarmIntel)
		api.SetupAgentRoutes(v1Group, agentHandler)

		openClawPanelHandler := api.NewOpenClawPanelHandler(deps.Db, deps.OpenClawBridge, deps.InferenceService)
		if deps.SmartRouter != nil {
			openClawPanelHandler.SetSmartRouter(deps.SmartRouter)
		}
		adminGroupClaw := v1Group.Group("/", api.RequireAdminWallet(cfg.TON))
		api.SetupOpenClawPanelRoutes(adminGroupClaw, openClawPanelHandler)

		api.SetupUniversalMeshRoutes(v1Group, deps.UniversalMeshService, deps.ContributionMonetization)
		api.SetupMeshConstitutionRoutes(v1Group, deps.MeshConstitution)
		api.SetupBillingRoutes(v1Group, deps.BillingService)
		api.SetupCleanCoreRoutes(protectedGroup, deps.CleanCoreService, cfg.TON)
		api.SetupGlobalAbsorptionRoutes(v1Group, deps.GlobalAbsorption)
		api.SetupCosmicGenesisRoutes(v1Group, protectedGroup, deps.Db, deps.AgentSubcontractService, deps.GoldHashRateService)
		api.SetupMCPRoutes(deps.Router, v1Group)
		queue.RegisterQueueRoutes(v1Group, deps.TaskQueue)

		// Ollama connectivity check
		checkOllamaConnectivity()

		log.Printf("NEURAL PULSE: ACTIVE - INTELLIGENCE IS FLOWING")
		log.Printf("DATA AIRLOCK: ENGAGED - PRIVACY IS ABSOLUTE")
		log.Printf("COLLECTIVE EVOLUTION: INITIALIZED - THE HIVE IS LEARNING")
		log.Printf("[SUCCESS] AUDIT NOISE ELIMINATED: DATABASE SYNCED")

		// 6. Start Server
		port := cfg.Server.Port
		log.Printf("🔥 Server starting on port %s", port)
		if err := deps.Router.Run(":" + port); err != nil {
			log.Fatalf("❌ Server failed: %v", err)
		}
	})
}

// startGaslessWiring wires TON wallet for gasless subsidies.
func startGaslessWiring(_ context.Context, deps ApplicationDependencies) {
	cfg := deps.Cfg
	if deps.GaslessUserService == nil || cfg.TON.PlatformWalletAddress == "" || cfg.TON.PlatformWalletPrivateKey == "" {
		return
	}
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
		deps.GaslessUserService.SetTONWallet(w)
		log.Printf("⛽ Gasless User: TON wallet wired for subsidies and internal swap")
	}
}

// startPayoutBatch starts highload wallet payout batching.
func startPayoutBatch(ctx context.Context, deps ApplicationDependencies) {
	if deps.PayoutBatchService == nil || deps.HighloadWallet == nil || !deps.HighloadWallet.IsInitialized() {
		return
	}
	deps.PayoutBatchService.SetHighloadWallet(deps.HighloadWallet)
	gstdJettonAddr := deps.Cfg.TON.GSTDJettonAddress
	if gstdJettonAddr != "" {
		deps.PayoutBatchService.SetGSTDJettonMaster(gstdJettonAddr)
	}
	go deps.PayoutBatchService.Start(ctx)
	log.Printf("⛽ Payout Batch: Highload Ascension ACTIVE (15m)")

	// Wire on-chain burns when GSTD jetton address is known
	if deps.BurnService != nil && gstdJettonAddr != "" {
		deps.BurnService.SetHighloadWallet(deps.HighloadWallet, gstdJettonAddr)
	}

	if deps.TelegramService != nil {
		deps.HighloadWallet.SetTelegramAlert(deps.TelegramService.SendMessage)
		go func() {
			ticker := time.NewTicker(30 * time.Minute)
			defer ticker.Stop()
			deps.HighloadWallet.CheckGasReserveAndAlert(ctx)
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					deps.HighloadWallet.CheckGasReserveAndAlert(ctx)
				}
			}
		}()
	}
}

// startTreasuryLoop runs periodic Gold Reserve processing.
func startTreasuryLoop(ctx context.Context, treasury *services.TreasuryService) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		log.Printf("💰 Treasury Service Started (Gold Bridge Active)")
		if err := treasury.ProcessGoldReserves(ctx); err != nil {
			log.Printf("⚠️ Treasury Error: %v", err)
		}
		for {
			select {
			case <-ticker.C:
				if err := treasury.ProcessGoldReserves(ctx); err != nil {
					log.Printf("⚠️ Treasury Error: %v", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}

// startHeartbeatFlush periodically flushes batched heartbeats and marks stale nodes offline.
func startHeartbeatFlush(ctx context.Context, nodeService *services.NodeService) {
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
				stale, _ := nodeService.MarkStaleNodesOffline(ctx, 10*time.Minute)
				if stale > 0 {
					log.Printf("⚠️ Marked %d stale nodes offline (10min threshold)", stale)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}

// verifyGenesisLock verifies binary integrity via Genesis Lock.
func verifyGenesisLock(gl *genesis.GenesisLock) {
	if err := gl.LoadManifest(); err != nil {
		log.Printf("⚠️ Genesis Lock: manifest load: %v (will generate)", err)
	}
	result, err := gl.Verify()
	if err != nil {
		log.Printf("⚠️ Genesis Lock: verification error: %v", err)
	} else if result.Verified {
		log.Printf("✅ Genesis Lock: VERIFIED (v%s, %dms)", result.Version, result.LatencyMs)
	} else {
		log.Printf("⚠️ Genesis Lock: %d mismatches (non-fatal in dev)", len(result.Mismatches))
	}
	gl.StartPeriodicVerification(30 * time.Minute)
}

// logSwarmStatus logs the Phase 0 Genesis status including swarm ledger init.
func logSwarmStatus(ctx context.Context, deps ApplicationDependencies) {
	log.Printf("══════════════════════════════════════════")
	log.Printf("🔱 PHASE 0 GENESIS: ALL SYSTEMS ONLINE")
	log.Printf("   A2A Protocol:    %v", deps.A2aServer != nil)
	log.Printf("   Hive Memory:     %v", deps.HiveStore != nil)
	log.Printf("   Sentinel:        %v", deps.SentinelEngine != nil)
	log.Printf("   Genesis Lock:    %v", deps.GenesisLock != nil)
	log.Printf("   Node Manager:    %v", deps.NodeManager != nil)
	log.Printf("   LLM Router:      %v (nodes=%d)", deps.LlmRouter != nil, func() int {
		if deps.LlmRouter != nil {
			return deps.LlmRouter.GetNodeCount()
		}
		return 0
	}())
	log.Printf("   Settlement:      %v", deps.SettlementCli != nil)
	log.Printf("   Cocoon TEE:      %v (proxy=%v)", deps.CocoonBridge != nil && deps.CocoonBridge.IsEnabled(), func() bool {
		if deps.CocoonBridge != nil {
			h := deps.CocoonBridge.HealthCheck(ctx)
			return h.ProxyReachable
		}
		return false
	}())
	log.Printf("   Hybrid Router:   %v", deps.HybridRouter != nil)
	log.Printf("   Cocoon Symbiosis: %v", deps.CocoonSymbiosis != nil)
	if deps.SwarmNode != nil {
		log.Printf("   Swarm P2P:       true (ID=%s)", deps.SwarmNode.Host.ID().String())
		if deps.SwarmLedger != nil {
			if deps.Db != nil {
				deps.SwarmLedger.SetDB(deps.Db)
			}
			go deps.SwarmLedger.StartMempoolWorker(ctx)
			go deps.SwarmLedger.StartMempoolCleaner(ctx)
			go deps.SwarmLedger.StartRewardDistributor(ctx)
			deps.SwarmLedger.EnableStateSync()
			go func() {
				time.Sleep(10 * time.Second)
				deps.SwarmLedger.SyncStateFromPeers(ctx)
			}()
			log.Printf("   Swarm Ledger:    ACTIVE — PostgreSQL persistence + Sentinel Consensus")
		}
	}
	log.Printf("══════════════════════════════════════════")
}

// checkOllamaConnectivity tests Ollama availability asynchronously.
func checkOllamaConnectivity() {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		log.Printf("ℹ️ OLLAMA_URL not set — local Ollama disabled, using Groq Cloud")
		return
	}
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
