package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	infRouter "distributed-computing-platform/internal/inference"
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// GatewayHandler handles OpenAI-compatible chat completions and API key management.
type GatewayHandler struct {
	apiKeyService     *services.APIKeyService
	taskService       *services.TaskService
	db                *sql.DB
	redis             *redis.Client
	guardrails        *services.GuardrailsService
	omniPerformance   *services.OmniPerformanceService
	knowledgeService  *services.KnowledgeService
	settlement        *services.SettlementService
	stats             *services.StatsService
	router            *infRouter.Router
	recyclingPool     *services.RecyclingPoolService
	cocoonBridge      *services.CocoonBridgeService      // Cocoon Confidential Compute
	cocoonSymbiosis   *services.CocoonSwarmSymbiosis     // Cocoon→Hive Memory
	hybridRouter      *services.HybridIntelligenceRouter // Swarm ↔ Cocoon ↔ Ollama tier routing
	smartRouter       *services.SmartRouter              // Omega Sovereign-First routing
	onchainSettlement *services.OnchainSettlementService // Real on-chain GSTD Jetton settlement
	burnService       *services.BurnService              // Token burn on every paid inference
	ollamaURL         string
	client            *http.Client
}

// CompareModeQueueThreshold: Genesis Launch — when compare-mode queue exceeds this, prioritize balance > 500 GSTD
const CompareModeQueueThreshold = 10
const CompareModePriorityBalanceGSTD = 500.0

// StakingDiscountThresholdGSTD: Consumer Adoption — 10% discount when holding > 1000 GSTD
const StakingDiscountThresholdGSTD = 1000.0
const StakingDiscountPct = 0.10

// FirstQueryBonusGSTD: Market Ascension — 0.05 GSTD for new user's first test request
const FirstQueryBonusGSTD = 0.05

// FreeBasicTierDaily: Supercomputer for Humanity — 5 free requests/day for users with balance < 0.01 (7b/8b only)
const FreeBasicTierDaily = 5

// NewGatewayHandler creates a new gateway handler.
func NewGatewayHandler(apiKeyService *services.APIKeyService, taskService *services.TaskService, db *sql.DB, router *infRouter.Router) *GatewayHandler {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	ollamaClient := &http.Client{Timeout: 90 * time.Second}
	return &GatewayHandler{
		apiKeyService: apiKeyService,
		taskService:   taskService,
		db:            db,
		router:        router,
		ollamaURL:     ollamaURL,
		client:        ollamaClient,
	}
}

// SetGuardrails wires the guardrails service for prompt filtering.
func (h *GatewayHandler) SetGuardrails(g *services.GuardrailsService) {
	h.guardrails = g
}

// SetOmniPerformance wires the Omni-Performance service for Ultra-Inference gate.
func (h *GatewayHandler) SetOmniPerformance(o *services.OmniPerformanceService) {
	h.omniPerformance = o
}

// SetKnowledgeService wires the knowledge service for Hive Memory expansion.
func (h *GatewayHandler) SetKnowledgeService(k *services.KnowledgeService) {
	h.knowledgeService = k
}

// SetSettlement wires SettlementService for Consumer Adoption payment gateway.
func (h *GatewayHandler) SetSettlement(s *services.SettlementService) {
	h.settlement = s
}

// SetStats wires StatsService for Public Proof-of-Work swarm stats.
func (h *GatewayHandler) SetStats(s *services.StatsService) {
	h.stats = s
}

// SetRedis wires Redis for Compare Mode queue monitoring (Genesis Launch).
func (h *GatewayHandler) SetRedis(r *redis.Client) {
	h.redis = r
}

// SetRecyclingPool wires RecyclingPool for closed-loop token economy (93% miners, 7% Golden Reserve).
func (h *GatewayHandler) SetRecyclingPool(rp *services.RecyclingPoolService) {
	h.recyclingPool = rp
}

// SetBurnService wires BurnService for deflationary burn on every paid inference.
func (h *GatewayHandler) SetBurnService(bs *services.BurnService) {
	h.burnService = bs
}

// SetCocoonBridge wires CocoonBridgeService for confidential compute via Cocoon TEE network.
func (h *GatewayHandler) SetCocoonBridge(cb *services.CocoonBridgeService) {
	h.cocoonBridge = cb
}

// SetCocoonSymbiosis wires Cocoon-Swarm symbiosis for knowledge absorption.
func (h *GatewayHandler) SetCocoonSymbiosis(cs *services.CocoonSwarmSymbiosis) {
	h.cocoonSymbiosis = cs
}

// SetHybridRouter wires the Hybrid Intelligence Router for 3-tier task routing.
func (h *GatewayHandler) SetHybridRouter(hr *services.HybridIntelligenceRouter) {
	h.hybridRouter = hr
}

// SetSmartRouter wires the Omega SmartRouter for sovereignty metrics.
func (h *GatewayHandler) SetSmartRouter(sr *services.SmartRouter) {
	h.smartRouter = sr
}

// SetOnchainSettlement wires the on-chain GSTD settlement service.
func (h *GatewayHandler) SetOnchainSettlement(os *services.OnchainSettlementService) {
	h.onchainSettlement = os
}

