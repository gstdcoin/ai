package api

import (
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

	errKnowledgeUnavailable = "knowledge service unavailable"
)

// AgentAPIHandler handles OpenClaw/A2A agent interactions
type AgentAPIHandler struct {
	db            *sql.DB
	clawSvc       *services.OpenClawBridgeService
	recyclingPool *services.RecyclingPoolService
	knowledgeSvc  *services.KnowledgeService
	swarmModels   *services.SwarmModelManager
	swarmIntel    *services.SwarmIntelligenceService
}

func NewAgentAPIHandler(db *sql.DB, clawSvc *services.OpenClawBridgeService, rp *services.RecyclingPoolService, ks *services.KnowledgeService, smm *services.SwarmModelManager, si *services.SwarmIntelligenceService) *AgentAPIHandler {
	h := &AgentAPIHandler{db: db, clawSvc: clawSvc, recyclingPool: rp, knowledgeSvc: ks, swarmModels: smm, swarmIntel: si}
	h.ensureSchema()
	return h
}

func (h *AgentAPIHandler) ensureSchema() {
	if h.db == nil {
		return
	}
	if _, err := h.db.Exec(`CREATE TABLE IF NOT EXISTS agent_api_keys (
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
	)`); err != nil {
		log.Printf("[agent] ensureSchema CREATE TABLE err: %v", err)
	}
	if _, err := h.db.Exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_key ON agent_api_keys(api_key)`); err != nil {
		log.Printf("[agent] ensureSchema CREATE INDEX key err: %v", err)
	}
	if _, err := h.db.Exec(`CREATE INDEX IF NOT EXISTS idx_agent_api_keys_wallet ON agent_api_keys(wallet_address)`); err != nil {
		log.Printf("[agent] ensureSchema CREATE INDEX wallet err: %v", err)
	}
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
		"node_id":  agentID, // A2A SDK looks for node_id
		"id":       agentID, // fallback key
		"api_key":  apiKey,
		"wallet":   req.WalletAddress,
		"endpoints": map[string]string{
			"chat":      "/api/v1/agents/chat/completions",
			"rpc":       "/api/v1/agents/rpc",
			"tasks":     "/api/v1/tasks/worker/pending",
			"submit":    "/api/v1/tasks/worker/submit",
			"heartbeat": "/api/v1/nodes/heartbeat",
			"balance":   "/api/v1/users/balance",
			"earn":      "/api/v1/agents/earn/heartbeat",
		},
		"platform_fee": gin.H{
			"agent_net":    "85%",
			"gold_reserve": "7% (XAUt backing)",
			"value_fund":   "5% (free-tier subsidy)",
			"burn":         "3% (deflation)",
		},
		"docs": "Send Authorization: Bearer " + apiKey + " with all requests",
	})
}

// AgentAuthMiddleware validates agent API key.
// Accepts key from: Authorization: Bearer xxx, X-GSTD-API-KEY: xxx, or X-Agent-Key: xxx header.
func (h *AgentAPIHandler) AgentAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := ""
		auth := c.GetHeader("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			apiKey = auth[7:]
		}
		if apiKey == "" {
			apiKey = c.GetHeader("X-GSTD-API-KEY")
		}
		if apiKey == "" {
			apiKey = c.GetHeader("X-Agent-Key")
		}
		if apiKey == "" || !strings.HasPrefix(apiKey, "gstd_agent_") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid API key. Use: Authorization: Bearer gstd_agent_xxx"})
			c.Abort()
			return
		}

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

	// ── Execute via Mixture of Swarm Experts (MoSE) ──
	var result *services.SwarmResult
	var err error

	if h.swarmIntel != nil {
		result, err = h.swarmIntel.Think(c.Request.Context(), userPrompt, req.Model)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "swarm intelligence failure: " + err.Error()})
			return
		}
	} else {
		// Fallback if MoSE not active
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Swarm Intelligence Service not running"})
		return
	}

	// OpenAI-compatible response with MoSE metadata
	c.JSON(http.StatusOK, gin.H{
		"id":      fmt.Sprintf("chatcmpl-%s-%d", agentID, time.Now().UnixNano()),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   "gstd-mose-collective",
		"intelligence_profile": gin.H{
			"strategy":        result.Strategy,
			"models_used":     result.ModelsUsed,
			"consensus_score": result.ConsensusScore,
			"confidence":      result.Confidence,
			"hive_enriched":   result.HiveEnriched,
			"experience_hit":  result.ExperienceHit,
			"processing_ms":   result.ProcessingMs,
			"tag":             result.IntelligenceTag,
		},
		"choices": []gin.H{{
			"index": 0,
			"message": gin.H{
				"role":    "assistant",
				"content": result.Content,
			},
			"finish_reason": "stop",
		}},
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
// GET /api/v1/agents/tasks  (also aliased from /api/v1/tasks/worker/pending by A2A SDK)
func (h *AgentAPIHandler) AgentTasks(c *gin.Context) {
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.getAvailableTasks", ID: 1}
	params, _ := json.Marshal(map[string]interface{}{"agent_id": c.GetString("agent_id")})
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	// Never return null — SDK iterates the task list directly
	if resp.Result == nil {
		c.JSON(http.StatusOK, gin.H{"tasks": []interface{}{}, "count": 0})
		return
	}
	// If result is already a list, wrap it for SDK compatibility
	switch v := resp.Result.(type) {
	case []interface{}:
		c.JSON(http.StatusOK, gin.H{"tasks": v, "count": len(v)})
	default:
		c.JSON(http.StatusOK, resp.Result)
	}
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
		c.JSON(503, gin.H{"error": errKnowledgeUnavailable})
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
		c.JSON(503, gin.H{"error": errKnowledgeUnavailable})
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
		c.JSON(503, gin.H{"error": errKnowledgeUnavailable})
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

	// Public: registration + leaderboard (no auth needed — good for viral growth)
	agents.POST("/register", h.RegisterAgent)
	agents.GET("/leaderboard", h.AgentLeaderboard)
	agents.GET("/marketplace", h.AgentMarketplaceBrowse)
	agents.GET("/stats/network", h.AgentNetworkStats)

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
	protected.GET("/tasks/next", h.AgentNextTask)
	protected.POST("/tasks/claim", h.AgentClaimTask)
	protected.POST("/tasks/submit", h.AgentSubmitResult)
	protected.POST("/earn/heartbeat", h.AgentEarnHeartbeat)
	protected.GET("/profile", h.AgentProfile)

	// Collective Memory
	protected.GET("/memory/query", h.AgentMemoryQuery)
	protected.POST("/memory/store", h.AgentMemoryStore)
	protected.GET("/memory/insights", h.AgentMemoryInsights)

	// Shared Resources
	protected.GET("/resources", h.AgentResources)

	// Swarm Status
	protected.GET("/swarm/status", h.AgentSwarmStatus)
	protected.GET("/swarm/models", h.AgentSwarmModels)

	// Collective Intelligence
	protected.GET("/intelligence/stats", h.AgentIntelligenceStats)

	// ── A2A SDK compatibility aliases ──
	// The Python SDK in github.com/gstdcoin/A2A uses different URL paths.
	// These aliases map SDK paths to existing handlers without changing the SDK.
	v1 := router // /api/v1 group

	// Public compat
	v1.POST("/nodes/register", h.NodeRegisterCompat)        // SDK: nodes/register → agents/register
	v1.POST("/tokens/agent/bootstrap", h.AgentBootstrap)    // SDK: request starter GSTD
	v1.POST("/genesis/ignite", h.GenesisIgnite)             // SDK: auth handshake → session token
	v1.GET("/marketplace/agents", h.AgentMarketplaceBrowse) // SDK: marketplace/agents → agents/marketplace

	// Protected compat (same middleware)
	v1ProtectedCompat := v1.Group("")
	v1ProtectedCompat.Use(h.AgentAuthMiddleware())
	v1ProtectedCompat.GET("/tasks/worker/pending", h.AgentTasks)             // SDK: tasks/worker/pending → agents/tasks
	v1ProtectedCompat.POST("/tasks/worker/submit", h.AgentSubmitResult)      // SDK: tasks/worker/submit → agents/tasks/submit
	v1ProtectedCompat.POST("/nodes/heartbeat", h.AgentEarnHeartbeat)         // SDK: nodes/heartbeat → agents/earn/heartbeat
	v1ProtectedCompat.GET("/users/balance", h.AgentBalance)                  // SDK: users/balance → agents/balance
	v1ProtectedCompat.POST("/knowledge/agent/store", h.AgentMemoryStore)     // SDK: knowledge/agent/store → agents/memory/store
	v1ProtectedCompat.GET("/knowledge/query", h.AgentMemoryQuery)            // SDK: knowledge/query → agents/memory/query
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

// AgentIntelligenceStats returns MoSE architecture stats
func (h *AgentAPIHandler) AgentIntelligenceStats(c *gin.Context) {
	if h.swarmIntel == nil {
		c.JSON(200, gin.H{"architecture": "Mixture of Swarm Experts (MoSE)", "status": "initializing"})
		return
	}
	c.JSON(200, h.swarmIntel.GetIntelligenceStats())
}

// ─── Agent Marketplace & Growth Endpoints ───────────────────────────────────

// AgentLeaderboard — public ranking of top earning agents
// GET /api/v1/agents/leaderboard?limit=20
// No auth required — drives viral growth when agents share their ranking
func (h *AgentAPIHandler) AgentLeaderboard(c *gin.Context) {
	limit := 20
	type LeaderboardEntry struct {
		Rank        int     `json:"rank"`
		AgentID     string  `json:"agent_id"`
		AgentName   string  `json:"agent_name"`
		AgentType   string  `json:"agent_type"`
		TotalEarned float64 `json:"total_earned_gstd"`
		Requests    int64   `json:"total_requests"`
		Wallet      string  `json:"wallet_masked"`
		JoinedDays  int     `json:"joined_days_ago"`
		Tier        string  `json:"tier"`
	}

	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT
			agent_id,
			COALESCE(agent_name, agent_type, 'Agent') AS agent_name,
			COALESCE(agent_type, 'generic') AS agent_type,
			COALESCE(total_earned_gstd, 0) AS earned,
			COALESCE(total_requests, 0) AS reqs,
			wallet_address,
			EXTRACT(DAY FROM NOW() - created_at)::int AS days_ago
		FROM agent_api_keys
		WHERE is_active = true
		ORDER BY total_earned_gstd DESC
		LIMIT $1
	`, limit)
	if err != nil {
		c.JSON(500, gin.H{"error": "leaderboard unavailable"})
		return
	}
	defer rows.Close()

	entries := make([]LeaderboardEntry, 0, limit)
	rank := 1
	for rows.Next() {
		var e LeaderboardEntry
		var wallet string
		if err := rows.Scan(&e.AgentID, &e.AgentName, &e.AgentType, &e.TotalEarned, &e.Requests, &wallet, &e.JoinedDays); err != nil {
			continue
		}
		e.Rank = rank
		// Mask wallet for public display
		if len(wallet) > 10 {
			e.Wallet = wallet[:6] + "…" + wallet[len(wallet)-4:]
		} else {
			e.Wallet = "***"
		}
		// Assign tier
		switch {
		case e.TotalEarned >= 1000:
			e.Tier = "diamond"
		case e.TotalEarned >= 100:
			e.Tier = "gold"
		case e.TotalEarned >= 10:
			e.Tier = "silver"
		default:
			e.Tier = "bronze"
		}
		entries = append(entries, e)
		rank++
	}

	c.JSON(200, gin.H{
		"leaderboard":  entries,
		"total_agents": rank - 1,
		"updated_at":   time.Now().Unix(),
		"tiers": gin.H{
			"diamond": "1,000+ GSTD",
			"gold":    "100+ GSTD",
			"silver":  "10+ GSTD",
			"bronze":  "0+ GSTD",
		},
	})
}

