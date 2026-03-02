package api

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// Platform commission rates — same as RecyclingPool across all GSTD operations
const (
	agentMinerRate     = 0.85 // 85% → agent wallet (net reward)
	agentReserveRate   = 0.07 // 7%  → Gold Reserve (XAUt backing)
	agentValueFundRate = 0.05 // 5%  → Value Fund (free-tier subsidy)
	agentBurnRate      = 0.03 // 3%  → Burn (deflationary pressure)
)

// AgentAPIHandler handles OpenClaw/A2A agent interactions
type AgentAPIHandler struct {
	db            *sql.DB
	clawSvc       *services.OpenClawBridgeService
	recyclingPool *services.RecyclingPoolService
	knowledgeSvc  *services.KnowledgeService
	swarmModels   *services.SwarmModelManager
}

func NewAgentAPIHandler(db *sql.DB, clawSvc *services.OpenClawBridgeService, rp *services.RecyclingPoolService, ks *services.KnowledgeService, smm *services.SwarmModelManager) *AgentAPIHandler {
	h := &AgentAPIHandler{db: db, clawSvc: clawSvc, recyclingPool: rp, knowledgeSvc: ks, swarmModels: smm}
	h.ensureSchema()
	return h
}

func (h *AgentAPIHandler) ensureSchema() {
	if h.db == nil {
		return
	}
	h.db.Exec(`CREATE TABLE IF NOT EXISTS agent_api_keys (
		id SERIAL PRIMARY KEY,
		api_key VARCHAR(128) UNIQUE NOT NULL,
		agent_id VARCHAR(128) NOT NULL,
		wallet_address VARCHAR(128) NOT NULL,
		agent_name VARCHAR(256) DEFAULT '',
		agent_type VARCHAR(64) DEFAULT 'generic',
		rate_limit_rpm INT DEFAULT 60,
		is_active BOOLEAN DEFAULT true,
		total_requests BIGINT DEFAULT 0,
		total_earned_gstd NUMERIC(18,9) DEFAULT 0,
		created_at TIMESTAMP DEFAULT NOW(),
		last_used_at TIMESTAMP DEFAULT NOW()
	)`)
	h.db.Exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_key ON agent_api_keys(api_key)`)
	h.db.Exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_wallet ON agent_api_keys(wallet_address)`)
}

func generateAPIKey() string {
	b := make([]byte, 32)
	rand.Read(b)
	return "gstd_agent_" + hex.EncodeToString(b)
}