// analyzeIntelligenceNeedOllama picks best Ollama model based on task complexity (omega-auto).
// Inspired by Devin's planning mode: analyze the task before choosing compute level.
func analyzeIntelligenceNeedOllama(msgs []map[string]string) string {
	var text string
	for _, m := range msgs {
		text += strings.ToLower(m["content"]) + " "
	}

	// Deep reasoning indicators → use strongest model
	deepReasoningPatterns := []string{
		"explain why", "compare and contrast", "analyze", "evaluate",
		"prove", "derive", "theorem", "hypothesis", "implications",
		"trade-offs", "tradeoffs", "pros and cons", "architecture",
		"design pattern", "system design", "scalability",
	}
	for _, pattern := range deepReasoningPatterns {
		if strings.Contains(text, pattern) {
			return "qwen2.5-coder:32b"
		}
	}

	// Code tasks → use code-optimized model
	if strings.Contains(text, "func") || strings.Contains(text, "code") ||
		strings.Contains(text, "script") || strings.Contains(text, "debug") ||
		strings.Contains(text, "implement") || strings.Contains(text, "refactor") {
		return "qwen2.5-coder:7b"
	}

	// Math/logic → use strongest model
	if strings.Contains(text, "math") || strings.Contains(text, "think") ||
		strings.Contains(text, "reason") || strings.Contains(text, "calculate") ||
		strings.Contains(text, "equation") || strings.Contains(text, "probability") {
		return "qwen2.5-coder:32b"
	}

	// Multi-step or complex questions → use stronger model
	if strings.Contains(text, "step by step") || strings.Contains(text, "in detail") ||
		strings.Contains(text, "comprehensive") || strings.Contains(text, "thorough") ||
		len(text) > 500 { // Long queries usually need more intelligence
		return "qwen2.5-coder:32b"
	}

	return "llama3.1:8b"
}

// chatCostGSTD returns base cost per model (Consumer Adoption).
func chatCostGSTD(model string) float64 {
	// Cocoon models use their own pricing
	if services.IsCocoonModel(model) {
		return services.CocoonCostGSTD(model)
	}
	m := strings.ToLower(model)
	if strings.Contains(m, "70b") || strings.Contains(m, "deepseek-r1") {
		return services.UltraSessionCostGSTD // 1.0
	}
	if strings.Contains(m, "32b") {
		return 0.05
	}
	if strings.Contains(m, "mix-ultra") {
		return 0.50
	}
	if strings.Contains(m, "mix-pro") {
		return 0.15
	}
	if strings.Contains(m, "mix-standard") {
		return 0.05
	}
	return 0.01 // 7b, 8b, default
}

