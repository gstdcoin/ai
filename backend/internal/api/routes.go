package api

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	infRouter "distributed-computing-platform/internal/inference"
	"distributed-computing-platform/internal/p2p"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/redis/go-redis/v9"
)

const (
	errTaskIDRequired = "task id is required"
	errTaskNotFound   = "task not found"
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
	escrowService *services.EscrowService,
	poolMonitorService *services.PoolMonitorService,
	cacheService *services.CacheService,
	errorLogger *services.ErrorLogger,
	powService *services.ProofOfWorkService,
	taskOrchestrator *services.TaskOrchestrator,
	telegramService *services.TelegramService,
	maintenanceService *services.MaintenanceService,
	sovereignBridge *services.SovereignBridgeService,
	knowledgeService *services.KnowledgeService,
	pricingService *services.PricingService,
	invoiceService *services.InvoiceService,
	// Growth System Services
	welcomeBonusService *services.WelcomeBonusService,
	burnService *services.BurnService,
	multiLevelReferralService *services.MultiLevelReferralService,
	agentMarketplaceService *services.AgentMarketplaceService,
	apiKeyService *services.APIKeyService,
	guardrailsService *services.GuardrailsService,
	geoService *services.GeoService,
	agentModelService *services.AgentModelService,
	fleetCommandService *services.FleetCommandService,
	omniPerformance *services.OmniPerformanceService,
	swarmLFS *services.SwarmLFSService,
	settlementService *services.SettlementService,
	gaslessUserService *services.GaslessUserService,
	financialMonitor *services.FinancialMonitorService,
	organism *services.SovereignOrganismService,
	monetizationService *services.MonetizationMetricsService,
	organismHub *services.OrganismHubService,
	llmRouter *infRouter.Router,
	recyclingPool *services.RecyclingPoolService,
	cocoonBridge *services.CocoonBridgeService,
	cocoonSymbiosis *services.CocoonSwarmSymbiosis,
	hybridRouter *services.HybridIntelligenceRouter,
	smartRouter *services.SmartRouter,
	swarmLedger *p2p.Ledger,
) {
	log.Printf("🔧 SetupRoutes: Starting route setup, redisClient type: %T", redisClient)

	// CORS: allow API access from web app, Telegram, mobile, and external clients
	allowedOrigins := map[string]bool{
		"https://app.gstdtoken.com":     true,
		"https://api.gstdtoken.com":     true,
		"https://chat.gstdtoken.com":    true,
		"https://gstdbot.gstdtoken.com": true,
		"https://monitor.gstdtoken.com": true,
		"http://localhost:3000":          true,
		"http://127.0.0.1:3000":         true,
		"https://web.telegram.org":      true,
		"https://t.me":                  true,
	}
	router.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if origin == "" {
				return true // Non-browser clients (mobile SDK, curl, API tools)
			}
			if allowedOrigins[origin] {
				return true
			}
			// Vercel preview deployments (*.vercel.app)
			if strings.HasSuffix(origin, ".vercel.app") {
				return true
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Session-Token", "X-API-Key", "X-Admin-API-Key"},
		ExposeHeaders:    []string{"Content-Length", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Initialize BrainHandler
	brainHandler := NewBrainHandler(knowledgeService)

	// Initialize Gateway/API Key Handler
	gatewayHandler := NewGatewayHandler(apiKeyService, taskService, db.(*sql.DB), llmRouter)
	if guardrailsService != nil {
		gatewayHandler.SetGuardrails(guardrailsService)
	}
	if omniPerformance != nil {
		gatewayHandler.SetOmniPerformance(omniPerformance)
	}
	if knowledgeService != nil {
		gatewayHandler.SetKnowledgeService(knowledgeService)
	}
	if settlementService != nil {
		gatewayHandler.SetSettlement(settlementService)
	}
	if statsService != nil {
		gatewayHandler.SetStats(statsService)
	}
	if redisClient != nil {
		if rc, ok := redisClient.(*redis.Client); ok && rc != nil {
			gatewayHandler.SetRedis(rc)
		}
	}
	if recyclingPool != nil {
		gatewayHandler.SetRecyclingPool(recyclingPool)
	}
	if cocoonBridge != nil {
		gatewayHandler.SetCocoonBridge(cocoonBridge)
	}
	if cocoonSymbiosis != nil {
		gatewayHandler.SetCocoonSymbiosis(cocoonSymbiosis)
	}
	if hybridRouter != nil {
		gatewayHandler.SetHybridRouter(hybridRouter)
	}
	if smartRouter != nil {
		gatewayHandler.SetSmartRouter(smartRouter)
	}

	// On-chain GSTD Settlement: contract-based pull model
	// Flow: User→GSTD→SettlementMaster→85%Workers/10%Treasury/5%Protocol
	// Server records intents, users deposit/withdraw via TonConnect wallet signature
	onchainSettlement := services.NewOnchainSettlementService(db.(*sql.DB), tonConfig)
	if onchainSettlement.IsEnabled() {
		gatewayHandler.SetOnchainSettlement(onchainSettlement)
		go onchainSettlement.Start(context.Background())
		log.Printf("⛓️  On-chain Settlement: ACTIVE (contract=%s, pull-model, batch every 60s)",
			tonConfig.ContractAddress[:min(12, len(tonConfig.ContractAddress))])
	}
	gatewayHandler.SetBurnService(burnService) // 5% burn on every paid chat inference

	// ═══ STAKING REWARD DISTRIBUTOR ═══
	// Distributes daily APY rewards to stakers from Golden Reserve pool
	// Pool is funded by 50% of chat inference fees
	stakingRewards := services.NewStakingRewardService(db.(*sql.DB))
	go stakingRewards.Start(context.Background())
	log.Println("💰 Staking Reward Distributor: ACTIVE (24h cycle, funded by chat fees → Golden Reserve)")

	// ═══ AUTO-REVENUE ENGINE ═══
	// Fully autonomous monetization — collects revenue from all 5 streams:
	// 1. AI Inference fees (45% platform keep)
	// 2. Telegram Stars purchases (real $$$)
	// 3. Bridge P2P commissions (1%)
	// 4. Staking spread (2% annual)
	// 5. API key metering
	autoRevenueService := services.NewAutoRevenueService(db.(*sql.DB), telegramService)
	go autoRevenueService.Start(context.Background())
	log.Println("💰 Auto-Revenue Engine: ACTIVE (5 revenue streams, daily P&L reports)")

	// Initialize Genesis System (Self-Generating APIs)
	var genesisRedis *redis.Client
	if rc, ok := redisClient.(*redis.Client); ok {
		genesisRedis = rc
	}
	genesisService := services.NewGenesisService(db.(*sql.DB), welcomeBonusService, genesisRedis, sovereignBridge)
	genesisService.StartMoltInstructor(context.Background())
	genesisHandler := NewGenesisHandler(genesisService, nodeService, agentModelService)
	SetupGenesisRoutes(router.Group("/api/v1"), genesisHandler)
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
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2*1024*1024) // 2MB Limit
		c.Next()
	})

	// ═══════════════════════════════════════════════════════════════
	// OMEGA CORE MIDDLEWARE (Applied Globally)
	// ═══════════════════════════════════════════════════════════════
	// Intercepts Omega API keys (gstd_sk_*) and sets wallet context.
	dbConn, _ := db.(*sql.DB)
	if dbConn != nil && apiKeyService != nil {
		router.Use(OmegaAuthMiddleware(apiKeyService, dbConn))
		router.Use(OmegaBillingMiddleware(dbConn, apiKeyService))
	}

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

	// [DYNAMIC_CONFIG_START]
	// Public configuration endpoint for frontend
	router.GET("/api/v1/config", func(c *gin.Context) {
		cfg := config.Load()
		eco := cfg.Economics
		c.JSON(200, gin.H{
			"contract_address":            tonConfig.ContractAddress,
			"gstd_jetton":                 tonConfig.GSTDJettonAddress,
			"admin_wallet":                tonConfig.AdminWallet,
			"escrow_contract":             tonConfig.ContractAddress, // Escrow is the main contract
			"network":                     tonConfig.Network,
			"api_url":                     tonConfig.APIURL,
			"target_price_per_result_usd": eco.TargetPricePerResultUSD, // ТЗ: ~$0.03/результат
			"genesis_launch":              true,                        // Genesis Launch status active
			"eternal_flame":               true,                        // Eternal Flame: 99.99% uptime, Auto-Scale, Archon Oversight
			"gasless_user":                true,                        // Gasless User: Subsidized Onboarding, Internal Swap
		})
	})
	// [DYNAMIC_CONFIG_END]

	// Services - Initialize ReferralService locally as it was added later
	// We cast the interface{} db to *sql.DB safely because we know it is *sql.DB from main.go
	dbConn, ok := db.(*sql.DB)
	if !ok {
		log.Fatal("SetupRoutes: db is not *sql.DB")
	}
	// Omega Point: DB Circuit Breaker - blocks non-critical routes when connections >= 90%
	router.Use(DBCircuitBreaker(dbConn))
	referralService := services.NewReferralService(dbConn)

	// API versioning
	api := router.Group("/api")
	api.Use(APIVersionMiddleware())

	v1 := api.Group("/v1")
	{
		// Public endpoints (no session required)
		v1.GET("/version", GetAPIVersion())

		// A2A (Agent-to-Agent) — https://github.com/gstdcoin/A2A
		v1.GET("/system/integrity", getSystemIntegrity())
		v1.POST("/agents/handshake", agentsHandshake(deviceService, apiKeyService, dbConn))

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
		v1.GET("/stats/public", getPublicStats(db.(*sql.DB), tonService, tonConfig, poolMonitorService, errorLogger))
		v1.GET("/openapi.json", GetOpenAPISpec())
		v1.GET("/network/entropy", getEntropyStats(taskService))
		v1.GET("/network/stats", getNetworkStats(statsService))
		v1.GET("/network/swarm-stats", getSwarmStats(db.(*sql.DB)))
		v1.GET("/network/map", getNetworkMap(db.(*sql.DB)))
		v1.GET("/monitor/unified", getUnifiedOrganism(organism, financialMonitor, monetizationService, organismHub, poolMonitorService))
		v1.GET("/monitor/flows", getFinancialMonitorData(financialMonitor))
		v1.GET("/monitor/neural", getNeuralFinancialAnalysis(financialMonitor))
		v1.GET("/monitor/organism-state", getOrganismState(organism))
		v1.GET("/monitor/revenue", getMonetizationMetrics(monetizationService))
		v1.GET("/monitor/revenue/auto", func(c *gin.Context) {
			period := c.DefaultQuery("period", "today")
			report, err := autoRevenueService.GetRevenueReport(c.Request.Context(), period)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, report)
		})

		// Monitor Signals — real progress data
		monitorSignalService := services.NewMonitorSignalService(db.(*sql.DB))
		v1.GET("/monitor/signals", getMonitorSignals(monitorSignalService))
		v1.GET("/monitor/signals/:id", getMonitorSignal(monitorSignalService))
		v1.POST("/monitor/signals/:id/sponsor", sponsorMonitorSignal(monitorSignalService, db.(*sql.DB)))

		// On-chain Settlement: contract-based pull model (public transparency)
		v1.GET("/monitor/onchain-settlement", func(c *gin.Context) {
			stats := onchainSettlement.GetStats(c.Request.Context())
			c.JSON(200, gin.H{
				"onchain_settlement": stats,
				"contract_flow": gin.H{
					"deposit":  "User signs GSTD Jetton transfer to SettlementMaster contract via TonConnect",
					"settle":   "Contract splits: 85% Workers (miners), 10% Pool (Gold Reserve), 5% Admin (Buyback & Burn)",
					"withdraw": "Worker signs Withdraw message → contract sends earnings to worker wallet",
				},
				"split": gin.H{
					"worker_pct": 85,
					"pool_pct":   10, "pool_address": tonConfig.PoolAddress, "pool_desc": "Gold Reserve (GSTD/XAUt)",
					"admin_pct": 5, "admin_address": tonConfig.AdminWallet, "admin_desc": "Buyback & Burn",
				},
				"contract_address": tonConfig.ContractAddress,
				"jetton_address":   tonConfig.GSTDJettonAddress,
			})
		})

		// Settlement: Get deposit payload for TonConnect (user sends GSTD to contract)
		v1.GET("/settlement/deposit-payload", func(c *gin.Context) {
			amount := c.DefaultQuery("amount", "1.0")
			wallet := c.Query("wallet")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "wallet parameter required"})
				return
			}
			var amountFloat float64
			fmt.Sscanf(amount, "%f", &amountFloat)
			if amountFloat <= 0 {
				c.JSON(400, gin.H{"error": "amount must be positive"})
				return
			}
			payload := onchainSettlement.GetDepositPayload(amountFloat, wallet)
			c.JSON(200, gin.H{
				"payload":     payload,
				"instruction": "Sign this transaction in TonConnect to deposit GSTD into the Settlement contract",
			})
		})

		// Settlement: Get withdraw payload for TonConnect (worker claims earnings)
		v1.GET("/settlement/withdraw-payload", func(c *gin.Context) {
			amount := c.DefaultQuery("amount", "0")
			wallet := c.Query("wallet")
			taskID := c.DefaultQuery("task_id", "")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "wallet parameter required"})
				return
			}
			var amountFloat float64
			fmt.Sscanf(amount, "%f", &amountFloat)
			if amountFloat <= 0 {
				c.JSON(400, gin.H{"error": "amount must be positive"})
				return
			}
			payload := onchainSettlement.GetWithdrawPayload(amountFloat, wallet, taskID)
			c.JSON(200, gin.H{
				"payload":     payload,
				"instruction": "Sign this Withdraw message in TonConnect to claim your earnings from the contract",
			})
		})

		// @Summary Get pool status
		// @Description Returns GSTD/XAUt liquidity pool status
		// @Tags Public
		// @Produce json
		// @Success 200 {object} map[string]interface{} "Pool status"
		// @Router /pool/status [get]
		v1.GET("/pool/status", getPoolStatus(poolMonitorService))

		// Genesis Launch: Viral Loop Analytics (public)
		v1.POST("/analytics/viral/share", RecordViralShare(dbConn))
		v1.POST("/analytics/viral/click", RecordViralClick(dbConn))
		v1.GET("/analytics/viral/community-favorite", GetCommunityFavorite(dbConn))

		// Gasless User: status (public)
		if gaslessUserService != nil {
			v1.GET("/gasless/status", GetGaslessStatus(gaslessUserService))
		}

		// Swarm LFS — tensor streaming, integrity, quantization (Protocol: Swarm LFS)
		if swarmLFS == nil {
			swarmLFS = services.NewSwarmLFSService()
		}
		lfsHandler := NewSwarmLFSHandler(swarmLFS)
		lfs := v1.Group("/lfs")
		{
			lfs.GET("/manifest/:model_id", lfsHandler.GetManifest)
			lfs.GET("/stream/:model_id/:block_id", lfsHandler.GetBlock)
			lfs.POST("/verify", lfsHandler.VerifyBlock)
		}
		log.Printf("✅ Swarm LFS routes registered (/lfs/manifest, /lfs/stream)")

		// Swarm Network (Layer-1 P2P)
		if swarmLedger != nil {
			v1.POST("/swarm/tx", func(c *gin.Context) {
				var tx p2p.Transaction
				if err := c.ShouldBindJSON(&tx); err != nil {
					c.JSON(400, gin.H{"error": "invalid transaction payload"})
					return
				}
				
				if err := swarmLedger.SubmitTransaction(c.Request.Context(), &tx); err != nil {
					// Distinguish between Sentinel AI rejections and simple bad signatures
					if strings.Contains(err.Error(), "sentinel") {
						c.JSON(403, gin.H{"error": "transaction blocked by swarm sentinel", "reason": err.Error()})
					} else {
						c.JSON(400, gin.H{"error": "transaction rejected", "details": err.Error()})
					}
					return
				}
				
				c.JSON(200, gin.H{"status": "accepted", "tx_id": tx.ID, "message": "Transaction submitted to swarm mempool"})
			})
			v1.GET("/swarm/mempool", func(c *gin.Context) {
				c.JSON(200, gin.H{
					"mempool_size": len(swarmLedger.State.Mempool),
				})
			})

			v1.GET("/swarm/account/:address", func(c *gin.Context) {
				addr := c.Param("address")
				balance, nonce := swarmLedger.GetAccountState(addr)
				
				c.JSON(200, gin.H{
					"address": addr,
					"balance": balance,
					"nonce":   nonce,
				})
			})

			// Bridge Oracle Endpoint: Triggered internally when TON L1 deposit is confirmed.
			// In production, this must be authenticated by the bridge operator key.
			v1.POST("/bridge/swarm-mint", func(c *gin.Context) {
				apiKey := c.GetHeader("X-Bridge-Key")
				// Simple prototype auth
				if apiKey != "genesis-oracle-key-42" {
					c.JSON(401, gin.H{"error": "unauthorized bridge oracle"})
					return
				}

				var req struct {
					ReceiverAddress string  `json:"receiver_address" binding:"required"`
					Amount          float64 `json:"amount" binding:"required"`
					TONTxHash       string  `json:"ton_tx_hash" binding:"required"`
				}

				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(400, gin.H{"error": "invalid mint payload"})
					return
				}

				// Create the Mint Transaction directly in the Ledger
				swarmLedger.DirectMint(req.ReceiverAddress, req.Amount)

				log.Printf("🌉 [Bridge -> Swarm] Successfully minted %.2f W-GSTD to %s (Origin: %s)", req.Amount, req.ReceiverAddress, req.TONTxHash)

				c.JSON(200, gin.H{
					"status":  "mint_successful",
					"address": req.ReceiverAddress,
					"amount":  req.Amount,
					"origin":  req.TONTxHash,
				})
			})
		}

		v1.GET("/network/autonomy", getAutonomyStats(maintenanceService))
		// Night Audit: публичная проверка соответствия золотых резервов количеству токенов (ТЗ 3.Б)
		v1.GET("/audit/reserves", getReservesAudit(db.(*sql.DB), tonService, tonConfig, poolMonitorService))

		// Network health — aggregated system status (public)
		v1.GET("/network/health", func(c *gin.Context) {
			sqlDB := db.(*sql.DB)
			// Node counts
			var totalNodes, activeNodes int
			_ = sqlDB.QueryRowContext(c.Request.Context(), `SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes') FROM nodes`).Scan(&totalNodes, &activeNodes)
			// Task counts
			var totalTasks, completed, active, queued int
			_ = sqlDB.QueryRowContext(c.Request.Context(), `SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed'), COUNT(*) FILTER (WHERE status = 'processing'), COUNT(*) FILTER (WHERE status = 'pending') FROM tasks`).Scan(&totalTasks, &completed, &active, &queued)
			// Avg trust
			var avgTrust float64
			_ = sqlDB.QueryRowContext(c.Request.Context(), `SELECT COALESCE(AVG(trust_score), 0) FROM nodes WHERE status = 'online'`).Scan(&avgTrust)

			status := "healthy"
			if activeNodes == 0 {
				status = "degraded"
			}
			c.JSON(200, gin.H{
				"status": status,
				"nodes":  gin.H{"total": totalNodes, "active": activeNodes},
				"tasks":  gin.H{"total": totalTasks, "completed": completed, "active": active, "queued": queued},
				"trust":  gin.H{"average": avgTrust},
				"uptime": gin.H{"backend": true, "database": true, "redis": redisClient != nil},
			})
		})

		// Settlement history — last N on-chain settlement events (public transparency)
		v1.GET("/settlement/history", func(c *gin.Context) {
			sqlDB := db.(*sql.DB)
			limit := 20
			rows, err := sqlDB.QueryContext(c.Request.Context(),
				`SELECT tx_id, from_wallet, to_wallet, amount_gstd, tx_type, COALESCE(description,''), created_at
				 FROM transaction_history
				 WHERE tx_type IN ('settlement','deposit','withdraw','stake','unstake','transfer')
				 ORDER BY created_at DESC LIMIT $1`, limit)
			if err != nil {
				c.JSON(200, gin.H{"history": []interface{}{}, "count": 0})
				return
			}
			defer rows.Close()
			var history []gin.H
			for rows.Next() {
				var txID, from, to, txType, desc string
				var amount float64
				var createdAt time.Time
				if err := rows.Scan(&txID, &from, &to, &amount, &txType, &desc, &createdAt); err != nil {
					continue
				}
				history = append(history, gin.H{
					"tx_id": txID, "from": from, "to": to, "amount": amount,
					"type": txType, "description": desc, "timestamp": createdAt.Format(time.RFC3339),
				})
			}
			if history == nil {
				history = []gin.H{}
			}
			c.JSON(200, gin.H{"history": history, "count": len(history)})
		})

		// Tasks stats — aggregated counts (public)
		v1.GET("/tasks/stats", func(c *gin.Context) {
			sqlDB := db.(*sql.DB)
			var total, completed, active, queued, failed int
			_ = sqlDB.QueryRowContext(c.Request.Context(),
				`SELECT COUNT(*),
				        COUNT(*) FILTER (WHERE status = 'completed'),
				        COUNT(*) FILTER (WHERE status = 'processing'),
				        COUNT(*) FILTER (WHERE status = 'pending'),
				        COUNT(*) FILTER (WHERE status = 'failed')
				 FROM tasks`).Scan(&total, &completed, &active, &queued, &failed)
			c.JSON(200, gin.H{
				"total": total, "completed": completed, "active": active,
				"queued": queued, "failed": failed,
				"success_rate": func() float64 {
					if total == 0 {
						return 0
					}
					return float64(completed) * 100 / float64(total)
				}(),
			})
		})

		// Metrics endpoint (Prometheus format) - public
		metricsService := NewMetricsService(db.(*sql.DB), redisClient.(*redis.Client))
		v1.GET("/metrics", metricsService.GetMetrics())

		// Internal endpoints (X-Admin-API-Key only, for cron/automation)
		internal := v1.Group("/internal")
		internal.Use(RequireAdminAPIKey())
		{
			internal.POST("/sync-gstd-balances", syncGSTDBalances(db.(*sql.DB), tonService, tonConfig))
			internal.POST("/telegram/notify-audit", telegramNotifyAudit(telegramService))
			internal.POST("/seed-open-grid-manifesto", seedOpenGridManifestoTask(db.(*sql.DB), tonConfig))
			internal.POST("/seed-global-resonance", seedGlobalResonanceTask(db.(*sql.DB), tonConfig))
			internal.POST("/seed-omni-test-task", seedOmniTestTask(db.(*sql.DB), tonConfig))
			internal.POST("/seed-ultimate-check", seedUltimateCheckTasks(db.(*sql.DB), tonConfig))
			internal.POST("/reconcile-marketplace-task", reconcileMarketplaceTask(db.(*sql.DB), referralService))
		}

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
		v1.POST("/users/login", loginUser(userService, tonConnectValidator, redisClientForLogin, gaslessUserService))

		// Market Operations (Public) - Frictionless for Agents
		marketHandler := NewMarketHandler(db.(*sql.DB))
		v1.GET("/market/price", getMarketPrice(poolMonitorService))
		v1.GET("/market/quote", marketHandler.GetSwapQuote)
		// Swap preparation still recommended to be public so users can see what they are signing before login
		v1.POST("/market/swap", marketHandler.PrepareSwapTransaction)
		// x402 Protocol for Agents (Payment Required)
		v1.POST("/market/buy-gstd-x402", marketHandler.GetX402BuyDetails)
		v1.POST("/market/buy-service-x402", marketHandler.BuyServiceX402) // NEW: Service Buying

		// Autonomous Auth (PoW) — devices get API key without session
		authHandler := NewAuthHandler()
		v1.GET("/auth/challenge", authHandler.GetChallenge)
		v1.POST("/auth/claim-key", authHandler.ClaimKey)
		v1.GET("/agents/challenge", authHandler.GetChallenge) // Alias for devices
		v1.POST("/agents/claim-key", authHandler.ClaimKey)    // Alias for devices

		// Protected endpoints (require session)
		var sessionMiddleware gin.HandlerFunc
		if redisClient != nil {
			if rc, ok := redisClient.(*redis.Client); ok && rc != nil {
				sessionMiddleware = ValidateSession(rc, apiKeyService)
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
		protected.GET("/users/balance", getUserBalance(tonService, tonConfig, db.(*sql.DB)))
		protected.GET("/users/keys", gatewayHandler.GetUserKeys)
		protected.POST("/users/keys", gatewayHandler.CreateUserKey)

		// === VIRAL ECONOMY ROUTES ===
		protected.GET("/users/pending_balance", getPendingBalance(db.(*sql.DB)))                  // Check off-chain earnings
		protected.POST("/users/claim_balance", claimPendingBalance(db.(*sql.DB), paymentService)) // Withdraw to TON

		// Gasless User: Internal Swap (GSTD → TON for gas)
		if gaslessUserService != nil {
			protected.POST("/swap/gstd-for-ton", InternalSwapGSTDForTON(gaslessUserService))
		}

		// Tasks (protected)
		protected.POST("/tasks", ValidateTaskRequest(), createTask(taskService))
		protected.GET("/tasks", getTasks(taskService))
		protected.GET("/tasks/pending", getTasksPending(assignmentService)) // Before :id — agent flow
		protected.GET("/tasks/:id", getTask(taskService))
		protected.DELETE("/tasks/:id", deleteTask(db.(*sql.DB)))
		protected.GET("/tasks/:id/payment", getTaskWithPayment(taskPaymentService))

		// Devices (protected)
		protected.POST("/devices/register", registerDevice(deviceService, errorLogger, multiLevelReferralService, dbConn, gaslessUserService))
		protected.GET("/devices", getDevices(deviceService))
		protected.GET("/devices/my", getMyDevices(deviceService))

		// Unified Identity: /registry/join — single endpoint for nodes + devices (Session or API Key)
		protected.POST("/registry/join", RegistryJoin(nodeService, deviceService, geoService, telegramService, multiLevelReferralService, dbConn, gaslessUserService))

		// Device endpoints (protected)
		protected.GET("/device/tasks/available", getAvailableTasks(assignmentService))
		protected.GET("/device/tasks/my", getMyTasks(assignmentService))
		protected.POST("/device/tasks/:id/claim", claimTask(assignmentService, deviceService))
		protected.POST("/device/tasks/:id/result", submitResult(resultService, validationService))
		protected.GET("/device/tasks/:id/result", getTaskResult(resultService))

		// Stats (protected, except /stats/public which is public)
		protected.GET("/stats", getStats(statsService))
		protected.GET("/stats/tasks/completion", getTaskCompletionHistory(statsService))

		// Admin (protected by session + RequireAdminWallet middleware)
		admin := protected.Group("/admin")
		admin.Use(RequireAdminWallet(tonConfig))
		{
			admin.GET("/health", getAdminHealth(db.(*sql.DB), redisClient.(*redis.Client), rewardEngine, payoutRetryService))
			admin.GET("/failed-payouts", getFailedPayouts(db.(*sql.DB)))
			admin.POST("/retry-payout/:id", retryPayout(payoutRetryService))
			admin.GET("/withdrawals/pending", getPendingWithdrawals(db.(*sql.DB)))
			admin.POST("/withdrawals/:id/approve", approveWithdrawal(db.(*sql.DB), rewardEngine))
			admin.POST("/broadcast", broadcastAnnouncement(hub, knowledgeService))
			admin.POST("/sync-gstd-balances", syncGSTDBalances(db.(*sql.DB), tonService, tonConfig))
			admin.POST("/seed-global-resonance", seedGlobalResonanceTask(db.(*sql.DB), tonConfig))
			admin.POST("/seed-open-grid-manifesto", seedOpenGridManifestoTask(db.(*sql.DB), tonConfig))
			admin.POST("/hardware-grants/allocate", allocateHardwareGrants(db.(*sql.DB)))
			// Infrastructure Supremacy: Architect Master-Dashboard
			admin.GET("/architect/network", getAdminArchitectNetwork(db.(*sql.DB)))
			admin.GET("/architect/params", getAdminArchitectParams(tonConfig))
			admin.GET("/architect/vision", getAdminArchitectVision(db.(*sql.DB)))
			// Eternal Synergy: Top-10 Agents by GSTD economy contribution (weekly)
			admin.GET("/agents/leaderboard", getAdminAgentsLeaderboard(db.(*sql.DB)))
		}

		// Admin commission endpoints (require session + admin wallet authorization)
		adminCommissionGroup := protected.Group("/admin/commission")
		adminCommissionGroup.Use(RequireAdminWallet(tonConfig))
		{
			adminCommissionGroup.GET("/balance", getCommissionBalance(paymentService))
			adminCommissionGroup.GET("/withdraw-intent", getCommissionWithdrawIntent(paymentService, tonConfig))
			adminCommissionGroup.POST("/prepare-liquidity", prepareLiquidityProvision(escrowService))
		}

		// Wallet (protected)
		protected.GET("/wallet/gstd-balance", getGSTDBalance(tonService, tonConfig))
		protected.GET("/wallet/efficiency", getEfficiency(tonService, tonConfig))
		protected.GET("/wallet/jetton-address", getJettonAddress(tonService, tonConfig))
		protected.POST("/wallet/transfer", walletTransfer(dbConn))
		protected.GET("/wallet/history", walletHistory(dbConn))

		// Staking (protected for write, public for read)
		protected.POST("/staking/stake", stakingStake(dbConn))
		protected.POST("/staking/unstake", stakingUnstake(dbConn))
		v1.GET("/staking/info", stakingInfo(dbConn))

		// TON Wallet Gateway: Direct GSTD purchase via Ston.fi (Ascension)
		v1.GET("/wallet/buy-gstd", getBuyGSTDLink(tonService, tonConfig))

		// ─── Wallet Link: Telegram ────────────────────────────────
		// POST /wallet/link-telegram — link node wallet to Telegram user (called by GSTD Node OS)
		v1.POST("/wallet/link-telegram", func(c *gin.Context) {
			var req struct {
				Address        string `json:"address"`
				TelegramUserID string `json:"telegram_user_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.Address == "" || req.TelegramUserID == "" {
				c.JSON(400, gin.H{"error": "address and telegram_user_id required"})
				return
			}
			// Ensure user exists
			_, err := dbConn.ExecContext(c.Request.Context(), `
				INSERT INTO users (wallet_address, balance, created_at, updated_at)
				VALUES ($1, 0, NOW(), NOW())
				ON CONFLICT (wallet_address) DO NOTHING
			`, req.Address)
			if err != nil {
				c.JSON(500, gin.H{"error": "failed to create user"})
				return
			}
			// Update telegram_id
			_, err = dbConn.ExecContext(c.Request.Context(), `
				UPDATE users SET telegram_id = $1, updated_at = NOW() WHERE wallet_address = $2
			`, req.TelegramUserID, req.Address)
			if err != nil {
				c.JSON(500, gin.H{"error": "failed to link telegram"})
				return
			}
			c.JSON(200, gin.H{"status": "linked", "address": req.Address, "telegram_user_id": req.TelegramUserID})
		})

		// ─── Wallet Link: External (Tonkeeper etc.) ──────────────
		// POST /wallet/link-external — link external wallet for reward payouts
		v1.POST("/wallet/link-external", func(c *gin.Context) {
			var req struct {
				NodeAddress     string `json:"node_address"`
				ExternalAddress string `json:"external_address"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.NodeAddress == "" || req.ExternalAddress == "" {
				c.JSON(400, gin.H{"error": "node_address and external_address required"})
				return
			}
			// Ensure user record exists for external wallet
			_, _ = dbConn.ExecContext(c.Request.Context(), `
				INSERT INTO users (wallet_address, balance, created_at, updated_at)
				VALUES ($1, 0, NOW(), NOW())
				ON CONFLICT (wallet_address) DO NOTHING
			`, req.ExternalAddress)
			// Update node to point to external wallet
			_, err := dbConn.ExecContext(c.Request.Context(), `
				UPDATE nodes SET wallet_address = $1, updated_at = NOW() WHERE wallet_address = $2 OR id = $2
			`, req.ExternalAddress, req.NodeAddress)
			if err != nil {
				c.JSON(500, gin.H{"error": "failed to link external wallet"})
				return
			}
			log.Printf("[Wallet] External wallet linked: %s → %s", req.NodeAddress[:16], req.ExternalAddress[:16])
			c.JSON(200, gin.H{
				"status":           "linked",
				"node_address":     req.NodeAddress,
				"external_address": req.ExternalAddress,
				"message":          "Rewards will now be credited to your external wallet.",
			})
		})

		// ─── Node: Heartbeat (backend-verified rewards) ─────────
		// POST /nodes/heartbeat — node reports status, backend calculates reward
		v1.POST("/nodes/heartbeat", func(c *gin.Context) {
			var req struct {
				WalletAddress string `json:"wallet_address"`
				NodeName      string `json:"node_name"`
				NodeVersion   string `json:"node_version"`
				UptimeHours   int    `json:"uptime_hours"`
				QueriesServed int    `json:"queries_served"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.WalletAddress == "" {
				c.JSON(400, gin.H{"error": "wallet_address required"})
				return
			}

			// Validate TON wallet address format — only real wallets accepted
			wallet := strings.TrimSpace(req.WalletAddress)
			isValidTON := false
			if strings.HasPrefix(wallet, "0:") && len(wallet) >= 50 {
				isValidTON = true // Raw format
			} else {
				validPrefixes := []string{"EQ", "UQ", "kQ", "0Q"}
				for _, prefix := range validPrefixes {
					if strings.HasPrefix(wallet, prefix) && len(wallet) >= 46 && len(wallet) <= 50 {
						isValidTON = true
						break
					}
				}
			}
			if !isValidTON {
				c.JSON(400, gin.H{
					"error":   "invalid_wallet",
					"message": "A valid TON wallet address is required (EQ.../UQ... format). Connect your wallet via TonConnect to get started.",
				})
				return
			}
			req.WalletAddress = wallet

			// Ensure node & user exist
			_, _ = dbConn.ExecContext(c.Request.Context(), `
				INSERT INTO users (wallet_address, gstd_balance, created_at, updated_at)
				VALUES ($1, 0, NOW(), NOW())
				ON CONFLICT (wallet_address) DO NOTHING
			`, req.WalletAddress)
			nodeName := req.NodeName
			if nodeName == "" {
				if req.NodeVersion != "" {
					nodeName = "GSTD Node v" + req.NodeVersion
				} else {
					nodeName = "GSTD Node"
				}
			}

			log.Printf("[HEARTBEAT-V130] wallet=%s nodeName=%s", req.WalletAddress, nodeName)

			// Check time since last heartbeat BEFORE updating last_seen
			var hoursSinceLast float64 = 1.0
			row := dbConn.QueryRowContext(c.Request.Context(), `
				SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - last_seen)) / 3600, 1)
				FROM nodes WHERE wallet_address = $1
			`, req.WalletAddress)
			_ = row.Scan(&hoursSinceLast)
			// If wallet not found, hoursSinceLast stays 1.0 (new node, always reward)

			// Ensure user exists (nodes.wallet_address FK → users.wallet_address)
			_, _ = dbConn.ExecContext(c.Request.Context(), `
				INSERT INTO users (wallet_address, created_at, updated_at)
				VALUES ($1, NOW(), NOW())
				ON CONFLICT (wallet_address) DO NOTHING
			`, req.WalletAddress)

			// Try UPDATE existing node first
			res, err := dbConn.ExecContext(c.Request.Context(), `
				UPDATE nodes SET status = 'online', last_seen = NOW(), updated_at = NOW(), name = $2
				WHERE wallet_address = $1
			`, req.WalletAddress, nodeName)
			rowsAffected := int64(0)
			if err != nil {
				log.Printf("[heartbeat] UPDATE error: %v", err)
			} else {
				rowsAffected, _ = res.RowsAffected()
			}
			// If no existing node, INSERT
			if rowsAffected == 0 {
				if _, err := dbConn.ExecContext(c.Request.Context(), `
					INSERT INTO nodes (id, wallet_address, name, status, last_seen, created_at, updated_at)
					VALUES (gen_random_uuid()::text, $1, $2, 'online', NOW(), NOW(), NOW())
				`, req.WalletAddress, nodeName); err != nil {
					log.Printf("[heartbeat] INSERT error: %v", err)
				}
			}
			log.Printf("[heartbeat] wallet=%s rows_updated=%d", req.WalletAddress, rowsAffected)

			if hoursSinceLast < 0.9 {
				// Too soon — less than ~54 minutes since last heartbeat
				c.JSON(200, gin.H{"reward": 0, "reason": "heartbeat_too_soon", "next_in_minutes": int((1.0 - hoursSinceLast) * 60), "hours_since_last": hoursSinceLast})
				return
			}

			// Calculate reward (server-controlled rates)
			const uptimeRewardPerHour = 0.01  // 0.01 GSTD per hour uptime
			const queryRewardPer = 0.0001     // 0.0001 GSTD per query served
			const maxRewardPerHeartbeat = 0.5 // max 0.5 GSTD per heartbeat
			const maxDailyPerNode = 10.0      // max 10 GSTD per day

			uptimeReward := uptimeRewardPerHour
			queryReward := float64(req.QueriesServed) * queryRewardPer
			reward := uptimeReward + queryReward
			if reward > maxRewardPerHeartbeat {
				reward = maxRewardPerHeartbeat
			}

			// Check daily cap - sum today's heartbeat rewards for this node
			var dailyEarned float64
			dbConn.QueryRowContext(c.Request.Context(), `
				SELECT COALESCE(SUM(amount), 0) FROM node_rewards_ledger 
				WHERE node_address = $1 AND reward_type = 'uptime' 
				AND created_at >= CURRENT_DATE
			`, req.WalletAddress).Scan(&dailyEarned)
			if dailyEarned >= maxDailyPerNode {
				c.JSON(200, gin.H{"reward": 0, "reason": "daily_cap_reached", "daily_earned": dailyEarned, "daily_cap": maxDailyPerNode})
				return
			}
			// Clamp reward to not exceed daily cap
			if dailyEarned+reward > maxDailyPerNode {
				reward = maxDailyPerNode - dailyEarned
			}
			if reward <= 0 {
				c.JSON(200, gin.H{"reward": 0, "reason": "no_reward"})
				return
			}

			// Credit reward to user
			_, err = dbConn.ExecContext(c.Request.Context(), `
				UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1, updated_at = NOW()
				WHERE wallet_address = $2
			`, reward, req.WalletAddress)
			if err != nil {
				c.JSON(500, gin.H{"error": "failed to credit reward"})
				return
			}
			// Update node stats (total_earnings column added by C3 migration)
			if _, errStats := dbConn.ExecContext(c.Request.Context(), `
				UPDATE nodes SET total_earnings = COALESCE(total_earnings, 0) + $1, last_seen = NOW(), updated_at = NOW()
				WHERE wallet_address = $2
			`, reward, req.WalletAddress); errStats != nil {
				log.Printf("[heartbeat] total_earnings update err: %v", errStats)
			}

			// ═══ Node Wallet Binding: record reward for owner ═══
			// If this node has an active wallet binding, accumulate reward for the owner
			var ownerWallet string
			bindErr := dbConn.QueryRowContext(c.Request.Context(),
				`SELECT owner_wallet FROM node_wallet_bindings WHERE node_address = $1 AND is_active = true LIMIT 1`,
				req.WalletAddress).Scan(&ownerWallet)
			if bindErr == nil && ownerWallet != "" {
				// Write to pending rewards (tokens stay in "contract" until claimed)
				_, _ = dbConn.ExecContext(c.Request.Context(),
					`INSERT INTO node_pending_rewards (owner_wallet, node_id, amount_gstd, reward_type, description)
					 SELECT $1, COALESCE(b.node_id, 'unknown'), $2, 'uptime', $3
					 FROM node_wallet_bindings b WHERE b.owner_wallet = $1 AND b.node_address = $4 AND b.is_active = true LIMIT 1`,
					ownerWallet, reward, fmt.Sprintf("Heartbeat reward: %.4f GSTD (uptime=%dh, queries=%d)", reward, req.UptimeHours, req.QueriesServed), req.WalletAddress)

				// Update binding stats
				_, _ = dbConn.ExecContext(c.Request.Context(),
					`UPDATE node_wallet_bindings SET last_heartbeat = NOW(), total_earned_gstd = total_earned_gstd + $1
					 WHERE node_address = $2 AND is_active = true`,
					reward, req.WalletAddress)
			}

			// Update Redis worker:online status for active_workers count
			if genesisRedis != nil {
				onlineKey := fmt.Sprintf("worker:online:%s", req.WalletAddress)
				genesisRedis.Set(c.Request.Context(), onlineKey, "online", 90*time.Second)
			}

			// Update node_tiers for tier progression & streak tracking (M9: with error recovery)
			go func(nodeAddr string, rwd float64) {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[heartbeat-async] panic recovered: %v", r)
					}
				}()

				if _, err := dbConn.Exec(
					`INSERT INTO node_tiers (node_address) VALUES ($1) ON CONFLICT DO NOTHING`, nodeAddr); err != nil {
					log.Printf("[heartbeat-async] node_tiers insert err: %v", err)
				}
				
				// Update uptime (M5: 1.0h per hourly heartbeat, not 0.00833h)
				if _, err := dbConn.Exec(
					`UPDATE node_tiers SET 
						total_uptime_hours = total_uptime_hours + 1.0,
						total_earned_gstd = total_earned_gstd + $1,
						streak_days = CASE 
							WHEN last_heartbeat_day = CURRENT_DATE THEN streak_days
							WHEN last_heartbeat_day = CURRENT_DATE - 1 THEN streak_days + 1
							ELSE 1 END,
						best_streak = GREATEST(best_streak, 
							CASE WHEN last_heartbeat_day = CURRENT_DATE - 1 THEN streak_days + 1 ELSE streak_days END),
						last_heartbeat_day = CURRENT_DATE,
						tier = CASE
							WHEN total_uptime_hours + 1.0 >= 5000 THEN 'diamond'
							WHEN total_uptime_hours + 1.0 >= 2000 THEN 'platinum'
							WHEN total_uptime_hours + 1.0 >= 500 THEN 'gold'
							WHEN total_uptime_hours + 1.0 >= 100 THEN 'silver'
							ELSE 'bronze' END,
						updated_at = NOW()
					 WHERE node_address = $2`, rwd, nodeAddr); err != nil {
					log.Printf("[heartbeat-async] node_tiers update err: %v", err)
				}
				
				// Record in rewards ledger
				if _, err := dbConn.Exec(
					`INSERT INTO node_rewards_ledger (node_address, reward_type, amount, description)
					 VALUES ($1, 'uptime', $2, 'heartbeat')`, nodeAddr, rwd); err != nil {
					log.Printf("[heartbeat-async] rewards_ledger insert err: %v", err)
				}

				// ═══ SOVEREIGN INTEGRATION: Track supply + revenue ═══
				dbConn.Exec(
					`UPDATE tokenomics_halving SET current_circulating = current_circulating + $1, 
					 total_minted_in_epoch = total_minted_in_epoch + $1 WHERE epoch_number = (SELECT MAX(epoch_number) FROM tokenomics_halving)`, rwd)
				dbConn.Exec(
					`INSERT INTO revenue_sharing (epoch_date, total_platform_revenue, node_operator_share, total_eligible_nodes)
					 VALUES (CURRENT_DATE, $1, $1 * 0.85, 1)
					 ON CONFLICT (epoch_date) DO UPDATE SET 
					 total_platform_revenue = revenue_sharing.total_platform_revenue + $1,
					 node_operator_share = revenue_sharing.node_operator_share + ($1 * 0.85),
					 total_eligible_nodes = (SELECT COUNT(*) FROM nodes WHERE status='online' OR last_seen > NOW() - INTERVAL '24 hours')`, rwd)
			}(req.WalletAddress, reward)

			c.JSON(200, gin.H{
				"reward":          reward,
				"uptime_reward":   uptimeReward,
				"query_reward":    queryReward,
				"queries_counted": req.QueriesServed,
				"reason":          "verified_heartbeat",
				"message":         "Reward credited to pending balance.",
				"sovereign": gin.H{
					"revenue_share_pct":  85,
					"burn_rate_pct":      2,
					"auto_compound_hint": true,
					"staking_apy_range":  "8-72%",
				},
			})
		})

		// Legacy: keep sync-earnings for backward compatibility but with stricter limits
		v1.POST("/nodes/sync-earnings", func(c *gin.Context) {
			c.JSON(410, gin.H{
				"error":   "deprecated",
				"message": "Use POST /api/v1/nodes/heartbeat instead. Nodes no longer self-report earnings.",
			})
		})

		// ═══════════════════════════════════════════════════════════════
		// Node Wallet Binding — owner binds TON wallet to node(s)
		// - One wallet can own multiple nodes
		// - One node can have only one active owner at a time
		// - If user loses node, they rebind from another node
		// - Rewards stay in "contract" (DB) until claimed
		// ═══════════════════════════════════════════════════════════════

		// POST /nodes/bind-wallet — bind owner wallet to a node
		v1.POST("/nodes/bind-wallet", func(c *gin.Context) {
			var req struct {
				NodeID      string `json:"node_id" binding:"required"`
				OwnerWallet string `json:"owner_wallet" binding:"required"`
				NodeAddress string `json:"node_address"` // node's internal wallet
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "node_id and owner_wallet required"})
				return
			}
			if len(req.OwnerWallet) < 10 {
				c.JSON(400, gin.H{"error": "invalid wallet address"})
				return
			}

			ctx := c.Request.Context()

			// Deactivate any previous binding for this node
			_, _ = dbConn.ExecContext(ctx,
				`UPDATE node_wallet_bindings SET is_active = false, unbound_at = NOW() WHERE node_id = $1 AND is_active = true`,
				req.NodeID)

			// Create new binding
			var bindingID int
			err := dbConn.QueryRowContext(ctx,
				`INSERT INTO node_wallet_bindings (node_id, owner_wallet, node_address, bound_at, is_active)
				 VALUES ($1, $2, $3, NOW(), true)
				 RETURNING id`,
				req.NodeID, req.OwnerWallet, req.NodeAddress).Scan(&bindingID)
			if err != nil {
				c.JSON(500, gin.H{"error": "failed to bind wallet", "details": err.Error()})
				return
			}

			// Ensure user_wallets entry exists
			_, _ = dbConn.ExecContext(ctx,
				`INSERT INTO user_wallets (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`,
				req.OwnerWallet)

			c.JSON(200, gin.H{
				"ok":         true,
				"binding_id": bindingID,
				"node_id":    req.NodeID,
				"owner":      req.OwnerWallet,
				"message":    "Wallet bound to node. Rewards will accumulate until claimed.",
			})
		})

		// POST /nodes/unbind-wallet — unbind wallet from node
		v1.POST("/nodes/unbind-wallet", func(c *gin.Context) {
			var req struct {
				NodeID      string `json:"node_id" binding:"required"`
				OwnerWallet string `json:"owner_wallet" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "node_id and owner_wallet required"})
				return
			}

			result, err := dbConn.ExecContext(c.Request.Context(),
				`UPDATE node_wallet_bindings SET is_active = false, unbound_at = NOW()
				 WHERE node_id = $1 AND owner_wallet = $2 AND is_active = true`,
				req.NodeID, req.OwnerWallet)
			if err != nil {
				c.JSON(500, gin.H{"error": "unbind failed"})
				return
			}
			rows, _ := result.RowsAffected()
			if rows == 0 {
				c.JSON(404, gin.H{"error": "no active binding found"})
				return
			}
			c.JSON(200, gin.H{"ok": true, "message": "Wallet unbound. Pending rewards are preserved and can still be claimed."})
		})

		// GET /nodes/my-nodes?wallet=<address> — get all nodes bound to wallet
		v1.GET("/nodes/my-nodes", func(c *gin.Context) {
			wallet := c.Query("wallet")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "wallet parameter required"})
				return
			}

			rows, err := dbConn.QueryContext(c.Request.Context(),
				`SELECT b.node_id, b.node_address, b.bound_at, b.total_earned_gstd, b.last_heartbeat,
				        COALESCE(n.status, 'unknown') as node_status,
				        COALESCE(n.name, 'Node') as node_name,
				        COALESCE((SELECT SUM(amount_gstd) FROM node_pending_rewards WHERE owner_wallet = b.owner_wallet AND node_id = b.node_id AND claimed_at IS NULL), 0) as pending_gstd
				 FROM node_wallet_bindings b
				 LEFT JOIN nodes n ON n.id = b.node_id
				 WHERE b.owner_wallet = $1 AND b.is_active = true
				 ORDER BY b.bound_at DESC`,
				wallet)
			if err != nil {
				c.JSON(500, gin.H{"error": "query failed"})
				return
			}
			defer rows.Close()

			type NodeBinding struct {
				NodeID        string  `json:"node_id"`
				NodeAddress   *string `json:"node_address"`
				BoundAt       string  `json:"bound_at"`
				TotalEarned   float64 `json:"total_earned_gstd"`
				LastHeartbeat *string `json:"last_heartbeat"`
				NodeStatus    string  `json:"node_status"`
				NodeName      string  `json:"node_name"`
				PendingGSTD   float64 `json:"pending_gstd"`
			}

			var nodes []NodeBinding
			for rows.Next() {
				var nb NodeBinding
				if err := rows.Scan(&nb.NodeID, &nb.NodeAddress, &nb.BoundAt, &nb.TotalEarned, &nb.LastHeartbeat, &nb.NodeStatus, &nb.NodeName, &nb.PendingGSTD); err != nil {
					continue
				}
				nodes = append(nodes, nb)
			}
			if nodes == nil {
				nodes = []NodeBinding{}
			}

			// Total pending across all nodes
			var totalPending float64
			_ = dbConn.QueryRowContext(c.Request.Context(),
				`SELECT COALESCE(SUM(amount_gstd), 0) FROM node_pending_rewards WHERE owner_wallet = $1 AND claimed_at IS NULL`,
				wallet).Scan(&totalPending)

			c.JSON(200, gin.H{
				"wallet":        wallet,
				"nodes":         nodes,
				"total_nodes":   len(nodes),
				"total_pending": totalPending,
			})
		})

		// GET /nodes/pending-rewards?wallet=<address> — get all unclaimed rewards
		v1.GET("/nodes/pending-rewards", func(c *gin.Context) {
			wallet := c.Query("wallet")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "wallet parameter required"})
				return
			}

			rows, err := dbConn.QueryContext(c.Request.Context(),
				`SELECT id, node_id, amount_gstd, reward_type, COALESCE(description, ''), created_at
				 FROM node_pending_rewards
				 WHERE owner_wallet = $1 AND claimed_at IS NULL
				 ORDER BY created_at DESC LIMIT 100`,
				wallet)
			if err != nil {
				c.JSON(500, gin.H{"error": "query failed"})
				return
			}
			defer rows.Close()

			type Reward struct {
				ID          int     `json:"id"`
				NodeID      string  `json:"node_id"`
				Amount      float64 `json:"amount_gstd"`
				RewardType  string  `json:"reward_type"`
				Description string  `json:"description"`
				CreatedAt   string  `json:"created_at"`
			}
			var rewards []Reward
			var totalPending float64
			for rows.Next() {
				var r Reward
				if err := rows.Scan(&r.ID, &r.NodeID, &r.Amount, &r.RewardType, &r.Description, &r.CreatedAt); err != nil {
					continue
				}
				totalPending += r.Amount
				rewards = append(rewards, r)
			}
			if rewards == nil {
				rewards = []Reward{}
			}

			c.JSON(200, gin.H{
				"wallet":        wallet,
				"rewards":       rewards,
				"total_pending": totalPending,
				"count":         len(rewards),
			})
		})

		// POST /nodes/claim-rewards — claim all pending rewards to wallet balance
		// "Tokens stay in contract until requested"
		v1.POST("/nodes/claim-rewards", func(c *gin.Context) {
			var req struct {
				OwnerWallet string `json:"owner_wallet" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "owner_wallet required"})
				return
			}

			ctx := c.Request.Context()
			tx, err := dbConn.BeginTx(ctx, nil)
			if err != nil {
				c.JSON(500, gin.H{"error": "transaction failed"})
				return
			}
			defer tx.Rollback()

			// Get total unclaimed rewards
			var totalAmount float64
			var rewardsCount int
			err = tx.QueryRowContext(ctx,
				`SELECT COALESCE(SUM(amount_gstd), 0), COUNT(*)
				 FROM node_pending_rewards
				 WHERE owner_wallet = $1 AND claimed_at IS NULL`,
				req.OwnerWallet).Scan(&totalAmount, &rewardsCount)
			if err != nil || totalAmount <= 0 {
				c.JSON(200, gin.H{"ok": true, "claimed": 0, "message": "No pending rewards to claim"})
				return
			}

			// Mark all rewards as claimed
			_, err = tx.ExecContext(ctx,
				`UPDATE node_pending_rewards SET claimed_at = NOW() WHERE owner_wallet = $1 AND claimed_at IS NULL`,
				req.OwnerWallet)
			if err != nil {
				c.JSON(500, gin.H{"error": "claim update failed"})
				return
			}

			// Credit to user_wallets balance
			_, err = tx.ExecContext(ctx,
				`INSERT INTO user_wallets (address, gstd_balance) VALUES ($1, $2)
				 ON CONFLICT (address) DO UPDATE SET gstd_balance = user_wallets.gstd_balance + $2, updated_at = NOW()`,
				req.OwnerWallet, totalAmount)
			if err != nil {
				c.JSON(500, gin.H{"error": "balance credit failed"})
				return
			}

			// Record claim
			_, _ = tx.ExecContext(ctx,
				`INSERT INTO node_reward_claims (owner_wallet, total_claimed_gstd, rewards_count) VALUES ($1, $2, $3)`,
				req.OwnerWallet, totalAmount, rewardsCount)

			// Record in earnings history
			_, _ = tx.ExecContext(ctx,
				`INSERT INTO earnings_history (wallet_address, amount_gstd, source_type, reference_id)
				 VALUES ($1, $2, 'node_claim', $3)`,
				req.OwnerWallet, totalAmount, fmt.Sprintf("claim_%d_rewards", rewardsCount))

			if err := tx.Commit(); err != nil {
				c.JSON(500, gin.H{"error": "commit failed"})
				return
			}

			c.JSON(200, gin.H{
				"ok":             true,
				"claimed_gstd":   totalAmount,
				"rewards_count":  rewardsCount,
				"wallet":         req.OwnerWallet,
				"message":        fmt.Sprintf("%.4f GSTD claimed from %d rewards. Tokens credited to your wallet.", totalAmount, rewardsCount),
			})
		})

		// ═══════════════════════════════════════════════════════════════
		// Auto-Claim: rewards older than 90 days automatically go to
		// owner's wallet. Tokens never stay locked forever.
		// ═══════════════════════════════════════════════════════════════

		// GET /nodes/auto-claim-status — check how many rewards are near expiry
		v1.GET("/nodes/auto-claim-status", func(c *gin.Context) {
			type ExpiryInfo struct {
				Wallet       string  `json:"wallet"`
				TotalPending float64 `json:"total_pending"`
				OldestDays   int     `json:"oldest_days"`
				RewardsCount int     `json:"rewards_count"`
			}
			rows, err := dbConn.QueryContext(c.Request.Context(),
				`SELECT owner_wallet,
				        SUM(amount_gstd) as total,
				        EXTRACT(DAY FROM NOW() - MIN(created_at))::int as oldest_days,
				        COUNT(*) as cnt
				 FROM node_pending_rewards
				 WHERE claimed_at IS NULL
				 GROUP BY owner_wallet
				 ORDER BY oldest_days DESC
				 LIMIT 50`)
			if err != nil {
				c.JSON(500, gin.H{"error": "query failed"})
				return
			}
			defer rows.Close()

			var items []ExpiryInfo
			var totalStuckGSTD float64
			for rows.Next() {
				var item ExpiryInfo
				if err := rows.Scan(&item.Wallet, &item.TotalPending, &item.OldestDays, &item.RewardsCount); err != nil {
					continue
				}
				totalStuckGSTD += item.TotalPending
				items = append(items, item)
			}
			if items == nil {
				items = []ExpiryInfo{}
			}

			c.JSON(200, gin.H{
				"wallets":            items,
				"total_wallets":      len(items),
				"total_stuck_gstd":   totalStuckGSTD,
				"auto_claim_days":    90,
				"message":            "Rewards older than 90 days are auto-claimed to owner wallets every 6 hours.",
			})
		})

		// POST /nodes/force-auto-claim — manually trigger auto-claim for expired rewards
		v1.POST("/nodes/force-auto-claim", func(c *gin.Context) {
			claimed, err := autoClaimExpiredRewards(dbConn, c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"ok": true, "auto_claimed": claimed})
		})

		// Background: auto-claim expired rewards every 6 hours
		go func() {
			time.Sleep(5 * time.Minute) // Initial delay
			ticker := time.NewTicker(6 * time.Hour)
			defer ticker.Stop()
			for range ticker.C {
				claimed, err := autoClaimExpiredRewards(dbConn, context.Background())
				if err != nil {
					log.Printf("[AutoClaim] Error: %v", err)
				} else if claimed > 0 {
					log.Printf("[AutoClaim] ✅ Auto-claimed %.4f GSTD from expired rewards", claimed)
				}
			}
		}()

		// Node Wallet Balance (public, by address — used by GSTD Node OS)
		v1.GET("/wallet/:address/balance", func(c *gin.Context) {
			address := c.Param("address")
			if address == "" {
				c.JSON(400, gin.H{"error": "wallet address required"})
				return
			}
			// Look up balance in DB
			var gstdBalance float64
			var pendingBalance float64
			err := dbConn.QueryRowContext(c.Request.Context(),
				`SELECT COALESCE(gstd_balance, 0), COALESCE(pending_balance, 0) FROM users WHERE wallet_address = $1`,
				address).Scan(&gstdBalance, &pendingBalance)
			if err != nil {
				// Node doesn't have a user yet — return zeros (node will create user on first task)
				c.JSON(200, gin.H{"gstd": 0, "ton": 0, "pending": 0, "total_earned": 0})
				return
			}
			// Also get total earned from earnings history
			var totalEarned float64
			_ = dbConn.QueryRowContext(c.Request.Context(),
				`SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE wallet_address = $1`,
				address).Scan(&totalEarned)

			c.JSON(200, gin.H{
				"gstd":         gstdBalance,
				"ton":          0,
				"pending":      pendingBalance,
				"total_earned": totalEarned,
			})
		})

		// Payments (protected)
		protected.POST("/payments/payout-intent", createPayoutIntent(paymentService))

		// Nodes — public endpoints (GSTD Node OS sends X-Wallet-Address, no session)
		// These MUST be public so autonomous nodes can register and heartbeat
		v1.POST("/nodes/register", registerNode(nodeService, geoService, telegramService, multiLevelReferralService))
		// NOTE: /nodes/heartbeat is already registered above (line ~776) with reward calculation
		v1.GET("/nodes/public", getPublicNodes(nodeService))
		v1.POST("/nodes/activate-wallet", activateWalletAsNode(nodeService))
		// C4 fix: maintenance-alerts was missing from public routes
		v1.GET("/nodes/maintenance-alerts", maintenanceAlerts(nodeService))

		// ─── Node OS Polling Endpoints (public, called every 5-30s by nodes) ───
		// These MUST be public — autonomous nodes use X-Wallet-Address header
		v1.POST("/tasks/poll", func(c *gin.Context) {
			wallet := c.GetHeader("X-Wallet-Address")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "X-Wallet-Address header required"})
				return
			}
			// Query for tasks assigned to this node/wallet
			var taskID, taskType, payload string
			err := dbConn.QueryRowContext(c.Request.Context(),
				`SELECT task_id, task_type, COALESCE(payload, '{}')
				 FROM tasks
				 WHERE status = 'pending'
				   AND (executor_address = $1 OR executor_address IS NULL)
				 ORDER BY priority_score DESC, created_at ASC
				 LIMIT 1`, wallet).Scan(&taskID, &taskType, &payload)
			if err != nil {
				c.JSON(200, gin.H{"task": nil, "message": "no tasks available"})
				return
			}
			c.JSON(200, gin.H{
				"task": gin.H{
					"id":      taskID,
					"type":    taskType,
					"payload": json.RawMessage(payload),
				},
			})
		})

		v1.POST("/tasks/complete", func(c *gin.Context) {
			wallet := c.GetHeader("X-Wallet-Address")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "X-Wallet-Address header required"})
				return
			}
			var req struct {
				TaskID        string      `json:"task_id"`
				NodeID        string      `json:"node_id"`
				Result        interface{} `json:"result"`
				WalletAddress string      `json:"wallet_address"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			// Convert result to JSON string to save in the database
			resultJSON, _ := json.Marshal(req.Result)
			_, err := dbConn.ExecContext(c.Request.Context(),
				`UPDATE tasks SET status = 'completed', completed_at = NOW(), result = $1, executor_address = $2 WHERE task_id = $3`,
				string(resultJSON), wallet, req.TaskID)
			
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to complete task"})
				return
			}
			
			// Simple autonomous reward logic for demonstration: 
			// In real prod, this goes through taskPaymentService.
			// The node is doing it natively via Swarm, so we grant some GSTD.
			
			c.JSON(200, gin.H{"status": "success", "message": "Task completed"})
		})

		v1.POST("/tasks/fail", func(c *gin.Context) {
			wallet := c.GetHeader("X-Wallet-Address")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "X-Wallet-Address header required"})
				return
			}
			var req struct {
				TaskID string `json:"task_id"`
				Error  string `json:"error"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			
			_, _ = dbConn.ExecContext(c.Request.Context(),
				`UPDATE tasks SET status = 'failed', updated_at = NOW(), result = $1 WHERE task_id = $2`, req.Error, req.TaskID)
			
			c.JSON(200, gin.H{"status": "success", "message": "Task marked as failed"})
		})

		v1.POST("/bridge/request", func(c *gin.Context) {
			// This endpoint allows users to request a token bridge across chains
			var req struct {
				SourceChain string  `json:"source_chain"`
				DestChain   string  `json:"dest_chain"`
				Amount      float64 `json:"amount"`
				TxHash      string  `json:"tx_hash"`
				UserAddress string  `json:"user_address"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}

			// Generate payload for the swarm node
			payloadJSON, _ := json.Marshal(req)
			
			// Insert bridge_verify task into tasks pool
			taskID := uuid.New().String()
			_, err := dbConn.ExecContext(c.Request.Context(),
				`INSERT INTO tasks (task_id, task_type, payload, status, priority_score, created_at, requester_address)
				 VALUES ($1, 'bridge_verify', $2, 'pending', 10, NOW(), 'bridge-system')`,
				taskID, string(payloadJSON))
			
			if err != nil {
				c.JSON(500, gin.H{"error": "Failed to schedule bridge validation"})
				return
			}

			c.JSON(200, gin.H{
				"status": "pending_validation",
				"message": "Bridge request queued for decentralized validation",
				"task_id": taskID,
			})
		})

		v1.POST("/training/poll", func(c *gin.Context) {
			wallet := c.GetHeader("X-Wallet-Address")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "X-Wallet-Address header required"})
				return
			}
			// Training tasks — federated learning rounds
			var targetID, modelName string
			var round int
			err := dbConn.QueryRowContext(c.Request.Context(),
				`SELECT id, model_name, current_round
				 FROM federated_model_targets
				 WHERE status = 'active'
				 ORDER BY created_at DESC
				 LIMIT 1`).Scan(&targetID, &modelName, &round)
			if err != nil {
				c.JSON(200, gin.H{"training": nil, "message": "no training rounds available"})
				return
			}
			c.JSON(200, gin.H{
				"training": gin.H{
					"id":    targetID,
					"model": modelName,
					"round": round,
				},
			})
		})

		// POST /nodes/deregister — gracefully marks node as offline
		v1.POST("/nodes/deregister", func(c *gin.Context) {
			var req struct {
				NodeID string `json:"node_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.NodeID == "" {
				c.JSON(400, gin.H{"error": "node_id required"})
				return
			}
			wallet := c.GetHeader("X-Wallet-Address")
			identifier := wallet
			if identifier == "" {
				identifier = req.NodeID
			}
			_, _ = dbConn.ExecContext(c.Request.Context(),
				`UPDATE nodes SET status = 'offline', updated_at = NOW()
				 WHERE wallet_address = $1 OR id = $2`, identifier, req.NodeID)
			c.JSON(200, gin.H{"status": "deregistered", "node_id": req.NodeID})
		})

		// POST /training/submit — submit a new training job
		v1.POST("/training/submit", func(c *gin.Context) {
			wallet := c.GetHeader("X-Wallet-Address")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "X-Wallet-Address header required"})
				return
			}
			var req struct {
				NodeID    string `json:"node_id"`
				Type      string `json:"type"`
				BaseModel string `json:"baseModel"`
				Epochs    int    `json:"epochs"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			jobID := fmt.Sprintf("train-%d", time.Now().UnixNano())
			c.JSON(200, gin.H{"id": jobID, "status": "queued", "type": req.Type})
		})

		// POST /training/complete — report training job completion
		v1.POST("/training/complete", func(c *gin.Context) {
			var req struct {
				NodeID string `json:"node_id"`
				JobID  string `json:"job_id"`
				Status string `json:"status"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			log.Printf("[training] Job %s completed by node %s", req.JobID, req.NodeID)
			c.JSON(200, gin.H{"status": "acknowledged", "job_id": req.JobID})
		})

		// POST /training/fail — report training job failure
		v1.POST("/training/fail", func(c *gin.Context) {
			var req struct {
				NodeID string `json:"node_id"`
				JobID  string `json:"job_id"`
				Error  string `json:"error"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			log.Printf("[training] Job %s failed on node %s: %s", req.JobID, req.NodeID, req.Error)
			c.JSON(200, gin.H{"status": "acknowledged", "job_id": req.JobID})
		})

		// POST /models/share — node shares a trained model to the platform
		v1.POST("/models/share", func(c *gin.Context) {
			var req struct {
				NodeID    string  `json:"node_id"`
				Name      string  `json:"name"`
				BaseModel string  `json:"baseModel"`
				Type      string  `json:"type"`
				SizeMB    float64 `json:"size_mb"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
				c.JSON(400, gin.H{"error": "name required"})
				return
			}
			// Store in swarm_models table
			_, _ = dbConn.ExecContext(c.Request.Context(),
				`INSERT INTO swarm_models (id, name, base_model, type, size_mb, node_id, created_at)
				 VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW())
				 ON CONFLICT DO NOTHING`,
				req.Name, req.BaseModel, req.Type, req.SizeMB, req.NodeID)
			c.JSON(200, gin.H{"status": "shared", "name": req.Name})
		})

		v1.POST("/resources/publish", func(c *gin.Context) {
			wallet := c.GetHeader("X-Wallet-Address")
			if wallet == "" {
				c.JSON(400, gin.H{"error": "X-Wallet-Address header required"})
				return
			}
			var req struct {
				CPU    float64  `json:"cpu_available"`
				RAM    float64  `json:"ram_available"`
				GPU    string   `json:"gpu,omitempty"`
				Models []string `json:"models,omitempty"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			// Update node resource availability
			_, _ = dbConn.ExecContext(c.Request.Context(),
				`UPDATE nodes SET
					specs = jsonb_set(
						COALESCE(specs, '{}'),
						'{resources}',
						$2::jsonb
					),
					last_seen = NOW(),
					status = 'online'
				 WHERE wallet_address = $1`,
				wallet,
				fmt.Sprintf(`{"cpu_available":%.1f,"ram_available":%.1f,"gpu":"%s"}`, req.CPU, req.RAM, req.GPU))
			c.JSON(200, gin.H{"status": "published", "wallet": wallet})
		})

		// Nodes — protected endpoints (require session for fleet management)
		SetupNodeProtectedRoutes(protected, nodeService, geoService, telegramService, multiLevelReferralService, fleetCommandService)

		// Task Payment (protected)
		protected.POST("/tasks/create", createTaskWithPayment(taskPaymentService, taskRateLimiter))

		// Worker endpoints (protected)
		protected.GET("/tasks/worker/pending", getWorkerPendingTasks(taskPaymentService))
		protected.POST("/tasks/worker/submit", submitWorkerResult(taskPaymentService, rewardEngine))

		// Marketplace endpoints - split into public and protected
		marketplaceHandler := NewMarketplaceHandler(dbConn, escrowService, referralService)
		// Public marketplace endpoints (no session required)
		v1.GET("/marketplace/tasks", marketplaceHandler.GetAvailableTasks)
		v1.GET("/marketplace/stats", marketplaceHandler.GetMarketplaceStats)
		v1.GET("/marketplace/funds", marketplaceHandler.GetPlatformFunds)
		// Protected marketplace endpoints (require session)
		SetupMarketplaceProtectedRoutes(protected, marketplaceHandler)

		// Telegram Bot API (X-Bot-Token auth) — link wallet, claim, complete tasks
		tgBotHandler := NewTelegramBotHandler(dbConn, marketplaceHandler.GetMarketplace(), nodeService, deviceService, gaslessUserService, gatewayHandler)
		tgBot := v1.Group("/telegram/bot")
		tgBot.Use(RequireBotToken())
		tgBot.POST("/link", tgBotHandler.LinkWallet)
		tgBot.GET("/wallet", tgBotHandler.GetWallet)
		tgBot.GET("/balance", tgBotHandler.GetBalance)
		tgBot.GET("/nodes", tgBotHandler.GetNodes)
		tgBot.POST("/claim", tgBotHandler.ClaimTask)
		tgBot.POST("/complete", tgBotHandler.CompleteTask)
		tgBot.POST("/ai", tgBotHandler.AIChat)
		tgBot.POST("/claim_reward", tgBotHandler.ClaimReward)
		tgBot.POST("/topup", tgBotHandler.Topup)

		// Stars purchase — credits GSTD to linked wallet
		v1.POST("/telegram/buy-stars", buyStarsHandler(dbConn))

		// Initialize and setup Orchestrator routes (PoW, Task Queue, Client Dashboard)
		orchestratorHandler := NewOrchestratorHandler(db.(*sql.DB), taskOrchestrator, powService, tonService, geoService)
		SetupOrchestratorRoutes(v1, orchestratorHandler)
		log.Printf("✅ Orchestrator routes registered")

		// Sovereign Compute Bridge (MoltBot integration)
		SetupBridgeRoutes(v1, sovereignBridge)

		// P2P Cross-Chain Bridge (Token swap order book)
		SetupP2PBridgeRoutes(v1, db.(*sql.DB))

		// Node Rewards Engine (motivation & incentives)
		SetupNodeRewardsRoutes(v1, db.(*sql.DB))

		// Monitor Routes (Signal Launch)
		setupMonitorRoutes(v1, taskService, telegramService, db.(*sql.DB))

		// Knowledge / Hive Memory
		SetupKnowledgeRoutes(protected, knowledgeService)
		// Hyper-Expansion: Hive Intelligence API, Oracle, Leaderboard, Milestones
		SetupHyperExpansionRoutes(v1, protected, knowledgeService, dbConn, tonConfig)
		// Infrastructure Supremacy: API-as-a-Service gateway, become-node CTA
		SetupInfrastructureSupremacyRoutes(v1, protected, dbConn)
		// Public: GRID IS THINKING ticker (resonance quotes, no auth)
		v1.GET("/knowledge/resonance", getResonanceQuotes(knowledgeService))
		// Public: FREE AI TOOLS BY GSTD GRID (code snippets from agents)
		v1.GET("/knowledge/grid-tools", getGridTools(knowledgeService))
		// Agent store: allows registered agents to store knowledge (X-Wallet-Address + node validation)
		v1.POST("/knowledge/agent/store", storeKnowledgeAgent(knowledgeService, db.(*sql.DB)))
		SetupBrainRoutes(v1, brainHandler)

		// Pricing (Dynamic Budget)
		v1.GET("/pricing/suggested", func(c *gin.Context) {
			taskType := c.Query("type")
			if taskType == "" {
				taskType = "inference"
			}
			suggested, err := pricingService.CalculateSuggestedBudget(c.Request.Context(), taskType)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"suggested_budget": suggested, "currency": "GSTD"})
		})

		// Invoices (Settlement Layer)
		SetupInvoiceRoutes(protected, invoiceService)

		// ===== GROWTH SYSTEM & ONBOARDING =====
		// Integrated 1M user strategy: Bonus, Burn, Multi-level Referrals & Marketplace
		growthHandler := NewGrowthSystemHandler(
			db.(*sql.DB),
			welcomeBonusService,
			burnService,
			multiLevelReferralService,
			agentMarketplaceService,
		)
		SetupGrowthRoutes(v1, protected, growthHandler)

		// Legacy onboarding handler (for basic flows compatibility)
		onboardingHandler := NewOnboardingHandler()
		onboardingHandler.RegisterRoutes(v1)

		// Global Gateway (OpenAI Compatible) - Sovereign AI Inference
		// Hybrid Auth: Session (browser) + API Key (agents) → unified UserContext, Ultra gate works for both

		// ═══ OMEGA GATEWAY INTEGRATION ═══
		// OpenAI-compatible chat: /api/v1/chat/* (GSTD pricing, balance checks)
		omegaHandler := NewOmegaGatewayHandler(gatewayHandler, apiKeyService)
		v1.POST("/chat/completions", omegaHandler.HandleChatCompletions)
		v1.POST("/chat/smartmix", omegaHandler.HandleChatCompletions) // Alias for frontend SmartMix tiers
		v1.GET("/chat/ultra-status", gatewayHandler.GetUltraStatus)   // Optional auth: X-GSTD-Target-Wallet
		v1.GET("/models", omegaHandler.HandleListModels)
		// Cocoon Confidential Compute — TEE-protected inference on TON blockchain
		// Docs: https://cocoon.org/developers
		v1.GET("/chat/cocoon-status", gatewayHandler.GetCocoonStatus)
		v1.GET("/chat/hybrid-status", gatewayHandler.GetHybridStatus)
		v1.GET("/chat/sovereignty-index", gatewayHandler.GetSovereigntyIndex)

		// ═══ CHAT DEDUCTION — Called by frontend for paid Collective Intelligence tiers ═══
		v1.POST("/chat/deduct", chatDeductHandler(dbConn, burnService))

		log.Printf("✅ Growth System & Onboarding routes registered (Omega Gateway Active)")

		// ═══ UNIVERSAL SWARM EMBED API ═══
		// Embeddable AI: /api/v1/swarm/infer, /swarm/info, /swarm/widget.js
		// Any device, any platform — one API to rule them all
		swarmEmbedHandler := NewSwarmEmbedHandler(dbConn, smartRouter, apiKeyService)
		SetupSwarmEmbedRoutes(v1, swarmEmbedHandler)

		// ═══ NODE OS COMPATIBILITY — endpoints expected by GSTD Node OS ═══
		// GET /models/registry — returns available models for node training subsystem
		v1.GET("/models/registry", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"models": []gin.H{
					{"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "type": "inference", "available": true},
					{"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "type": "inference", "available": true},
					{"id": "qwen/qwen3-32b", "name": "Qwen3 32B", "type": "inference", "available": true},
					{"id": "meta-llama/llama-4-scout-17b-16e-instruct", "name": "Llama 4 Scout", "type": "inference", "available": true},
					{"id": "openai/gpt-oss-120b", "name": "GPT-OSS 120B", "type": "inference", "available": true},
					{"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B", "type": "inference", "available": true},
					{"id": "moonshotai/kimi-k2-instruct", "name": "Kimi K2", "type": "inference", "available": true},
					{"id": "groq/compound", "name": "Groq Compound", "type": "inference", "available": true},
				},
			})
		})

		// GET /memory/ping — health check for collective memory L3 layer
		v1.GET("/memory/ping", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok", "layer": "L3", "platform": "gstd"})
		})

		// POST /memory/recall — collective memory recall from L3 platform layer
		v1.POST("/memory/recall", func(c *gin.Context) {
			// Basic stub — full implementation would search agent_knowledge
			var req struct {
				Key      string `json:"key"`
				Question string `json:"question"`
				NodeID   string `json:"node_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "invalid request"})
				return
			}
			// Search in agent_knowledge table
			var answer, model string
			var confidence float64
			err := dbConn.QueryRowContext(c.Request.Context(),
				`SELECT content, COALESCE(model, 'platform'), COALESCE(confidence, 0.8)
				 FROM agent_knowledge
				 WHERE key = $1 OR question_hash = $1
				 ORDER BY confidence DESC LIMIT 1`, req.Key).Scan(&answer, &model, &confidence)
			if err != nil {
				c.JSON(200, gin.H{"found": false})
				return
			}
			c.JSON(200, gin.H{
				"found":      true,
				"answer":     answer,
				"model":      model,
				"confidence": confidence,
			})
		})

		// POST /memory/store — store knowledge in collective memory L3
		v1.POST("/memory/store", func(c *gin.Context) {
			var req struct {
				Key        string  `json:"key"`
				Question   string  `json:"question"`
				Answer     string  `json:"answer"`
				Model      string  `json:"model"`
				Confidence float64 `json:"confidence"`
				NodeID     string  `json:"node_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.Key == "" || req.Answer == "" {
				c.JSON(400, gin.H{"error": "key and answer required"})
				return
			}
			_, _ = dbConn.ExecContext(c.Request.Context(),
				`INSERT INTO agent_knowledge (key, question_hash, content, model, confidence, node_id, created_at)
				 VALUES ($1, $1, $2, $3, $4, $5, NOW())
				 ON CONFLICT (key) DO UPDATE SET content = $2, confidence = GREATEST(agent_knowledge.confidence, $4), updated_at = NOW()`,
				req.Key, req.Answer, req.Model, req.Confidence, req.NodeID)
			c.JSON(200, gin.H{"status": "stored", "key": req.Key})
		})

		log.Printf("✅ Node OS compatibility routes registered (/models/registry, /memory/*)")
	}

	// ═══ GSTD APP STORE & NODE DASHBOARD (Umbrel-style) ═══
	// Provides: App catalog, live system usage, widgets, notifications, settings, backups
	SetupAppStoreRoutes(v1, dbConn)

	// WebSocket endpoint
	router.GET("/ws", HandleWebSocket(hub, deviceService, assignmentService, fleetCommandService))
}