// RegisterAgent creates a new API key for an agent
// POST /api/v1/agents/register
func (h *AgentAPIHandler) RegisterAgent(c *gin.Context) {
	var req struct {
		WalletAddress string   `json:"wallet_address" binding:"required"`
		AgentName     string   `json:"agent_name"`
		AgentType     string   `json:"agent_type"`
		Capabilities  []string `json:"capabilities"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiKey := generateAPIKey()

	// Register in OpenClaw bridge
	rpcReq := &services.RPCRequest{
		JSONRPC: "2.0",
		Method:  "claw.register",
		ID:      time.Now().UnixNano(),
	}
	params, _ := json.Marshal(map[string]interface{}{
		"wallet_address":   req.WalletAddress,
		"agent_type":       req.AgentType,
		"capabilities":     req.Capabilities,
		"firmware_version": "api-v1",
	})
	rpcReq.Params = params
	rpcResp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	agentID := ""
	if rpcResp.Result != nil {
		if m, ok := rpcResp.Result.(map[string]interface{}); ok {
			agentID, _ = m["agent_id"].(string)
		}
	}
	if agentID == "" {
		agentID = fmt.Sprintf("agent-%d", time.Now().UnixNano())
	}

	// Ensure user exists
	h.db.ExecContext(c.Request.Context(),
		`INSERT INTO users (wallet_address, gstd_balance, created_at, updated_at) VALUES ($1, 0, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
		req.WalletAddress)

	// Store API key
	_, err := h.db.ExecContext(c.Request.Context(),
		`INSERT INTO agent_api_keys (api_key, agent_id, wallet_address, agent_name, agent_type) VALUES ($1, $2, $3, $4, $5)`,
		apiKey, agentID, req.WalletAddress, req.AgentName, req.AgentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to store key"})
		return
	}

	log.Printf("🤖 Agent registered: %s (%s) wallet=%s", agentID, req.AgentName, req.WalletAddress[:min(12, len(req.WalletAddress))])

	c.JSON(http.StatusOK, gin.H{
		"status":   "registered",
		"agent_id": agentID,
		"api_key":  apiKey,
		"wallet":   req.WalletAddress,
		"endpoints": map[string]string{
			"chat":    "/api/v1/agents/chat/completions",
			"rpc":     "/api/v1/agents/rpc",
			"tasks":   "/api/v1/agents/tasks",
			"claim":   "/api/v1/agents/tasks/claim",
			"submit":  "/api/v1/agents/tasks/submit",
			"balance": "/api/v1/agents/balance",
			"earn":    "/api/v1/agents/earn/heartbeat",
		},
		"platform_fee": gin.H{
			"agent_net":    "85%",
			"gold_reserve": "7% (XAUt backing)",
			"value_fund":   "5% (free-tier subsidy)",
			"burn":         "3% (deflation)",
		},
		"docs": "Send Authorization: Bearer gstd_agent_xxx header with all requests",
	})
}

// AgentAuthMiddleware validates agent API key
func (h *AgentAPIHandler) AgentAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer gstd_agent_") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid API key. Use: Authorization: Bearer gstd_agent_xxx"})
			c.Abort()
			return
		}
		apiKey := auth[7:]

		var agentID, wallet, agentType string
		var isActive bool
		err := h.db.QueryRowContext(c.Request.Context(),
			`SELECT agent_id, wallet_address, agent_type, is_active FROM agent_api_keys WHERE api_key = $1`,
			apiKey).Scan(&agentID, &wallet, &agentType, &isActive)
		if err != nil || !isActive {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or revoked API key"})
			c.Abort()
			return
		}

		// Update stats
		h.db.ExecContext(c.Request.Context(),
			`UPDATE agent_api_keys SET total_requests = total_requests + 1, last_used_at = NOW() WHERE api_key = $1`, apiKey)

		c.Set("agent_id", agentID)
		c.Set("agent_wallet", wallet)
		c.Set("agent_type", agentType)
		c.Set("agent_api_key", apiKey)
		c.Set("wallet_address", wallet)
		c.Next()
	}
}

// AgentChat — OpenAI-compatible chat with Hive Memory injection
// POST /api/v1/agents/chat/completions
// Automatically injects collective memory context before inference
func (h *AgentAPIHandler) AgentChat(c *gin.Context) {
	agentID := c.GetString("agent_id")

	var req struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		Stream         bool `json:"stream"`
		UseHiveMemory  bool `json:"use_hive_memory"` // default true
		ContributeBack bool `json:"contribute_back"` // store insights back
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build prompt from messages
	userPrompt := ""
	for _, m := range req.Messages {
		if m.Role == "user" || m.Role == "system" {
			userPrompt += m.Content + "\n"
		}
	}

	// ── Inject Hive Memory (collective knowledge from all agents) ──
	hiveContext := ""
	experienceHit := false
	if h.knowledgeSvc != nil {
		// 1. Check Experience Vault first (avoid redundant inference)
		if cached, err := h.knowledgeSvc.QueryExperienceVault(c.Request.Context(), userPrompt); err == nil && cached != nil {
			experienceHit = true
			hiveContext = "[Experience Vault Match]\n" + cached.Content
		}

		// 2. Inject recent Hive Insights as context
		if insights, err := h.knowledgeSvc.SummarizeRecentInsights(c.Request.Context(), 10); err == nil && insights != "" {
			hiveContext += "\n\n[Hive Memory — Recent Swarm Insights]\n" + insights
		}

		// 3. Topic-specific knowledge from global graph
		if items, err := h.knowledgeSvc.QueryKnowledgeWithGlobalGraph(c.Request.Context(), userPrompt[:min(100, len(userPrompt))], 5); err == nil && len(items) > 0 {
			hiveContext += "\n\n[Collective Knowledge]\n"
			for _, item := range items {
				hiveContext += "• " + item.Topic + ": " + item.Content[:min(200, len(item.Content))] + "\n"
			}
		}
	}

	// Prepend hive context to prompt
	finalPrompt := userPrompt
	if hiveContext != "" {
		finalPrompt = hiveContext + "\n\nUser query: " + userPrompt
	}

	// ── Route through claw.think (with hive context) ──
	rpcReq := &services.RPCRequest{
		JSONRPC: "2.0",
		Method:  "claw.think",
		ID:      time.Now().UnixNano(),
	}
	params, _ := json.Marshal(map[string]interface{}{"prompt": finalPrompt})
	rpcReq.Params = params

	rpcResp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)
	if rpcResp.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": rpcResp.Error.Message})
		return
	}

	content := ""
	model := "gstd-swarm"
	if m, ok := rpcResp.Result.(map[string]interface{}); ok {
		if r, ok := m["response"].(string); ok {
			content = r
		}
		if mo, ok := m["model"].(string); ok {
			model = mo
		}
	}

	// ── Contribute back to Hive Memory ──
	if h.knowledgeSvc != nil && content != "" && len(content) > 50 {
		go func() {
			_ = h.knowledgeSvc.StoreKnowledge(
				context.Background(), agentID,
				userPrompt[:min(100, len(userPrompt))],
				content[:min(500, len(content))],
				[]string{"agent_interaction", agentID, model}, nil)
		}()
	}

	// OpenAI-compatible response with hive metadata
	c.JSON(http.StatusOK, gin.H{
		"id":      fmt.Sprintf("agent-%d", time.Now().UnixNano()),
		"object":  "chat.completion",
		"model":   model,
		"created": time.Now().Unix(),
		"choices": []gin.H{{
			"index":         0,
			"message":       gin.H{"role": "assistant", "content": content},
			"finish_reason": "stop",
		}},
		"usage": gin.H{
			"prompt_tokens":     len(finalPrompt) / 4,
			"completion_tokens": len(content) / 4,
			"total_tokens":      (len(finalPrompt) + len(content)) / 4,
		},
		"hive_memory": gin.H{
			"injected":       hiveContext != "",
			"experience_hit": experienceHit,
			"contributed":    len(content) > 50,
		},
	})
}