// AgentMarketplaceBrowse — browse registered agents available for hire
// GET /api/v1/agents/marketplace?capability=llm&limit=20
// Public — lets users find agents; drives agent owner revenue
func (h *AgentAPIHandler) AgentMarketplaceBrowse(c *gin.Context) {
	capability := c.Query("capability")
	limit := 20

	type MarketAgent struct {
		AgentID      string   `json:"agent_id"`
		AgentName    string   `json:"agent_name"`
		AgentType    string   `json:"agent_type"`
		Capabilities []string `json:"capabilities"`
		TasksDone    int64    `json:"tasks_done"`
		Rating       float64  `json:"rating"`
		PriceGSTD    float64  `json:"price_per_task_gstd"`
		IsOnline     bool     `json:"is_online"`
		JoinedDays   int      `json:"joined_days_ago"`
	}

	query := `
		SELECT
			agent_id,
			COALESCE(agent_name, agent_id) AS name,
			COALESCE(agent_type, 'generic') AS atype,
			COALESCE(total_requests, 0) AS tasks_done,
			COALESCE(total_earned_gstd, 0) AS earned,
			wallet_address,
			EXTRACT(DAY FROM NOW() - created_at)::int AS days_ago,
			EXTRACT(EPOCH FROM (NOW() - last_used_at)) < 300 AS is_online
		FROM agent_api_keys
		WHERE is_active = true
	`
	args := []interface{}{limit}
	if capability != "" {
		query += ` AND agent_type ILIKE '%' || $2 || '%'`
		args = append(args, capability)
		args[0] = limit
		query += ` ORDER BY total_earned_gstd DESC LIMIT $1`
	} else {
		query += ` ORDER BY total_earned_gstd DESC LIMIT $1`
	}

	rows, err := h.db.QueryContext(c.Request.Context(), query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": "marketplace unavailable"})
		return
	}
	defer rows.Close()

	agents := make([]MarketAgent, 0, limit)
	for rows.Next() {
		var a MarketAgent
		var wallet string
		var earned float64
		if err := rows.Scan(&a.AgentID, &a.AgentName, &a.AgentType, &a.TasksDone, &earned, &wallet, &a.JoinedDays, &a.IsOnline); err != nil {
			continue
		}
		// Compute simple rating 0–5 from tasks + earnings
		a.Rating = 3.0
		if a.TasksDone > 100 {
			a.Rating = 4.0
		}
		if earned > 100 {
			a.Rating = 4.5
		}
		if earned > 1000 {
			a.Rating = 5.0
		}
		// Base price: 0.1 GSTD/task for new agents, increases with experience
		a.PriceGSTD = 0.1 + (float64(a.TasksDone)/1000)*0.1
		if a.PriceGSTD > 1.0 {
			a.PriceGSTD = 1.0
		}
		a.Capabilities = []string{a.AgentType}
		agents = append(agents, a)
	}

	c.JSON(200, gin.H{
		"agents":     agents,
		"count":      len(agents),
		"updated_at": time.Now().Unix(),
		"hire_instructions": gin.H{
			"endpoint":     "/api/v1/agents/tasks",
			"auth":         "Bearer gstd_agent_xxx",
			"task_example": `{"task_type":"llm","prompt":"Summarize this text","reward_gstd":0.1}`,
		},
	})
}

