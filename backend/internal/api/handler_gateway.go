package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// GatewayHandler handles OpenAI-compatible chat completions and API key management.
type GatewayHandler struct {
	apiKeyService    *services.APIKeyService
	taskService      *services.TaskService
	db               *sql.DB
	redis            *redis.Client
	guardrails       *services.GuardrailsService
	omniPerformance  *services.OmniPerformanceService
	knowledgeService *services.KnowledgeService
	settlement       *services.SettlementService
	stats            *services.StatsService
	ollamaURL        string
	client           *http.Client
}

// CompareModeQueueThreshold: Genesis Launch — when compare-mode queue exceeds this, prioritize balance > 500 GSTD
const CompareModeQueueThreshold = 10
const CompareModePriorityBalanceGSTD = 500.0

// StakingDiscountThresholdGSTD: Consumer Adoption — 10% discount when holding > 1000 GSTD
const StakingDiscountThresholdGSTD = 1000.0
const StakingDiscountPct = 0.10

// FirstQueryBonusGSTD: Market Ascension — 0.05 GSTD for new user's first test request
const FirstQueryBonusGSTD = 0.05

// NewGatewayHandler creates a new gateway handler.
func NewGatewayHandler(apiKeyService *services.APIKeyService, taskService *services.TaskService, db *sql.DB) *GatewayHandler {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		// Docker: gstd_ollama; local dev: localhost
		ollamaURL = "http://localhost:11434"
	}
	// 90s timeout for LLM generation (Qwen can take time)
	ollamaClient := &http.Client{Timeout: 90 * time.Second}
	return &GatewayHandler{
		apiKeyService: apiKeyService,
		taskService:   taskService,
		db:            db,
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

// chatCostGSTD returns base cost per model (Consumer Adoption).
func chatCostGSTD(model string) float64 {
	m := strings.ToLower(model)
	if strings.Contains(m, "70b") || strings.Contains(m, "deepseek-r1") {
		return services.UltraSessionCostGSTD // 1.0
	}
	if strings.Contains(m, "32b") {
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
		Model            string        `json:"model"`
		Messages         []interface{} `json:"messages"`
		Stream           bool          `json:"stream"`
		ImageGeneration  bool          `json:"image_generation"`
		PaymentMethod    string        `json:"payment_method"` // "gstd" = 20% discount, "stars" = full price
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

	// Consumer Adoption: Unified Payment Gateway — require wallet for all chat
	if wallet == "" {
		c.JSON(402, gin.H{
			"error":   "wallet_required",
			"code":    402,
			"message": "Connect wallet to use chat. GSTD is deducted per request.",
		})
		return
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
				"error":           "ultra_gate_required",
				"code":            402,
				"deficit":         access.SessionCost,
				"work_required":   0,
				"message":         access.Message,
				"requires_ultra":  true,
				"staked_gstd":     access.StakedGSTD,
				"balance_gstd":    access.BalanceGSTD,
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

	// Market Ascension: First-Query Bonus — 0.05 GSTD for new user's first request
	useFirstQueryBonus := false
	if h.db != nil && fee <= FirstQueryBonusGSTD {
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

	// Check balance and deduct before inference (skip if First-Query Bonus)
	if !useFirstQueryBonus && h.db != nil {
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
	}

	prompt := ""
	for _, m := range promptMsgs {
		prompt += m["role"] + ": " + m["content"] + "\n"
	}
	prompt += "assistant: "

	ollamaReq := map[string]interface{}{
		"model":  ollamaModel,
		"prompt": prompt,
		"stream": false,
	}
	ollamaBody, _ := json.Marshal(ollamaReq)

	// Priority Compute: GSTD-paid Ultra requests use high-compute nodes (OLLAMA_ULTRA_URL)
	ollamaBase := h.ollamaURL
	if isUltra && os.Getenv("OLLAMA_ULTRA_URL") != "" {
		ollamaBase = os.Getenv("OLLAMA_ULTRA_URL")
	}

	resp, err := h.client.Post(ollamaBase+"/api/generate", "application/json", bytes.NewReader(ollamaBody))
	if err != nil {
		log.Printf("Ollama proxy error: %v", err)
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

	// Consumer Adoption: SettlementService — record payment (skip when First-Query Bonus)
	if h.settlement != nil && wallet != "" && fee > 0 {
		workerAmt := fee * 0.85
		_, _ = h.settlement.ProcessPayment(c.Request.Context(), &services.SettlementRequest{
			AmountGSTD:   fee,
			WorkerWallet: "platform_consumer",
			InferenceID:  "",
			ModelID:      ollamaModel,
		})
		c.Set("gstd_worker_amount", workerAmt)
	}

	// Hive Memory: Store Ultra response for network training
	if isUltra && content != "" && h.knowledgeService != nil {
		_ = h.knowledgeService.StoreKnowledge(c.Request.Context(), "ULTRA", "hive_memory_ultra", content, []string{"ultra", "gstd_powered"}, nil)
	}

	// Ascension: 20% discount when payment_method=gstd (image gen or Ultra)
	gstdDiscount := req.PaymentMethod == "gstd"

	// Public Proof-of-Work: swarm stats for frontend
	activeDevices := 0
	if h.stats != nil {
		if st, err := h.stats.GetGlobalStats(c.Request.Context()); err == nil {
			activeDevices = st.ActiveDevicesCount
		}
	}
	workerAmount := fee * 0.85

	// OpenAI-compatible response; image_generation uses flux, may return base64
	out := gin.H{
		"id":      "chatcmpl-gstd",
		"object":  "chat.completion",
		"model":   req.Model,
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
	}
	if isImageGen {
		out["image_generation"] = true
		out["gstd_discount_20"] = gstdDiscount
	}
	// Public Proof-of-Work: swarm stats for UI
	out["gstd_pow"] = gin.H{
		"swarm_devices":   activeDevices,
		"workers_gstd":    workerAmount,
		"fee_deducted":    fee,
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
		"llama3.1:8b":      0.01,
		"qwen2.5-coder:32b": 0.05,
		"llama3.3:70b":      sessionCost,
		"deepseek-r1":      sessionCost,
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

// ListModels returns available models for the gateway.
func (h *GatewayHandler) ListModels(c *gin.Context) {
	// Query Ollama for models
	resp, err := h.client.Get(h.ollamaURL + "/api/tags")
	models := []gin.H{
		{"id": "gpt-3.5-turbo", "object": "model"},
		{"id": "gpt-4", "object": "model"},
		{"id": "qwen2.5-coder:7b", "object": "model"},
		{"id": "llama3.1:8b", "object": "model"},
	}
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var data struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Models {
				models = append(models, gin.H{"id": m.Name, "object": "model"})
			}
		}
	}
	c.JSON(200, gin.H{"object": "list", "data": models})
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