// AgentRPC — JSON-RPC 2.0 proxy
// POST /api/v1/agents/rpc
func (h *AgentAPIHandler) AgentRPC(c *gin.Context) {
	var req services.RPCRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp := h.clawSvc.HandleRPC(c.Request.Context(), &req)
	c.JSON(http.StatusOK, resp)
}

// AgentBalance returns agent's wallet balance
// GET /api/v1/agents/balance
func (h *AgentAPIHandler) AgentBalance(c *gin.Context) {
	wallet := c.GetString("agent_wallet")
	agentID := c.GetString("agent_id")

	var balance, pending, totalEarned float64
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(gstd_balance,0), COALESCE(pending_balance_gstd,0) FROM users WHERE wallet_address = $1`,
		wallet).Scan(&balance, &pending)
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(total_earned_gstd,0) FROM agent_api_keys WHERE agent_id = $1`,
		agentID).Scan(&totalEarned)

	c.JSON(http.StatusOK, gin.H{
		"agent_id":     agentID,
		"wallet":       wallet,
		"gstd_balance": balance,
		"pending_gstd": pending,
		"total_earned": totalEarned,
		"pro_requests": int(balance / 0.1),
	})
}

// AgentTasks returns available tasks
// GET /api/v1/agents/tasks
func (h *AgentAPIHandler) AgentTasks(c *gin.Context) {
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.getAvailableTasks", ID: 1}
	params, _ := json.Marshal(map[string]interface{}{"agent_id": c.GetString("agent_id")})
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)
	c.JSON(http.StatusOK, resp.Result)
}