// HandleChatCompletions handles OpenAI-compatible chat completions and proxies to Ollama.
func (h *GatewayHandler) HandleChatCompletions(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid_request"})
		return
	}

	var req struct {
		Model           string        `json:"model"`
		Messages        []interface{} `json:"messages"`
		Stream          bool          `json:"stream"`
		ImageGeneration bool          `json:"image_generation"`
		PaymentMethod   string        `json:"payment_method"` // "gstd" = 20% discount, "stars" = full price
		AgentID         string        `json:"agent_id"`       // Router: Forward prompt to specific Agent and pay its creator
	}
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_json"})
		return
	}
	if req.Model == "" {
		req.Model = "gpt-3.5-turbo"
	}
	if len(req.Messages) == 0 {
		c.JSON(400, gin.H{"error": "messages required"})
		return
	}

	// Extract messages for guardrails
	var promptMsgs []map[string]string
	for _, m := range req.Messages {
		if mm, ok := m.(map[string]interface{}); ok {
			role, _ := mm["role"].(string)
			content, _ := mm["content"].(string)
			promptMsgs = append(promptMsgs, map[string]string{"role": role, "content": content})
		}
	}

	wallet := c.GetString("wallet_address")
	if wallet == "" {
		wallet = c.GetHeader("X-GSTD-Target-Wallet")
	}

	// Bot pre-paid: AIChat already deducted, skip gateway deduction
	isPrepaid := c.Request.Header.Get("X-GSTD-Prepaid") == "true"

	// Open WebUI internal access: allow full model access without wallet
	openwebuiKey := os.Getenv("OPENWEBUI_INTERNAL_KEY")
	if openwebuiKey == "" {
		openwebuiKey = "gstd_sovereign_key"
	}
	authHeader := c.GetHeader("Authorization")
	isOpenWebUI := strings.TrimPrefix(authHeader, "Bearer ") == openwebuiKey

	// Consumer Adoption: Allow anonymous free-tier (basic models only)
	// Wallet required for paid models (Pro, Ultra)
	anonymousFree := false
	if isPrepaid {
		anonymousFree = true // skip deduction, already paid by bot handler
	} else if isOpenWebUI {
		// Open WebUI has internal access — allow all models without wallet
		anonymousFree = true
		if wallet == "" {
			wallet = "openwebui-" + c.ClientIP()
		}
	} else if wallet == "" {
		// Allow free tier without wallet for chat.gstdtoken.com onboarding
		modelLower := strings.ToLower(req.Model)
		isFreeModel := modelLower == "" || modelLower == "auto" || modelLower == "gstd-flash" || modelLower == "omega-auto" || modelLower == "cocoon-auto" || modelLower == "mix-free" || modelLower == "mix-standard"
		if !isFreeModel {
			c.JSON(402, gin.H{
				"error":   "wallet_required",
				"code":    402,
				"message": "Connect wallet to use Pro/Ultra models. Free models: Auto, Flash.",
			})
			return
		}
		wallet = "anon-" + c.ClientIP()
		anonymousFree = true
	}

	// Genesis Launch: Compare Mode queue — prioritize balance > 500 GSTD when backlog
	isCompareMode := c.GetHeader("X-GSTD-Compare-Mode") == "1" || c.GetHeader("X-GSTD-Compare-Mode") == "true"
	if isCompareMode && h.redis != nil {
		ctx := c.Request.Context()
		key := "leviathan:compare_mode_active"
		h.redis.Incr(ctx, key)
		h.redis.Expire(ctx, key, 5*time.Minute) // prevent zombie counts if handler crashes
		defer func() { h.redis.Decr(ctx, key) }()
		count, _ := h.redis.Get(ctx, key).Int64()
		if count > CompareModeQueueThreshold && h.db != nil {
			var gstdBalance, gstdFrozen float64
			_ = h.db.QueryRowContext(ctx, `SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0), COALESCE(gstd_frozen, 0) FROM users WHERE wallet_address = $1`, wallet).Scan(&gstdBalance, &gstdFrozen)
			totalHeld := gstdBalance + gstdFrozen
			if totalHeld < CompareModePriorityBalanceGSTD {
				c.JSON(429, gin.H{
					"error":   "compare_mode_queue_full",
					"code":    429,
					"message": "Compare Mode queue busy. Stake 500+ GSTD for priority access or try again shortly.",
				})
				return
			}
		}
	}

	// Guardrails check
	if h.guardrails != nil {
		result := h.guardrails.AnalyzePrompt(c.Request.Context(), wallet, promptMsgs)
		if !result.Allowed {
			c.JSON(403, gin.H{"error": "blocked", "reason": result.Violations})
			return
		}
	}

	// Map to Ollama format; image_generation uses flux
	ollamaModel := "qwen2.5-coder:7b"
	isImageGen := req.ImageGeneration || strings.Contains(strings.ToLower(req.Model), "flux")
	if isImageGen {
		ollamaModel = "flux:latest"
		if req.Model != "" && !strings.HasPrefix(req.Model, "gpt") {
			ollamaModel = req.Model
		}
	} else if req.Model == "omega-auto" || req.Model == "auto" || req.Model == "" {
		// Auto model: pick best based on content (like Telegram)
		ollamaModel = analyzeIntelligenceNeedOllama(promptMsgs)
	} else if req.Model == "omega-pro" {
		// Pro tier: best available model
		ollamaModel = "qwen2.5-coder:32b"
	} else if strings.HasPrefix(req.Model, "gpt") || strings.HasPrefix(req.Model, "gpt-") {
		ollamaModel = "qwen2.5-coder:7b"
	} else if req.Model != "" {
		ollamaModel = req.Model
	}

	// Consumer Adoption: calculate fee with Staking-for-Access (10% off when > 1000 GSTD)
	baseCost := chatCostGSTD(ollamaModel)
	isUltra := services.IsUltraModel(ollamaModel)
	if isUltra && h.omniPerformance != nil {
		access, err := h.omniPerformance.CheckUltraAccess(c.Request.Context(), wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "ultra_gate_check_failed", "message": err.Error()})
			return
		}
		if !access.Allowed {
			c.JSON(402, gin.H{
				"error":          "ultra_gate_required",
				"code":           402,
				"deficit":        access.SessionCost,
				"work_required":  0,
				"message":        access.Message,
				"requires_ultra": true,
				"staked_gstd":    access.StakedGSTD,
				"balance_gstd":   access.BalanceGSTD,
			})
			return
		}
		baseCost = access.SessionCost
	}

	// Staking-for-Access: 10% discount when holding > 1000 GSTD
	fee := baseCost
	if h.db != nil {
		var gstdBalance, gstdFrozen float64
		_ = h.db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0), COALESCE(gstd_frozen, 0)
			FROM users WHERE wallet_address = $1
		`, wallet).Scan(&gstdBalance, &gstdFrozen)
		totalHeld := gstdBalance + gstdFrozen
		if totalHeld >= StakingDiscountThresholdGSTD {
			fee = baseCost * (1 - StakingDiscountPct)
		}
	}

	// Supercomputer for Humanity: Free basic tier — 5 requests/day when balance < 0.01 (7b/8b only)
	useFreeTier := false
	if h.redis != nil && h.db != nil && !isUltra && (ollamaModel == "qwen2.5-coder:7b" || ollamaModel == "llama3.1:8b") {
		today := time.Now().Format("2006-01-02")
		key := "free_chat:" + wallet + ":" + today
		count, _ := h.redis.Incr(c.Request.Context(), key).Result()
		if count == 1 {
			h.redis.Expire(c.Request.Context(), key, 48*time.Hour)
		}
		if count <= FreeBasicTierDaily {
			var balance float64
			_ = h.db.QueryRowContext(c.Request.Context(), `SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1`, wallet).Scan(&balance)
			if balance < 0.01 {
				useFreeTier = true
				fee = 0
			}
		}
	}

	// Market Ascension: First-Query Bonus — 0.05 GSTD for new user's first request
	useFirstQueryBonus := false
	if !useFreeTier && h.db != nil && fee <= FirstQueryBonusGSTD {
		// Ensure user exists (new users from chat)
		_, _ = h.db.ExecContext(c.Request.Context(), `INSERT INTO users (wallet_address, balance, created_at, updated_at) VALUES ($1, 0, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, wallet)
		var bonusUsed bool
		err := h.db.QueryRowContext(c.Request.Context(), `SELECT COALESCE(first_query_bonus_used, false) FROM users WHERE wallet_address = $1`, wallet).Scan(&bonusUsed)
		if err == nil && !bonusUsed {
			res, errUpd := h.db.ExecContext(c.Request.Context(), `UPDATE users SET first_query_bonus_used = true WHERE wallet_address = $1 AND COALESCE(first_query_bonus_used, false) = false`, wallet)
			if errUpd == nil {
				if rows, _ := res.RowsAffected(); rows > 0 {
					useFirstQueryBonus = true
					fee = 0
					log.Printf("[Market Ascension] First-Query Bonus: %.2f GSTD granted to %s (first test request)", FirstQueryBonusGSTD, wallet[:min(12, len(wallet))])
				}
			}
		}
	}

	// ═══ AGENT MARKETPLACE / RENTALS ═══
	var agentOwner string
	var agentPrice float64
	if req.AgentID != "" && h.db != nil {
		err := h.db.QueryRowContext(c.Request.Context(), `
			SELECT owner_wallet, price_gstd 
			FROM agent_registry 
			WHERE id = $1 AND is_active = true
		`, req.AgentID).Scan(&agentOwner, &agentPrice)
		if err == nil {
			fee += agentPrice // Add Agent's own fee on top of compute node inference fee
			log.Printf("🤖 [Agent Marketplace] Routing to %s. Rent Fee: %.4f GSTD", req.AgentID, agentPrice)
			// If hiring a paid agent, we cancel free tiers since human must be paid
			useFreeTier = false
			anonymousFree = false
		} else {
			c.JSON(404, gin.H{"error": "agent_not_found", "message": "Agent not found or inactive"})
			return
		}
	}

	if anonymousFree {
		fee = 0
	}

	// Check balance and deduct before inference (skip if Free Tier, First-Query, or Anonymous Free)
	if !useFreeTier && !useFirstQueryBonus && !anonymousFree && h.db != nil {
		var balance float64
		err := h.db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1
		`, wallet).Scan(&balance)
		if err != nil || balance < fee {
			c.JSON(402, gin.H{
				"error":        "insufficient_balance",
				"code":         402,
				"deficit":      fee,
				"balance_gstd": balance,
				"message":      "Insufficient GSTD. Top up or run Worker to earn.",
			})
			return
		}
		// Deduct from gstd_balance first, then balance
		res, err := h.db.ExecContext(c.Request.Context(), `
			UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) - $1
			WHERE wallet_address = $2 AND COALESCE(gstd_balance, 0) >= $1
		`, fee, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "deduction_failed", "message": err.Error()})
			return
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			res, err = h.db.ExecContext(c.Request.Context(), `
				UPDATE users SET balance = COALESCE(balance, 0) - $1
				WHERE wallet_address = $2 AND COALESCE(balance, 0) >= $1
			`, fee, wallet)
			if err != nil {
				c.JSON(500, gin.H{"error": "deduction_failed", "message": err.Error()})
				return
			}
			if rows, _ := res.RowsAffected(); rows == 0 {
				c.JSON(402, gin.H{"error": "insufficient_balance", "deficit": fee, "message": "Balance changed. Retry."})
				return
			}
		}
		log.Printf("[Consumer Adoption] %.4f GSTD deducted from %s for %s", fee, wallet[:min(12, len(wallet))], ollamaModel)

		// ═══ FEE SPLIT: 50% Golden Reserve (staking rewards), 5% Burn, 45% Platform ═══
		go func() {
			bgCtx := context.Background()
			reserveFee := fee * 0.50 // 50% → Golden Reserve (funds staking APY)
			burnFee := fee * 0.05    // 5% → Permanent token burn
			// remaining 45% stays as platform revenue (already deducted from user)

			// 1. Golden Reserve deposit (source for staking rewards)
			if h.db != nil && reserveFee > 0 {
				_, err := h.db.ExecContext(bgCtx, `
					INSERT INTO golden_reserve_log (task_id, gstd_amount, treasury_wallet, timestamp)
					VALUES ($1, $2, 'STAKING_POOL', NOW())`,
					"chat-fee-"+wallet[:min(8, len(wallet))], reserveFee)
				if err != nil {
					log.Printf("⚠️  Golden Reserve deposit failed: %v", err)
				}
			}

			// 2. Token burn (permanent deflationary pressure)
			if h.burnService != nil && burnFee > 0 {
				h.burnService.RecordBurn(bgCtx, &services.BurnRecord{
					TransactionID:   "chat-" + wallet[:min(8, len(wallet))] + "-" + time.Now().Format("150405"),
					TransactionType: "chat_inference",
					OriginalAmount:  fee,
					BurnAmount:      burnFee,
					SourceWallet:    wallet,
				})
			}

			// 3. Agent Marketplace Payout (if an agent was hired by passing agent_id)
			if agentOwner != "" && agentPrice > 0 {
				netAgentEarn := agentPrice * 0.80 // 80% to agent creator, 20% to Swarm Platform
				tx, _ := h.db.BeginTx(bgCtx, nil)
				if tx != nil {
					_, _ = tx.ExecContext(bgCtx, `
						UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1
						WHERE wallet_address = $2
					`, netAgentEarn, agentOwner)

					_, _ = tx.ExecContext(bgCtx, `
						UPDATE agent_registry 
						SET total_earnings = COALESCE(total_earnings, 0) + $1,
							total_rentals = COALESCE(total_rentals, 0) + 1
						WHERE id = $2
					`, netAgentEarn, req.AgentID)
					tx.Commit()

					// Also log to agent_rentals
					h.db.ExecContext(bgCtx, `
						INSERT INTO agent_rentals (agent_id, renter_wallet, status, pricing_model, price_per_unit, estimated_cost)
						VALUES ($1, $2, 'completed', 'per_task', $3, $3)
					`, req.AgentID, wallet, agentPrice)

					log.Printf("💸 [Agent Marketplace] %.4f GSTD paid to creator %s for running agent: %s", netAgentEarn, agentOwner[:min(8, len(agentOwner))], req.AgentID)
				}
			}
		}()

		// On-chain settlement: queue real Jetton transfer asynchronously
		if h.onchainSettlement != nil && h.onchainSettlement.IsEnabled() {
			go h.onchainSettlement.QueueSettlement(context.Background(), wallet, fee, ollamaModel, "inference")
		}
	}

	// ═══ TRACK AI USAGE ═══
	// Increment ai_requests_count for analytics (always, even for free tier)
	if h.db != nil && wallet != "" && !strings.HasPrefix(wallet, "anon-") {
		go func() {
			today := time.Now().Format("2006-01-02")
			h.db.ExecContext(context.Background(), `
				UPDATE users SET 
					ai_requests_count = COALESCE(ai_requests_count, 0) + 1,
					ai_daily_count = CASE 
						WHEN last_ai_request_date = $2::date THEN COALESCE(ai_daily_count, 0) + 1
						ELSE 1 END,
					last_ai_request_date = $2::date,
					updated_at = NOW()
				WHERE wallet_address = $1
			`, wallet, today)
		}()
	}

	prompt := ""
	lastUserMsg := ""
	for _, m := range promptMsgs {
		prompt += m["role"] + ": " + m["content"] + "\n"
		if m["role"] == "user" {
			lastUserMsg = m["content"]
		}
	}

	// For paid queries (fee > 0), do "confirmation of data from the internet"
	// This implements the requested "internet confirmation for GSTD paid requests" scheme
	if fee > 0 && h.smartRouter != nil && h.smartRouter.WebSearch != nil && lastUserMsg != "" && services.NeedsSearch(lastUserMsg) {
		searchCtx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		if webCtx, err := h.smartRouter.WebSearch.Search(searchCtx, lastUserMsg); err == nil && webCtx.HasResults {
			log.Printf("🌐 [Gateway] Real-time Internet Data confirmed and injected (Paid GSTD Feature)")

			systemMsg := map[string]string{
				"role":    "system",
				"content": "You are GSTD Sovereign AI — a decentralized intelligence engine running on 80+ nodes. APPROACH: 1) THINK FIRST — analyze what the user ACTUALLY needs. 2) Use the verified internet data below as primary evidence. 3) Cross-reference with your knowledge. 4) Provide structured, precise answer with markdown. 5) VERIFY before responding — check accuracy and completeness. Here is verified internet data: " + webCtx.ContextText,
			}
			promptMsgs = append([]map[string]string{systemMsg}, promptMsgs...)

			prompt = "[VERIFIED INTERNET DATA]:\n" + webCtx.ContextText + "\n" + prompt
		}
		cancel()
	}
	prompt += "assistant: "

	// Public Proof-of-Work: swarm stats for frontend
	activeDevices := 0
	if h.stats != nil {
		if st, err := h.stats.GetGlobalStats(c.Request.Context()); err == nil {
			activeDevices = st.ActiveDevicesCount
		}
	}

	// Neural Router: Experience Vault check (semantic cache)
	if (req.Model == "omega-auto" || req.Model == "auto") && h.knowledgeService != nil && lastUserMsg != "" {
		if cached, err := h.knowledgeService.QueryExperienceVault(c.Request.Context(), lastUserMsg); err == nil && cached != nil {
			log.Printf("🧠 [Neural Router] Experience Vault HIT: using cached response for '%s'", truncate(lastUserMsg, 30))
			h.respondWithUsage(c, req.Model, cached.Content, true, activeDevices, fee)
			return
		}
	}

	if strings.HasPrefix(req.Model, "mix-") {
		h.handleSmartMix(c, req.Model, promptMsgs, req.Stream, activeDevices, fee)
		return
	}

	ollamaReq := map[string]interface{}{
		"model":  ollamaModel,
		"prompt": prompt,
		"stream": false,
	}
	ollamaBody, _ := json.Marshal(ollamaReq)

	// Public Swarm: use Router for consensus-based inference if nodes are available
	if h.router != nil && h.router.GetNodeCount() > 0 {
		swarmReq := &infRouter.InferRequest{
			RequestID: "tg-" + time.Now().Format("150405"),
			Model:     ollamaModel,
			Prompt:    prompt,
		}
		// Genesis Launch: 3-node consensus for high quality
		swarmResp, err := h.router.RouteConsensus(c.Request.Context(), swarmReq, 3)
		if err == nil && swarmResp != nil && swarmResp.Content != "" && !strings.Contains(swarmResp.Content, "placeholder") {
			log.Printf("🐝 [Swarm] Inference SUCCESS via consensus (Latency: %dms)", swarmResp.LatencyMs)
			h.respondWithUsage(c, req.Model, swarmResp.Content, false, activeDevices, fee)
			return
		}
		log.Printf("⚠️ [Swarm] Falling back to Cocoon/Ollama: %v", err)
	}

	// ═══ COCOON CONFIDENTIAL COMPUTE ═══
	// Route cocoon-* models through Cocoon TEE network
	if services.IsCocoonModel(req.Model) && h.cocoonBridge != nil && h.cocoonBridge.IsEnabled() {
		var cocoonMsgs []services.CocoonMessage
		for _, m := range promptMsgs {
			cocoonMsgs = append(cocoonMsgs, services.CocoonMessage{
				Role:    m["role"],
				Content: m["content"],
			})
		}
		maxTok := 4096
		if cm := services.GetCocoonModel(req.Model); cm != nil {
			maxTok = cm.MaxTokens
		}
		cocoonResp, err := h.cocoonBridge.Infer(c.Request.Context(), req.Model, cocoonMsgs, maxTok)
		if err == nil && cocoonResp != nil && len(cocoonResp.Choices) > 0 {
			content := cocoonResp.Choices[0].Message.Content
			log.Printf("🛡️ [Cocoon] Response delivered: model=%s tokens=%d tee=%v",
				req.Model, cocoonResp.Usage.TotalTokens, cocoonResp.Attestation != nil)

			// Build OpenAI-compatible response with Cocoon attestation
			workerAmount := fee * 0.85
			out := gin.H{
				"id":      cocoonResp.ID,
				"object":  "chat.completion",
				"model":   req.Model,
				"created": cocoonResp.Created,
				"choices": []gin.H{{
					"index":         0,
					"message":       gin.H{"role": "assistant", "content": content},
					"finish_reason": "stop",
				}},
				"usage": gin.H{
					"prompt_tokens":     cocoonResp.Usage.PromptTokens,
					"completion_tokens": cocoonResp.Usage.CompletionTokens,
					"total_tokens":      cocoonResp.Usage.TotalTokens,
				},
				"gstd_pow": gin.H{
					"swarm_devices": activeDevices,
					"workers_gstd":  workerAmount,
					"fee_deducted":  fee,
				},
			}
			// Add Cocoon TEE attestation to response
			if cocoonResp.Attestation != nil {
				out["cocoon_tee"] = gin.H{
					"confidential":   true,
					"tee_type":       cocoonResp.Attestation.TEEType,
					"verified":       cocoonResp.Attestation.Verified,
					"worker_id":      cocoonResp.Attestation.WorkerID,
					"proxy_id":       cocoonResp.Attestation.ProxyID,
					"image_hash":     cocoonResp.Attestation.ImageHash,
					"attestation_ts": cocoonResp.Attestation.Timestamp,
				}
			}
			c.JSON(200, out)

			// RecyclingPool + Settlement for Cocoon payments
			if wallet != "" && fee > 0 && !useFreeTier && !anonymousFree {
				if h.recyclingPool != nil {
					_, _ = h.recyclingPool.ProcessPayment(c.Request.Context(), wallet, fee, "cocoon-"+req.Model, "inference")
				}
				if h.settlement != nil {
					_, _ = h.settlement.ProcessPayment(c.Request.Context(), &services.SettlementRequest{
						AmountGSTD:   fee,
						WorkerWallet: "cocoon_tee_network",
						ModelID:      req.Model,
					})
				}
			}

			// Cocoon→Swarm Symbiosis: absorb knowledge into Hive Memory
			if h.cocoonSymbiosis != nil && content != "" {
				go h.cocoonSymbiosis.AbsorbCocoonResult(c.Request.Context(), req.Model, prompt, content, cocoonResp.Attestation)
			}
			return
		}
		// Cocoon failed — fall through to Ollama
		log.Printf("⚠️ [Cocoon] Inference failed, falling back to Ollama: %v", err)
	}

	// Priority Compute: GSTD-paid Ultra requests use high-compute nodes (OLLAMA_ULTRA_URL)
	ollamaBase := h.ollamaURL
	if isUltra && os.Getenv("OLLAMA_ULTRA_URL") != "" {
		ollamaBase = os.Getenv("OLLAMA_ULTRA_URL")
	}

	resp, err := h.client.Post(ollamaBase+"/api/generate", "application/json", bytes.NewReader(ollamaBody))
	if err != nil {
		log.Printf("Ollama proxy error: %v — trying Phantom Nodes fallback", err)

		// ═══ PHANTOM NODES FALLBACK ═══
		// When Ollama is unreachable, route through SmartRouter (HuggingFace / Groq)
		if h.smartRouter != nil {
			smartMsgs := make([]map[string]interface{}, len(promptMsgs))
			for i, m := range promptMsgs {
				smartMsgs[i] = map[string]interface{}{"role": m["role"], "content": m["content"]}
			}
			smartReq := &services.OmegaChatRequest{
				Model:    req.Model,
				Messages: smartMsgs,
				Stream:   false,
			}
			decision, srErr := h.smartRouter.Route(c.Request.Context(), smartReq)
			if srErr == nil && decision != nil && decision.Response != "" {
				log.Printf("🌐 [Phantom Fallback] SUCCESS via %s (L%d, %dms)", decision.TierName, decision.Tier, decision.LatencyMs)
				h.respondWithUsage(c, req.Model, decision.Response, false, activeDevices, fee)
				return
			}
			log.Printf("⚠️ [Phantom Fallback] SmartRouter also failed: %v", srErr)
		}

		c.JSON(500, gin.H{"error": "inference_unavailable", "message": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var ollamaResp struct {
		Response string `json:"response"`
	}
	_ = json.Unmarshal(respBody, &ollamaResp)
	content := strings.TrimSpace(ollamaResp.Response)

	// If Ollama returned empty content, try Phantom Nodes
	if content == "" && h.smartRouter != nil {
		log.Printf("⚠️ Ollama returned empty response, trying Phantom Nodes fallback")
		smartMsgs := make([]map[string]interface{}, len(promptMsgs))
		for i, m := range promptMsgs {
			smartMsgs[i] = map[string]interface{}{"role": m["role"], "content": m["content"]}
		}
		smartReq := &services.OmegaChatRequest{
			Model:    req.Model,
			Messages: smartMsgs,
			Stream:   false,
		}
		decision, srErr := h.smartRouter.Route(c.Request.Context(), smartReq)
		if srErr == nil && decision != nil && decision.Response != "" {
			log.Printf("🌐 [Phantom Fallback] SUCCESS via %s (L%d, %dms)", decision.TierName, decision.Tier, decision.LatencyMs)
			content = decision.Response
		}
	}

	// Consumer Adoption: SettlementService + RecyclingPool — record payment (skip when Free Tier or First-Query Bonus)
	if wallet != "" && fee > 0 && !useFreeTier && !anonymousFree {
		// RecyclingPool: 85% → miners, 7% → Golden Reserve, 5% → Value Fund, 3% → Cocoon Fund (Binance TON)
		if h.recyclingPool != nil {
			_, rpErr := h.recyclingPool.ProcessPayment(c.Request.Context(), wallet, fee, "chat-"+ollamaModel, "inference")
			if rpErr != nil {
				log.Printf("[RecyclingPool] Error processing chat fee: %v", rpErr)
			}
		}
		// Settlement: record for auditing
		if h.settlement != nil {
			workerAmt := fee * 0.85
			_, _ = h.settlement.ProcessPayment(c.Request.Context(), &services.SettlementRequest{
				AmountGSTD:   fee,
				WorkerWallet: "platform_consumer",
				InferenceID:  "",
				ModelID:      ollamaModel,
			})
			c.Set("gstd_worker_amount", workerAmt)
		}
	}

	// Value Fund: subsidize free queries — paid queries fund free queries for growth
	if (useFreeTier || anonymousFree || useFirstQueryBonus) && h.recyclingPool != nil {
		computeCost := chatCostGSTD(ollamaModel) // base cost that would have been charged
		h.recyclingPool.SubsidizeFreeQuery(c.Request.Context(), computeCost, ollamaModel)
	}

	// Hive Memory: Store Ultra response for network training
	if isUltra && content != "" && h.knowledgeService != nil {
		_ = h.knowledgeService.StoreKnowledge(c.Request.Context(), "ULTRA", "hive_memory_ultra", content, []string{"ultra", "gstd_powered"}, nil)
	}

	// Ascension: 20% discount logic (can be expanded later)

	h.respondWithUsage(c, req.Model, content, false, activeDevices, fee)
}

// respondWithUsage sends a standardized OpenAI-compatible response with GSTD PoW stats.
func (h *GatewayHandler) respondWithUsage(c *gin.Context, model, content string, cached bool, activeDevices int, fee float64) {
	workerAmount := fee * 0.85
	out := gin.H{
		"id":      "chatcmpl-gstd",
		"object":  "chat.completion",
		"model":   model,
		"created": time.Now().Unix(),
		"choices": []gin.H{
			{
				"index": 0,
				"message": gin.H{
					"role":    "assistant",
					"content": content,
				},
				"finish_reason": "stop",
			},
		},
		"usage": gin.H{
			"prompt_tokens":     0,
			"completion_tokens": 0,
			"total_tokens":      0,
		},
		"cached": cached,
		"gstd_pow": gin.H{
			"swarm_devices": activeDevices,
			"workers_gstd":  workerAmount,
			"fee_deducted":  fee,
		},
	}
	c.JSON(200, out)
}

// GetUltraStatus returns Ultra mode access status and Consumer Adoption cost info.
func (h *GatewayHandler) GetUltraStatus(c *gin.Context) {
	wallet := c.GetString("wallet_address")
	if wallet == "" {
		wallet = c.GetHeader("X-GSTD-Target-Wallet")
	}
	mode := "standard"
	ultraAvailable := false
	stakedGSTD := 0.0
	balanceGSTD := 0.0
	sessionCost := 1.0
	msg := "Connect wallet for chat"
	stakingDiscount := false

	if h.omniPerformance != nil && wallet != "" {
		access, err := h.omniPerformance.CheckUltraAccess(c.Request.Context(), wallet)
		if err == nil {
			mode = access.Mode
			ultraAvailable = access.Allowed
			stakedGSTD = access.StakedGSTD
			balanceGSTD = access.BalanceGSTD
			sessionCost = access.SessionCost
			msg = access.Message
		}
	}
	if h.db != nil && wallet != "" {
		var bal, frozen float64
		_ = h.db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0), COALESCE(gstd_frozen, 0)
			FROM users WHERE wallet_address = $1
		`, wallet).Scan(&bal, &frozen)
		balanceGSTD = bal
		if bal+frozen >= StakingDiscountThresholdGSTD {
			stakingDiscount = true
		}
	}

	// Easy-Onboarding: cost per model for Cost Indicator
	costPerModel := map[string]float64{
		"qwen2.5-coder:7b":  0.01,
		"llama3.1:8b":       0.01,
		"qwen2.5-coder:32b": 0.05,
		"llama3.3:70b":      sessionCost,
		"deepseek-r1":       sessionCost,
		// Cocoon Confidential Compute models
		"cocoon-auto":       0.02,
		"cocoon-qwen3-0.6b": 0.01,
		"cocoon-llama3-70b": 0.15,
	}
	if stakingDiscount {
		for k, v := range costPerModel {
			costPerModel[k] = v * (1 - StakingDiscountPct)
		}
	}

	c.JSON(200, gin.H{
		"mode":             mode,
		"ultra_available":  ultraAvailable,
		"staked_gstd":      stakedGSTD,
		"balance_gstd":     balanceGSTD,
		"session_cost":     sessionCost,
		"message":          msg,
		"staking_discount": stakingDiscount,
		"cost_per_model":   costPerModel,
	})
}

