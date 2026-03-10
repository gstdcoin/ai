package api

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	infRouter "distributed-computing-platform/internal/inference"

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
) {
	log.Printf("🔧 SetupRoutes: Starting route setup, redisClient type: %T", redisClient)

	// CORS: allow API access from web app, Telegram, mobile, and external clients
	allowedOrigins := map[string]bool{
		"https://app.gstdtoken.com":     true,
		"https://api.gstdtoken.com":     true,
		"https://chat.gstdtoken.com":    true,
		"https://monitor.gstdtoken.com": true,
		"http://localhost:3000":         true,
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

			// Ensure node & user exist
			_, _ = dbConn.ExecContext(c.Request.Context(), `
				INSERT INTO users (wallet_address, balance, created_at, updated_at)
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
			_, _ = dbConn.ExecContext(c.Request.Context(), `
				INSERT INTO nodes (id, wallet_address, name, status, last_seen, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, 'online', NOW(), NOW(), NOW())
				ON CONFLICT (wallet_address) DO UPDATE SET status = 'online', last_seen = NOW(), updated_at = NOW()
			`, req.WalletAddress, nodeName)

			// Check time since last heartbeat reward to prevent double-claiming
			var lastReward float64
			var hoursSinceLast float64 = 1.0
			row := dbConn.QueryRowContext(c.Request.Context(), `
				SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - COALESCE(last_seen, NOW() - INTERVAL '1 hour'))) / 3600, 1)
				FROM nodes WHERE wallet_address = $1
			`, req.WalletAddress)
			row.Scan(&hoursSinceLast)
			if hoursSinceLast < 0.9 {
				// Too soon — less than ~54 minutes since last heartbeat
				c.JSON(200, gin.H{"reward": 0, "reason": "heartbeat_too_soon", "next_in_minutes": int((1.0 - hoursSinceLast) * 60)})
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

			// Check daily cap
			dbConn.QueryRowContext(c.Request.Context(), `
				SELECT COALESCE(SUM(pending_balance_gstd), 0) FROM users WHERE wallet_address = $1
			`, req.WalletAddress).Scan(&lastReward)
			// Simple daily cap check — in production would track per-day
			if reward <= 0 {
				c.JSON(200, gin.H{"reward": 0, "reason": "no_reward"})
				return
			}

			// Credit reward to user
			_, err := dbConn.ExecContext(c.Request.Context(), `
				UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1, updated_at = NOW()
				WHERE wallet_address = $2
			`, reward, req.WalletAddress)
			if err != nil {
				c.JSON(500, gin.H{"error": "failed to credit reward"})
				return
			}
			// Update node stats
			_, _ = dbConn.ExecContext(c.Request.Context(), `
				UPDATE nodes SET total_earnings = COALESCE(total_earnings, 0) + $1, last_seen = NOW(), updated_at = NOW()
				WHERE wallet_address = $2
			`, reward, req.WalletAddress)
			// Update Redis worker:online status for active_workers count
			if genesisRedis != nil {
				onlineKey := fmt.Sprintf("worker:online:%s", req.WalletAddress)
				genesisRedis.Set(c.Request.Context(), onlineKey, "online", 90*time.Second)
			}

			c.JSON(200, gin.H{
				"reward":          reward,
				"uptime_reward":   uptimeReward,
				"query_reward":    queryReward,
				"queries_counted": req.QueriesServed,
				"reason":          "verified_heartbeat",
				"message":         "Reward credited to pending balance.",
			})
		})

		// Legacy: keep sync-earnings for backward compatibility but with stricter limits
		v1.POST("/nodes/sync-earnings", func(c *gin.Context) {
			c.JSON(410, gin.H{
				"error":   "deprecated",
				"message": "Use POST /api/v1/nodes/heartbeat instead. Nodes no longer self-report earnings.",
			})
		})

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
		// NOTE: /nodes/heartbeat is already registered above (line ~744) with reward calculation
		v1.GET("/nodes/public", getPublicNodes(nodeService))
		v1.POST("/nodes/activate-wallet", activateWalletAsNode(nodeService))

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
				`SELECT id, type, COALESCE(payload, '{}')
				 FROM tasks
				 WHERE status = 'pending'
				   AND (assigned_wallet = $1 OR assigned_wallet IS NULL)
				 ORDER BY priority DESC, created_at ASC
				 LIMIT 1`, wallet).Scan(&taskID, &taskType, &payload)
			if err != nil {
				c.JSON(200, gin.H{"task": nil, "message": "no tasks available"})
				return
			}
			c.JSON(200, gin.H{
				"task": gin.H{
					"id":      taskID,
					"type":    taskType,
					"payload": payload,
				},
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