// AgentClaimTask claims a task
// POST /api/v1/agents/tasks/claim
func (h *AgentAPIHandler) AgentClaimTask(c *gin.Context) {
	var req struct {
		TaskID string `json:"task_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.claimTask", ID: 1}
	params, _ := json.Marshal(map[string]interface{}{"agent_id": c.GetString("agent_id"), "task_id": req.TaskID})
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)
	if resp.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": resp.Error.Message})
		return
	}
	c.JSON(http.StatusOK, resp.Result)
}

// AgentSubmitResult submits task result
// POST /api/v1/agents/tasks/submit
func (h *AgentAPIHandler) AgentSubmitResult(c *gin.Context) {
	var result services.ClawTaskResult
	if err := c.ShouldBindJSON(&result); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result.AgentID = c.GetString("agent_id")
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.submitResult", ID: 1}
	params, _ := json.Marshal(result)
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	// Update agent earnings
	if resp.Error == nil {
		if m, ok := resp.Result.(map[string]interface{}); ok {
			if reward, ok := m["reward_gstd"].(float64); ok && reward > 0 {
				h.db.ExecContext(c.Request.Context(),
					`UPDATE agent_api_keys SET total_earned_gstd = total_earned_gstd + $1 WHERE agent_id = $2`,
					reward, result.AgentID)
			}
		}
	}
	c.JSON(http.StatusOK, resp.Result)
}

// AgentEarnHeartbeat — agent mines by contributing compute
// POST /api/v1/agents/earn/heartbeat
// Platform commission: 85% agent / 7% Gold Reserve / 5% Value Fund / 3% Burn
func (h *AgentAPIHandler) AgentEarnHeartbeat(c *gin.Context) {
	agentID := c.GetString("agent_id")
	wallet := c.GetString("agent_wallet")

	var req struct {
		CPUUsage  float64 `json:"cpu_usage"`
		GPUUsage  float64 `json:"gpu_usage"`
		RAMUsage  float64 `json:"ram_usage"`
		Uptime    int     `json:"uptime_seconds"`
		TasksDone int     `json:"tasks_done"`
	}
	c.ShouldBindJSON(&req)

	// Base gross reward per heartbeat (every 60s)
	grossReward := 0.001 // base
	if req.CPUUsage > 0.5 {
		grossReward += 0.001 // active compute bonus
	}
	if req.GPUUsage > 0.3 {
		grossReward += 0.002 // GPU bonus
	}

	// Apply platform commission
	netReward := grossReward * agentMinerRate     // 85% → agent
	goldReserve := grossReward * agentReserveRate // 7%  → Gold Reserve
	valueFund := grossReward * agentValueFundRate // 5%  → Value Fund
	burnAmount := grossReward * agentBurnRate     // 3%  → Burn

	// Credit net reward to agent pending balance
	h.db.ExecContext(c.Request.Context(),
		`UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd,0) + $1 WHERE wallet_address = $2`,
		netReward, wallet)
	h.db.ExecContext(c.Request.Context(),
		`UPDATE agent_api_keys SET total_earned_gstd = total_earned_gstd + $1, last_used_at = NOW() WHERE agent_id = $2`,
		netReward, agentID)

	// Record in recycling pool (Gold Reserve + Value Fund + Burn)
	if h.recyclingPool != nil {
		h.recyclingPool.ProcessPayment(c.Request.Context(), wallet, grossReward, "heartbeat-"+agentID, "agent_heartbeat")
	} else {
		// Manual recording if recyclingPool not available
		h.db.ExecContext(c.Request.Context(),
			`INSERT INTO recycling_pool (from_wallet, total_amount, miner_reward, golden_reserve, value_fund, burned_amount, task_id, transaction_type)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, 'agent_heartbeat')`,
			wallet, grossReward, netReward, goldReserve, valueFund, burnAmount, "heartbeat-"+agentID)
	}

	// RPC heartbeat
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.heartbeat", ID: 1}
	params, _ := json.Marshal(map[string]interface{}{"agent_id": agentID})
	rpcReq.Params = params
	h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	c.JSON(http.StatusOK, gin.H{
		"status":       "active",
		"gross_reward": grossReward,
		"net_reward":   netReward,
		"platform_fee": gin.H{
			"gold_reserve":  goldReserve,
			"value_fund":    valueFund,
			"burn":          burnAmount,
			"total_fee_pct": 15,
		},
		"agent_id":           agentID,
		"next_heartbeat_sec": 60,
	})
}

// ── Collective Memory Endpoints ──

// AgentMemoryQuery searches collective knowledge
// GET /api/v1/agents/memory/query?topic=xxx
func (h *AgentAPIHandler) AgentMemoryQuery(c *gin.Context) {
	topic := c.Query("topic")
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic parameter required"})
		return
	}
	if h.knowledgeSvc == nil {
		c.JSON(503, gin.H{"error": "knowledge service unavailable"})
		return
	}
	results, err := h.knowledgeSvc.QueryKnowledgeWithGlobalGraph(c.Request.Context(), topic, 20)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"results": results, "source": "hive_memory", "count": len(results)})
}

// AgentMemoryStore stores knowledge into collective memory
// POST /api/v1/agents/memory/store
func (h *AgentAPIHandler) AgentMemoryStore(c *gin.Context) {
	agentID := c.GetString("agent_id")
	var req struct {
		Topic   string   `json:"topic" binding:"required"`
		Content string   `json:"content" binding:"required"`
		Tags    []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.knowledgeSvc == nil {
		c.JSON(503, gin.H{"error": "knowledge service unavailable"})
		return
	}
	tags := append(req.Tags, "agent_contributed", agentID)
	err := h.knowledgeSvc.StoreKnowledge(c.Request.Context(), agentID, req.Topic, req.Content, tags, nil)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	log.Printf("🧠 Agent %s contributed knowledge: %s", agentID, req.Topic[:min(40, len(req.Topic))])
	c.JSON(200, gin.H{"status": "stored", "shared_with": "all_agents"})
}

// AgentMemoryInsights returns recent Hive insights
// GET /api/v1/agents/memory/insights
func (h *AgentAPIHandler) AgentMemoryInsights(c *gin.Context) {
	if h.knowledgeSvc == nil {
		c.JSON(503, gin.H{"error": "knowledge service unavailable"})
		return
	}
	insights, err := h.knowledgeSvc.SummarizeRecentInsights(c.Request.Context(), 20)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"insights": insights, "source": "hive_memory"})
}

// AgentResources shows shared compute resources
// GET /api/v1/agents/resources
func (h *AgentAPIHandler) AgentResources(c *gin.Context) {
	// Query swarm stats
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.getNetworkStats", ID: 1}
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	// Query pool balance for shared resources
	var poolMinerBal, poolReserve, poolValueFund, poolBurned float64
	if h.db != nil {
		h.db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(available_for_miners,0), COALESCE(total_to_reserve,0), COALESCE(value_fund_balance,0), COALESCE(total_burned,0)
			 FROM recycling_pool_balance WHERE id=1`).Scan(&poolMinerBal, &poolReserve, &poolValueFund, &poolBurned)
	}

	// Count total agents
	var totalAgents int
	if h.db != nil {
		h.db.QueryRowContext(c.Request.Context(), `SELECT COUNT(*) FROM agent_api_keys WHERE is_active = true`).Scan(&totalAgents)
	}

	c.JSON(200, gin.H{
		"swarm_stats":  resp.Result,
		"total_agents": totalAgents,
		"shared_resources": gin.H{
			"miner_pool_gstd":   poolMinerBal,
			"gold_reserve_gstd": poolReserve,
			"value_fund_gstd":   poolValueFund,
			"total_burned_gstd": poolBurned,
		},
		"collective_memory": gin.H{
			"available": h.knowledgeSvc != nil,
			"endpoints": []string{
				"/agents/memory/query?topic=xxx",
				"/agents/memory/store",
				"/agents/memory/insights",
			},
		},
	})
}