func getAutonomyStats(service *services.MaintenanceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := service.GetAutonomyStats(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, stats)
	}
}

// autoClaimExpiredRewards processes rewards older than 90 days.
// Tokens that sit unclaimed for too long are automatically credited
// to the owner's wallet balance so they don't stay locked forever.
func autoClaimExpiredRewards(db *sql.DB, ctx context.Context) (float64, error) {
	const expiryDays = 90

	// Find all wallets with expired unclaimed rewards
	rows, err := db.QueryContext(ctx,
		`SELECT owner_wallet, SUM(amount_gstd), COUNT(*)
		 FROM node_pending_rewards
		 WHERE claimed_at IS NULL AND created_at < NOW() - INTERVAL '1 day' * $1
		 GROUP BY owner_wallet`, expiryDays)
	if err != nil {
		return 0, fmt.Errorf("query expired rewards: %w", err)
	}
	defer rows.Close()

	type expiredWallet struct {
		wallet string
		amount float64
		count  int
	}
	var wallets []expiredWallet
	for rows.Next() {
		var w expiredWallet
		if err := rows.Scan(&w.wallet, &w.amount, &w.count); err != nil {
			continue
		}
		wallets = append(wallets, w)
	}

	if len(wallets) == 0 {
		return 0, nil
	}

	var totalClaimed float64
	for _, w := range wallets {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			continue
		}

		// Mark expired rewards as auto-claimed
		_, err = tx.ExecContext(ctx,
			`UPDATE node_pending_rewards
			 SET claimed_at = NOW(), claim_tx_id = 'auto_claim_90d'
			 WHERE owner_wallet = $1 AND claimed_at IS NULL AND created_at < NOW() - INTERVAL '1 day' * $2`,
			w.wallet, expiryDays)
		if err != nil {
			tx.Rollback()
			continue
		}

		// Credit to wallet balance
		_, err = tx.ExecContext(ctx,
			`INSERT INTO user_wallets (address, gstd_balance) VALUES ($1, $2)
			 ON CONFLICT (address) DO UPDATE SET gstd_balance = user_wallets.gstd_balance + $2, updated_at = NOW()`,
			w.wallet, w.amount)
		if err != nil {
			tx.Rollback()
			continue
		}

		// Record auto-claim
		_, _ = tx.ExecContext(ctx,
			`INSERT INTO node_reward_claims (owner_wallet, total_claimed_gstd, rewards_count, status)
			 VALUES ($1, $2, $3, 'auto_claimed')`,
			w.wallet, w.amount, w.count)

		// Record in earnings history
		_, _ = tx.ExecContext(ctx,
			`INSERT INTO earnings_history (wallet_address, amount_gstd, source_type, reference_id)
			 VALUES ($1, $2, 'auto_claim', $3)`,
			w.wallet, w.amount, fmt.Sprintf("auto_claim_90d_%d_rewards", w.count))

		if err := tx.Commit(); err != nil {
			continue
		}

		totalClaimed += w.amount
		log.Printf("[AutoClaim] Wallet %s: %.4f GSTD from %d expired rewards auto-credited",
			w.wallet[:min(16, len(w.wallet))], w.amount, w.count)
	}

	return totalClaimed, nil
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
			RequesterAddress      string  `json:"requester_address"`
			TaskType              string  `json:"task_type"`
			Operation             string  `json:"operation"`
			Model                 string  `json:"model"`
			InputSource           string  `json:"input_source"`
			InputHash             string  `json:"input_hash"`
			InputData             string  `json:"input_data"`
			TimeLimitSec          int     `json:"time_limit_sec"`
			MaxEnergyMwh          int     `json:"max_energy_mwh"`
			LaborCompensationGSTD float64 `json:"labor_compensation_gstd"`
			ValidationMethod      string  `json:"validation_method"`
			IsEncrypted           bool    `json:"is_encrypted"`
			ExecutorPubkey        string  `json:"executor_pubkey"`
		}

		if err := c.ShouldBindBodyWith(&req, binding.JSON); err != nil {
			c.JSON(400, gin.H{"error": SanitizeError(err)})
			return
		}

		descriptor := &models.TaskDescriptor{
			TaskType:  req.TaskType,
			Operation: req.Operation,
			Model:     req.Model,
			Input: models.InputData{
				Source: req.InputSource,
				Hash:   req.InputHash,
				Data:   req.InputData,
			},
			Constraints: models.Constraints{
				TimeLimitSec: req.TimeLimitSec,
				MaxEnergyMwh: req.MaxEnergyMwh,
			},
			Reward: models.Reward{
				AmountGSTD: req.LaborCompensationGSTD,
			},
			Validation:     req.ValidationMethod,
			MinTrust:       c.GetFloat64("min_trust"),
			IsPrivate:      c.GetBool("is_private"),
			IsEncrypted:    req.IsEncrypted,
			ExecutorPubkey: req.ExecutorPubkey,
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
			c.JSON(400, gin.H{"error": errTaskIDRequired})
			return
		}

		// Use GetTaskByID method directly (efficient query by ID)
		task, err := service.GetTaskByID(c.Request.Context(), taskID)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(404, gin.H{"error": errTaskNotFound})
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
			c.JSON(400, gin.H{"error": errTaskIDRequired})
			return
		}

		task, err := taskPaymentService.GetTaskByID(c.Request.Context(), taskID)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(404, gin.H{"error": errTaskNotFound})
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
			c.JSON(400, gin.H{"error": errTaskIDRequired})
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
				c.JSON(404, gin.H{"error": errTaskNotFound})
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
				"error":  "cannot delete task",
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
					"processing_tasks":     0,
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
				"processing_tasks":     0,
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
				"processing_tasks":     0,
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