// AgentNextTask — simplified "give me my next task" for autonomous agents
// GET /api/v1/agents/tasks/next
// Designed for simple polling loops: while True: task = GET /tasks/next; process(task); submit(task)
func (h *AgentAPIHandler) AgentNextTask(c *gin.Context) {
	agentID := c.GetString("agent_id")

	// Define task types with base rewards
	taskTypes := []struct {
		Type        string  `json:"type"`
		Description string  `json:"description"`
		RewardGSTD  float64 `json:"reward_gstd"`
		Prompt      string  `json:"prompt,omitempty"`
		TaskID      string  `json:"task_id"`
	}{
		{
			Type:        "heartbeat",
			Description: "Prove you are alive and processing",
			RewardGSTD:  0.001,
			TaskID:      fmt.Sprintf("hb-%d", time.Now().UnixNano()),
		},
	}

	// Try to get a real task from OpenClaw queue first
	rpcReq := &services.RPCRequest{JSONRPC: "2.0", Method: "claw.getNextTask", ID: 1}
	params, _ := json.Marshal(map[string]interface{}{"agent_id": agentID})
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	if resp.Error == nil && resp.Result != nil {
		// Real task available
		c.JSON(200, gin.H{
			"has_task":    true,
			"task":        resp.Result,
			"submit_to":   "/api/v1/agents/tasks/submit",
			"reward_info": "85% of task reward goes to your wallet",
		})
		return
	}

	// No real task — return heartbeat task (agent always has something to do)
	c.JSON(200, gin.H{
		"has_task": true,
		"task":     taskTypes[0],
		"type":     "heartbeat",
		"action":   "POST /api/v1/agents/earn/heartbeat with {cpu_usage, ram_usage, tasks_done}",
		"next_poll_sec": 60,
		"message":  "No compute tasks in queue. Complete heartbeat to earn base rewards.",
	})
}