// ListModels returns available models for the gateway (OpenAI-compatible for Open WebUI).
func (h *GatewayHandler) ListModels(c *gin.Context) {
	// All GSTD Sovereign AI models (Groq-powered)
	models := []gin.H{
		{"id": "llama-3.3-70b-versatile", "object": "model", "owned_by": "meta", "created": 1700000000},
		{"id": "meta-llama/llama-4-scout-17b-16e-instruct", "object": "model", "owned_by": "meta", "created": 1710000000},
		{"id": "qwen/qwen3-32b", "object": "model", "owned_by": "alibaba", "created": 1709000000},
		{"id": "openai/gpt-oss-120b", "object": "model", "owned_by": "openai", "created": 1711000000},
		{"id": "openai/gpt-oss-20b", "object": "model", "owned_by": "openai", "created": 1711000000},
		{"id": "moonshotai/kimi-k2-instruct", "object": "model", "owned_by": "moonshot", "created": 1712000000},
		{"id": "llama-3.1-8b-instant", "object": "model", "owned_by": "meta", "created": 1700000000},
	}
	// Also query Ollama for local models
	resp, err := h.client.Get(h.ollamaURL + "/api/tags")
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var data struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Models {
				models = append(models, gin.H{"id": m.Name, "object": "model", "owned_by": "ollama"})
			}
		}
	}
	c.JSON(200, gin.H{"object": "list", "data": models})
}