// getMarketPrice returns current GSTD price and buy links. Always uses real DEX/reserve data.
func getMarketPrice(pms *services.PoolMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if pms == nil {
			c.JSON(503, gin.H{"error": "price service unavailable", "buy_links": getBuyLinksMap("1")})
			return
		}
		price, err := pms.GetGSTDPriceUSD(c.Request.Context())
		if err != nil || price <= 0 {
			c.JSON(503, gin.H{"error": "real GSTD price temporarily unavailable", "buy_links": getBuyLinksMap("1")})
			return
		}
		amount := c.DefaultQuery("amount", "10")
		c.JSON(200, gin.H{
			"gstd_price_usd": price,
			"xaut_price_usd": pms.GetXAUtPriceUSD(),
			"source":         "pool",
			"buy_links":      getBuyLinksMap(amount),
		})
	}
}

func getBuyLinksMap(amount string) map[string]string {
	return map[string]string{
		"ston_fi":   fmt.Sprintf("https://app.ston.fi/swap?ft=TON&tt=GSTD&ta=%s", amount),
		"dedust":    "https://dedust.io/swap/TON/GSTD",
		"manual":    "https://github.com/gstdcoin/ai/blob/main/docs/BUY_GSTD_TELEGRAM_WALLET.md",
		"wallet_tg": "https://t.me/wallet",
	}
}