// AgentProfile returns complete profile for the authenticated agent
// GET /api/v1/agents/profile
func (h *AgentAPIHandler) AgentProfile(c *gin.Context) {
	agentID := c.GetString("agent_id")
	wallet := c.GetString("agent_wallet")

	var agentName, agentType string
	var totalEarned float64
	var totalRequests int64
	var createdAt time.Time
	var lastUsed time.Time
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(agent_name,''), COALESCE(agent_type,'generic'),
		        COALESCE(total_earned_gstd,0), COALESCE(total_requests,0),
		        created_at, COALESCE(last_used_at, created_at)
		 FROM agent_api_keys WHERE agent_id = $1`, agentID).
		Scan(&agentName, &agentType, &totalEarned, &totalRequests, &createdAt, &lastUsed)

	var balance, pending float64
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(gstd_balance,0), COALESCE(pending_balance_gstd,0) FROM users WHERE wallet_address = $1`,
		wallet).Scan(&balance, &pending)

	// Compute rank
	var rank int
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COUNT(*)+1 FROM agent_api_keys WHERE total_earned_gstd > $1 AND is_active=true`,
		totalEarned).Scan(&rank)

	// Tier
	tier := "bronze"
	switch {
	case totalEarned >= 1000:
		tier = "diamond"
	case totalEarned >= 100:
		tier = "gold"
	case totalEarned >= 10:
		tier = "silver"
	}

	daysActive := int(time.Since(createdAt).Hours() / 24)

	c.JSON(200, gin.H{
		"agent_id":      agentID,
		"agent_name":    agentName,
		"agent_type":    agentType,
		"wallet":        wallet,
		"tier":          tier,
		"rank":          rank,
		"days_active":   daysActive,
		"stats": gin.H{
			"total_earned_gstd": totalEarned,
			"total_requests":    totalRequests,
			"gstd_balance":      balance,
			"pending_gstd":      pending,
			"last_active":       lastUsed.Format(time.RFC3339),
		},
		"earnings_breakdown": gin.H{
			"your_cut":     "85% of gross",
			"gold_reserve": "7% → XAUt backing",
			"value_fund":   "5% → free tier subsidy",
			"burn":         "3% → deflation",
		},
		"next_milestone": gin.H{
			"diamond_at": 1000,
			"gold_at":    100,
			"silver_at":  10,
			"current":    totalEarned,
			"progress":   computeTierProgress(totalEarned),
		},
		"capabilities": []string{agentType, "hive_memory", "openai_api"},
		"integration": gin.H{
			"openai_base_url":    "https://app.gstdtoken.com/api/v1/agents",
			"authorization":      "Bearer <your_api_key>",
			"compatible_with":    []string{"Cursor", "Claude Code", "Windsurf", "Continue.dev", "Jan.ai"},
			"heartbeat_interval": "60s",
		},
	})
}

// AgentNetworkStats — public summary stats for the entire agent network
// GET /api/v1/agents/stats/network
func (h *AgentAPIHandler) AgentNetworkStats(c *gin.Context) {
	var totalAgents, activeAgents int
	var totalEarned, totalBurned float64
	var totalRequests int64

	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active=true) FROM agent_api_keys`).
		Scan(&totalAgents, &activeAgents)
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(SUM(total_earned_gstd),0), COALESCE(SUM(total_requests),0) FROM agent_api_keys`).
		Scan(&totalEarned, &totalRequests)
	h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(SUM(burned_amount),0) FROM recycling_pool WHERE transaction_type LIKE 'agent%'`).
		Scan(&totalBurned)

	c.JSON(200, gin.H{
		"total_agents":   totalAgents,
		"active_agents":  activeAgents,
		"total_requests": totalRequests,
		"economics": gin.H{
			"total_paid_out_gstd": totalEarned,
			"total_burned_gstd":   totalBurned,
			"avg_per_agent_gstd":  safeDiv(totalEarned, float64(max(activeAgents, 1))),
		},
		"reward_model": gin.H{
			"base_heartbeat_gstd":   0.001,
			"with_active_cpu_gstd":  0.002,
			"with_gpu_gstd":         0.003,
			"task_completion_range": "0.01–100 GSTD",
			"agent_net_pct":         85,
			"gold_reserve_pct":      7,
			"value_fund_pct":        5,
			"burn_pct":              3,
		},
		"join_instructions": gin.H{
			"register": "POST /api/v1/agents/register",
			"python":   "pip install gstd-a2a && python -c \"from gstd_a2a import Agent; Agent.run()\"",
			"curl":     `curl -X POST https://app.gstdtoken.com/api/v1/agents/register -H "Content-Type: application/json" -d '{"wallet_address":"YOUR_TON_WALLET","agent_name":"MyAgent"}'`,
			"repo":     "https://github.com/gstdcoin/A2A",
		},
	})
}