// GetCocoonStatus returns Cocoon bridge health and stats.
func (h *GatewayHandler) GetCocoonStatus(c *gin.Context) {
	if h.cocoonBridge == nil {
		c.JSON(200, gin.H{"enabled": false, "message": "Cocoon bridge not configured"})
		return
	}
	stats := h.cocoonBridge.GetStats()
	health := h.cocoonBridge.HealthCheck(c.Request.Context())
	models := h.cocoonBridge.GetModels()
	statusNote := ""
	if !h.cocoonBridge.IsEnabled() {
		statusNote = "Cocoon API is in beta — whitelist access required. Contact t.me/cocoon for API key."
	}
	c.JSON(200, gin.H{
		"enabled":     h.cocoonBridge.IsEnabled(),
		"status_note": statusNote,
		"stats":       stats,
		"health":      health,
		"models":      models,
		"protocol":    "Cocoon — Confidential Compute Open Network (Telegram)",
		"docs":        "https://cocoon.org/developers",
		"github":      "https://github.com/TelegramMessenger/cocoon",
	})
}

// GetUserKeys returns API keys for the authenticated user.
func (h *GatewayHandler) GetUserKeys(c *gin.Context) {
	wallet := c.GetString("wallet_address")
	if wallet == "" {
		c.JSON(401, gin.H{"error": "wallet required"})
		return
	}
	keys, err := h.apiKeyService.GetKeys(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"keys": keys})
}