// getBuyGSTDLink returns Ston.fi swap URL for direct TON→GSTD purchase (Ascension: TON Wallet Gateway)
func getBuyGSTDLink(tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		amountTON := c.DefaultQuery("amount_ton", "1")
		wallet := c.Query("wallet_address")
		appURL := os.Getenv("APP_PUBLIC_URL")
		if appURL == "" {
			appURL = "https://app.gstdtoken.com"
		}
		// Ston.fi swap: TON → GSTD. ta = amount in TON
		stonFiURL := fmt.Sprintf("https://app.ston.fi/swap?ft=TON&tt=GSTD&ta=%s", amountTON)
		resp := gin.H{
			"buy_url":     stonFiURL,
			"amount_ton":  amountTON,
			"app_url":     appURL + "/dashboard?tab=market&action=buy",
			"instruction": "Open buy_url in TON wallet or browser to swap TON for GSTD",
		}
		if wallet != "" {
			resp["wallet_address"] = wallet
		}
		c.JSON(200, resp)
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

// === VIRAL ECONOMY: OFF-CHAIN LEDGER ===

// getPendingBalance returns the off-chain accumulating balance (Gasless Mining)
func getPendingBalance(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddress, _ := c.Get("wallet_address")
		var balance float64
		var referralCode sql.NullString

		err := db.QueryRowContext(c.Request.Context(),
			"SELECT COALESCE(pending_balance_gstd, 0), referral_code FROM users WHERE wallet_address = $1",
			walletAddress).Scan(&balance, &referralCode)

		if err != nil {
			// If user not found, return 0 (new user)
			c.JSON(200, gin.H{"pending_balance": 0.0, "referral_code": ""})
			return
		}

		c.JSON(200, gin.H{
			"pending_balance": balance,
			"referral_code":   referralCode.String,
			"min_withdrawal":  0.1,
			"message":         "Earn 0.1 GSTD to claim to your TON wallet.",
		})
	}
}