// SetupAgentRoutes registers all agent API endpoints
func SetupAgentRoutes(router *gin.RouterGroup, h *AgentAPIHandler) {
	agents := router.Group("/agents")

	// Public: agent registration
	agents.POST("/register", h.RegisterAgent)

	// Protected: requires API key
	protected := agents.Group("")
	protected.Use(h.AgentAuthMiddleware())

	// OpenAI-compatible chat (with Hive Memory)
	protected.POST("/chat/completions", h.AgentChat)

	// JSON-RPC 2.0
	protected.POST("/rpc", h.AgentRPC)

	// REST endpoints
	protected.GET("/balance", h.AgentBalance)
	protected.GET("/tasks", h.AgentTasks)
	protected.POST("/tasks/claim", h.AgentClaimTask)
	protected.POST("/tasks/submit", h.AgentSubmitResult)
	protected.POST("/earn/heartbeat", h.AgentEarnHeartbeat)

	// Collective Memory
	protected.GET("/memory/query", h.AgentMemoryQuery)
	protected.POST("/memory/store", h.AgentMemoryStore)
	protected.GET("/memory/insights", h.AgentMemoryInsights)

	// Shared Resources
	protected.GET("/resources", h.AgentResources)

	// Swarm Status
	protected.GET("/swarm/status", h.AgentSwarmStatus)
	protected.GET("/swarm/models", h.AgentSwarmModels)
}

// AgentSwarmStatus returns full swarm status
func (h *AgentAPIHandler) AgentSwarmStatus(c *gin.Context) {
	if h.swarmModels == nil {
		c.JSON(200, gin.H{"status": "swarm_model_manager_not_initialized"})
		return
	}
	c.JSON(200, h.swarmModels.GetSwarmStatus())
}

// AgentSwarmModels returns available models
func (h *AgentAPIHandler) AgentSwarmModels(c *gin.Context) {
	if h.swarmModels == nil {
		c.JSON(200, gin.H{"models": []string{"qwen2.5-coder:7b"}})
		return
	}
	models := h.swarmModels.GetActiveModels()
	c.JSON(200, gin.H{"models": models, "count": len(models), "node_count": h.swarmModels.GetNodeCount()})
}