// CreateUserKey creates a new API key for the authenticated user.
func (h *GatewayHandler) CreateUserKey(c *gin.Context) {
	wallet := c.GetString("wallet_address")
	if wallet == "" {
		c.JSON(401, gin.H{"error": "wallet required"})
		return
	}
	var req struct {
		Label string `json:"label"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request"})
		return
	}
	if req.Label == "" {
		req.Label = "default"
	}
	key, err := h.apiKeyService.GenerateKey(c.Request.Context(), wallet, req.Label)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"api_key": key, "label": req.Label})
}

// GetHybridStatus returns hybrid routing stats and Cocoon revenue info.
func (h *GatewayHandler) GetHybridStatus(c *gin.Context) {
	out := gin.H{
		"hybrid_router": "active",
	}

	if h.hybridRouter != nil {
		out["routing"] = h.hybridRouter.GetStats()
		out["revenue"] = h.hybridRouter.GetRevenueStats()
	}

	if h.cocoonBridge != nil {
		out["cocoon"] = gin.H{
			"enabled": h.cocoonBridge.IsEnabled(),
			"stats":   h.cocoonBridge.GetStats(),
		}
	}

	if h.cocoonSymbiosis != nil {
		out["symbiosis"] = h.cocoonSymbiosis.GetStats()
	}

	if h.smartRouter != nil {
		out["sovereignty"] = h.smartRouter.GetSovereigntyMetrics()
	}

	c.JSON(200, out)
}

// GetSovereigntyIndex returns the current sovereignty metrics for the Global Monitor.
func (h *GatewayHandler) GetSovereigntyIndex(c *gin.Context) {
	out := gin.H{"sovereignty_index": 100.0}
	if h.smartRouter != nil {
		out = gin.H(h.smartRouter.GetSovereigntyMetrics())
	}
	c.JSON(200, out)
}