// claimPendingBalance initiates a withdrawal from Off-Chain to On-Chain
// The Platform pays the gas.
func claimPendingBalance(db *sql.DB, paymentService *services.PaymentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddress, _ := c.Get("wallet_address")

		// 1. Check Balance (balance + gstd_balance + pending_balance_gstd)
		var bal, gstdBal, pendingBal float64
		err := db.QueryRowContext(c.Request.Context(),
			"SELECT COALESCE(balance, 0), COALESCE(gstd_balance, 0), COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1 FOR UPDATE",
			walletAddress).Scan(&bal, &gstdBal, &pendingBal)
		balance := bal + gstdBal + pendingBal
		if err != nil || balance < 0.1 {
			c.JSON(400, gin.H{"error": "Insufficient balance. Min 0.1 GSTD required."})
			return
		}

		// 2. Reduce Balance (deduct from balance, gstd_balance, pending in order)
		deduct := balance
		fromBal := deduct
		if bal < deduct {
			fromBal = bal
		}
		remain := deduct - fromBal
		fromGstd := remain
		if gstdBal < remain {
			fromGstd = gstdBal
		}
		fromPending := remain - fromGstd
		if fromBal > 0 {
			_, err = db.ExecContext(c.Request.Context(),
				"UPDATE users SET balance = COALESCE(balance, 0) - $1 WHERE wallet_address = $2",
				fromBal, walletAddress)
		}
		if err == nil && fromGstd > 0 {
			_, err = db.ExecContext(c.Request.Context(),
				"UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) - $1 WHERE wallet_address = $2",
				fromGstd, walletAddress)
		}
		if err == nil && fromPending > 0 {
			_, err = db.ExecContext(c.Request.Context(),
				"UPDATE users SET pending_balance_gstd = GREATEST(0, COALESCE(pending_balance_gstd, 0) - $1) WHERE wallet_address = $2",
				fromPending, walletAddress)
		}

		if err != nil {
			c.JSON(500, gin.H{"error": "Database update failed"})
			return
		}

		// 3. Initiate On-Chain Payout (Async via RewardEngine logic)
		// For now, we just create a payout intent which the admin/cron will pick up
		// In a real automated system, this would call paymentService.SendPayment immediately or queue it

		// Log the withdrawal request
		_, err = db.ExecContext(c.Request.Context(), `
			INSERT INTO withdrawals (wallet_address, amount_gstd, status, created_at)
			VALUES ($1, $2, 'pending', NOW())
		`, walletAddress, balance)

		c.JSON(200, gin.H{
			"status":         "processing",
			"amount_claimed": balance,
			"message":        "Withdrawal initiated. Funds will arrive in your wallet shortly.",
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
			"gstd_balance":           breakdown.GSTDBalance,
			"efficiency":             breakdown.Efficiency,
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
					// Cache errors for 60s to avoid log spam
					if rClient != nil {
						rClient.Set(ctx, cacheKey, float64(0), 60*time.Second)
					}
					// Don't spam logs with rate limit or recurring API errors
					if !strings.Contains(err.Error(), "429") && !strings.Contains(err.Error(), "base32") && !strings.Contains(err.Error(), "401") {
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
				"address":     tonConfig.ContractAddress,
				"status":      contractStatus,
				"balance_ton": contractBalance,
			},
			"sovereign_ai": gin.H{
				"status":         "groq",
				"ollama_enabled": false, // Ollama container not deployed; inference via Groq Cloud
				"inference":      "Groq Cloud (8 models)",
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
				"pool_address":    "",
				"gstd_balance":    0,
				"xaut_balance":    0,
				"total_value_usd": 0,
				"last_updated":    time.Now(),
				"is_healthy":      false,
				"reserve_ratio":   0,
				"error":           "Failed to fetch pool status",
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
			"admin_wallet":     adminWallet,
			"total_commission": balance.TotalCommission,
			"amount_nano":      amountNano,
			"pending_tasks":    balance.PendingTasks,
			"claimed_tasks":    balance.ClaimedTasks,
			"message":          "Commission is automatically sent to admin wallet by escrow contract. Check your wallet balance.",
		})
	}
}

// prepareLiquidityProvision generates Ston.fi provide_liquidity payload for Dynamic Gold Backing
func prepareLiquidityProvision(escrow *services.EscrowService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			AmountGSTD float64 `json:"amount_gstd"`
			AmountXAUt float64 `json:"amount_xaut"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request: amount_gstd and amount_xaut required"})
			return
		}
		if req.AmountGSTD <= 0 && req.AmountXAUt <= 0 {
			c.JSON(400, gin.H{"error": "at least one of amount_gstd or amount_xaut must be positive"})
			return
		}
		// Ultra-Deep: Min Out - reject below Ston.fi min threshold (insufficient liquidity)
		minGSTD, minXAUt := 0.1, 0.0001
		if req.AmountGSTD > 0 && req.AmountGSTD < minGSTD {
			c.JSON(400, gin.H{"error": "amount_gstd below minimum (0.1 GSTD)"})
			return
		}
		if req.AmountXAUt > 0 && req.AmountXAUt < minXAUt {
			c.JSON(400, gin.H{"error": "amount_xaut below minimum (0.0001 XAUt)"})
			return
		}
		result, err := escrow.PrepareWithdraw(c.Request.Context(), req.AmountGSTD, req.AmountXAUt)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, result)
	}
}