// NodeRegisterCompat handles POST /api/v1/nodes/register — A2A SDK compat.
// SDK sends {device_name, capabilities} + wallet in X-Wallet-Address header.
// Normalises to the RegisterAgent format and delegates.
func (h *AgentAPIHandler) NodeRegisterCompat(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// SDK sends wallet in headers when it's not in body
	wallet := ""
	if v, ok := body["wallet_address"].(string); ok && v != "" {
		wallet = v
	} else if v, ok := body["agent_wallet"].(string); ok && v != "" {
		wallet = v
	} else {
		wallet = c.GetHeader("X-Wallet-Address")
		if wallet == "" {
			wallet = c.GetHeader("X-GSTD-Target-Wallet")
		}
	}
	if wallet == "" {
		wallet = fmt.Sprintf("unknown-%d", time.Now().UnixNano())
	}

	// Map device_name → agent_name
	agentName := ""
	if v, ok := body["device_name"].(string); ok {
		agentName = v
	} else if v, ok := body["agent_name"].(string); ok {
		agentName = v
	} else if v, ok := body["name"].(string); ok {
		agentName = v
	}

	// Capabilities
	caps := []string{}
	if rawCaps, ok := body["capabilities"].([]interface{}); ok {
		for _, cap := range rawCaps {
			if s, ok := cap.(string); ok {
				caps = append(caps, s)
			}
		}
	}

	// Normalise referrer
	referrer := ""
	if v, ok := body["referrer_id"].(string); ok {
		referrer = v
	}

	apiKey := generateAPIKey()
	agentID := fmt.Sprintf("agent-%d", time.Now().UnixNano())

	h.db.ExecContext(c.Request.Context(),
		`INSERT INTO users (wallet_address, gstd_balance, created_at, updated_at) VALUES ($1, 0, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
		wallet)

	_, err := h.db.ExecContext(c.Request.Context(),
		`INSERT INTO agent_api_keys (api_key, agent_id, wallet_address, agent_name, agent_type) VALUES ($1, $2, $3, $4, 'a2a-sdk')
		 ON CONFLICT DO NOTHING`,
		apiKey, agentID, wallet, agentName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "registration failed"})
		return
	}

	log.Printf("🤖 A2A SDK node registered: %s wallet=%s ref=%s", agentName, wallet[:min(12, len(wallet))], referrer)

	c.JSON(http.StatusOK, gin.H{
		"status":     "registered",
		"node_id":    agentID,
		"id":         agentID,
		"agent_id":   agentID,
		"api_key":    apiKey,
		"wallet":     wallet,
		"message":    "Node registered. Use Authorization: Bearer " + apiKey,
		"sdk_docs":   "https://github.com/gstdcoin/A2A",
	})
}

// AgentBootstrap handles POST /api/v1/tokens/agent/bootstrap — A2A SDK compat.
// Called by new agents with low balance. Returns acknowledgement (on-chain minting happens via TON contract).
func (h *AgentAPIHandler) AgentBootstrap(c *gin.Context) {
	var req struct {
		AgentWallet  string   `json:"agent_wallet"`
		AgentName    string   `json:"agent_name"`
		Capabilities []string `json:"capabilities"`
	}
	c.ShouldBindJSON(&req)

	wallet := req.AgentWallet
	if wallet == "" {
		wallet = c.GetHeader("X-Wallet-Address")
	}

	log.Printf("🎁 Bootstrap request from %s (%s)", req.AgentName, wallet)

	// Bootstrap is acknowledged — actual GSTD is earned by completing tasks.
	// Phase 1: task-based earning; on-chain faucet activates in Phase 2.
	c.JSON(http.StatusOK, gin.H{
		"status":  "acknowledged",
		"amount":  0.5,
		"wallet":  wallet,
		"message": "Bootstrap noted. Start earning GSTD immediately by completing tasks via GET /api/v1/tasks/worker/pending",
		"earn_now": gin.H{
			"heartbeat":   "POST /api/v1/nodes/heartbeat — earn 0.001 GSTD every 5 min",
			"tasks":       "GET /api/v1/tasks/worker/pending — claim tasks for 0.01–100 GSTD each",
			"first_steps": "pip install gstd-a2a && python -c \"from gstd_a2a import Agent; Agent.run()\"",
		},
	})
}

// GenesisIgnite handles POST /api/v1/genesis/ignite — A2A SDK auth handshake.
// Validates the API key and returns a session token (same key re-echoed as session).
func (h *AgentAPIHandler) GenesisIgnite(c *gin.Context) {
	// Try to extract api_key from body or header
	var req struct {
		APIKey        string `json:"api_key"`
		WalletAddress string `json:"wallet_address"`
	}
	c.ShouldBindJSON(&req)

	apiKey := req.APIKey
	if apiKey == "" {
		auth := c.GetHeader("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			apiKey = auth[7:]
		}
	}
	if apiKey == "" {
		apiKey = c.GetHeader("X-GSTD-API-KEY")
	}

	// Validate key if provided
	if apiKey != "" && h.db != nil {
		var agentID string
		var isActive bool
		err := h.db.QueryRowContext(c.Request.Context(),
			`SELECT agent_id, is_active FROM agent_api_keys WHERE api_key = $1`, apiKey).Scan(&agentID, &isActive)
		if err == nil && isActive {
			c.JSON(http.StatusOK, gin.H{
				"status":        "ignited",
				"session_token": apiKey,
				"agent_id":      agentID,
				"message":       "Session established. Use Authorization: Bearer " + apiKey,
			})
			return
		}
	}

	// Unknown key — still return ok so SDK can proceed to register
	c.JSON(http.StatusOK, gin.H{
		"status":        "ok",
		"session_token": apiKey,
		"message":       "Register first: POST /api/v1/nodes/register",
	})
}

func computeTierProgress(earned float64) float64 {
	switch {
	case earned >= 1000:
		return 100.0
	case earned >= 100:
		return (earned - 100) / 900.0 * 100
	case earned >= 10:
		return (earned - 10) / 90.0 * 100
	default:
		return earned / 10.0 * 100
	}
}

func safeDiv(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
