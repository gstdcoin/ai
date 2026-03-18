package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// OpenClawPanelHandler provides a full management dashboard for OpenClaw robots.
// It exposes public REST endpoints so that the node frontend can render a
// complete control panel — agents, tasks, stats, compound-model inference.
type OpenClawPanelHandler struct {
	db       *sql.DB
	clawSvc  *services.OpenClawBridgeService
	llmSvc   *services.InferenceService
	smartRtr *services.SmartRouter
}

func NewOpenClawPanelHandler(db *sql.DB, clawSvc *services.OpenClawBridgeService, llmSvc *services.InferenceService) *OpenClawPanelHandler {
	return &OpenClawPanelHandler{db: db, clawSvc: clawSvc, llmSvc: llmSvc}
}

func (h *OpenClawPanelHandler) SetSmartRouter(sr *services.SmartRouter) {
	h.smartRtr = sr
}

// ════════════════════════════════════════════════════════════════
// Dashboard — aggregated stats for the OpenClaw panel
// GET /api/v1/openclaw/dashboard
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) Dashboard(c *gin.Context) {
	var totalAgents, onlineAgents, totalTasks, openTasks, completedTasks int
	var totalEarned float64
	if h.db != nil {
		h.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM claw_agents").Scan(&totalAgents)
		h.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM claw_agents WHERE status = 'online'").Scan(&onlineAgents)
		h.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM claw_tasks").Scan(&totalTasks)
		h.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM claw_tasks WHERE status = 'open'").Scan(&openTasks)
		h.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM claw_tasks WHERE status = 'completed'").Scan(&completedTasks)
		h.db.QueryRowContext(c.Request.Context(), "SELECT COALESCE(SUM(total_earned_gstd), 0) FROM claw_agents").Scan(&totalEarned)
	}

	c.JSON(http.StatusOK, gin.H{
		"agents": gin.H{
			"total":  totalAgents,
			"online": onlineAgents,
		},
		"tasks": gin.H{
			"total":     totalTasks,
			"open":      openTasks,
			"completed": completedTasks,
		},
		"total_earned_gstd": totalEarned,
		"default_model":     "groq/compound",
		"protocol":          "openclaw-gstd/1.0",
		"capabilities": []string{
			"claw.register", "claw.heartbeat", "claw.status",
			"claw.getAvailableTasks", "claw.claimTask", "claw.submitResult",
			"claw.think", "claw.vision", "claw.getNetworkStats",
		},
	})
}

// ════════════════════════════════════════════════════════════════
// Agents — list registered claw agents
// GET /api/v1/openclaw/agents
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) ListAgents(c *gin.Context) {
	if h.db == nil {
		c.JSON(200, gin.H{"agents": []interface{}{}, "count": 0})
		return
	}
	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT agent_id, wallet_address, COALESCE(agent_type,''), status,
		       total_tasks, total_earned_gstd, trust_score, registered_at
		FROM claw_agents ORDER BY total_earned_gstd DESC LIMIT 100
	`)
	if err != nil {
		c.JSON(200, gin.H{"agents": []interface{}{}, "count": 0})
		return
	}
	defer rows.Close()

	var agents []gin.H
	for rows.Next() {
		var id, wallet, atype, status string
		var tasks int
		var earned, trust float64
		var registered time.Time
		if err := rows.Scan(&id, &wallet, &atype, &status, &tasks, &earned, &trust, &registered); err != nil {
			continue
		}
		agents = append(agents, gin.H{
			"agent_id":       id,
			"wallet_address": wallet,
			"agent_type":     atype,
			"status":         status,
			"total_tasks":    tasks,
			"total_earned":   earned,
			"trust_score":    trust,
			"registered_at":  registered.Format(time.RFC3339),
		})
	}
	if agents == nil {
		agents = []gin.H{}
	}
	c.JSON(200, gin.H{"agents": agents, "count": len(agents)})
}

// ════════════════════════════════════════════════════════════════
// Agent Detail
// GET /api/v1/openclaw/agents/:id
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) GetAgent(c *gin.Context) {
	agentID := c.Param("id")
	if h.db == nil {
		c.JSON(404, gin.H{"error": "agent not found"})
		return
	}
	var id, wallet, atype, status string
	var tasks int
	var earned, trust float64
	var registered time.Time
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT agent_id, wallet_address, COALESCE(agent_type,''), status,
		       total_tasks, total_earned_gstd, trust_score, registered_at
		FROM claw_agents WHERE agent_id = $1
	`, agentID).Scan(&id, &wallet, &atype, &status, &tasks, &earned, &trust, &registered)
	if err != nil {
		c.JSON(404, gin.H{"error": "agent not found"})
		return
	}
	c.JSON(200, gin.H{
		"agent_id":       id,
		"wallet_address": wallet,
		"agent_type":     atype,
		"status":         status,
		"total_tasks":    tasks,
		"total_earned":   earned,
		"trust_score":    trust,
		"registered_at":  registered.Format(time.RFC3339),
	})
}

// ════════════════════════════════════════════════════════════════
// Tasks — list claw tasks
// GET /api/v1/openclaw/tasks
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) ListTasks(c *gin.Context) {
	status := c.DefaultQuery("status", "")
	if h.db == nil {
		c.JSON(200, gin.H{"tasks": []interface{}{}, "count": 0})
		return
	}

	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = h.db.QueryContext(c.Request.Context(), `
			SELECT task_id, COALESCE(task_type,''), COALESCE(description,''), reward_gstd,
			       COALESCE(requester_wallet,''), COALESCE(assigned_agent,''), status, created_at
			FROM claw_tasks WHERE status = $1 ORDER BY created_at DESC LIMIT 50
		`, status)
	} else {
		rows, err = h.db.QueryContext(c.Request.Context(), `
			SELECT task_id, COALESCE(task_type,''), COALESCE(description,''), reward_gstd,
			       COALESCE(requester_wallet,''), COALESCE(assigned_agent,''), status, created_at
			FROM claw_tasks ORDER BY created_at DESC LIMIT 50
		`)
	}
	if err != nil {
		c.JSON(200, gin.H{"tasks": []interface{}{}, "count": 0})
		return
	}
	defer rows.Close()

	var tasks []gin.H
	for rows.Next() {
		var tid, ttype, desc, reqWallet, assigned, tStatus string
		var reward float64
		var created time.Time
		if err := rows.Scan(&tid, &ttype, &desc, &reward, &reqWallet, &assigned, &tStatus, &created); err != nil {
			continue
		}
		tasks = append(tasks, gin.H{
			"task_id":          tid,
			"task_type":        ttype,
			"description":      desc,
			"reward_gstd":      reward,
			"requester_wallet": reqWallet,
			"assigned_agent":   assigned,
			"status":           tStatus,
			"created_at":       created.Format(time.RFC3339),
		})
	}
	if tasks == nil {
		tasks = []gin.H{}
	}
	c.JSON(200, gin.H{"tasks": tasks, "count": len(tasks)})
}

// ════════════════════════════════════════════════════════════════
// Create Task — submit a new task for robots
// POST /api/v1/openclaw/tasks
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) CreateTask(c *gin.Context) {
	var req struct {
		TaskType        string                 `json:"task_type" binding:"required"`
		Description     string                 `json:"description" binding:"required"`
		RewardGSTD      float64                `json:"reward_gstd"`
		RequesterWallet string                 `json:"requester_wallet"`
		Parameters      map[string]interface{} `json:"parameters"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if h.db == nil {
		c.JSON(500, gin.H{"error": "database unavailable"})
		return
	}

	taskID := fmt.Sprintf("claw-task-%d", time.Now().UnixNano())
	paramsJSON, _ := json.Marshal(req.Parameters)

	_, err := h.db.ExecContext(c.Request.Context(), `
		INSERT INTO claw_tasks (task_id, task_type, description, reward_gstd, requester_wallet, parameters, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'open')
	`, taskID, req.TaskType, req.Description, req.RewardGSTD, req.RequesterWallet, paramsJSON)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create task: " + err.Error()})
		return
	}

	log.Printf("🤖 OpenClaw task created: %s type=%s reward=%.4f", taskID, req.TaskType, req.RewardGSTD)
	c.JSON(200, gin.H{
		"task_id":     taskID,
		"status":      "open",
		"task_type":   req.TaskType,
		"reward_gstd": req.RewardGSTD,
	})
}

// ════════════════════════════════════════════════════════════════
// Think — use groq/compound model for robot planning
// POST /api/v1/openclaw/think
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) Think(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
		Model  string `json:"model"` // optional, defaults to groq/compound
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	model := req.Model
	if model == "" {
		model = "groq/compound"
	}

	// Use the OpenClaw bridge's RPC think if inference is available
	rpcReq := &services.RPCRequest{
		JSONRPC: "2.0",
		Method:  "claw.think",
		ID:      time.Now().UnixNano(),
	}
	params, _ := json.Marshal(map[string]interface{}{
		"prompt": fmt.Sprintf("[Model: %s]\n%s", model, req.Prompt),
	})
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	if resp.Error != nil {
		c.JSON(500, gin.H{"error": resp.Error.Message})
		return
	}
	c.JSON(200, gin.H{
		"result": resp.Result,
		"model":  model,
		"source": "openclaw-gstd",
	})
}

// ════════════════════════════════════════════════════════════════
// Vision — image analysis via compound model
// POST /api/v1/openclaw/vision
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) Vision(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt" binding:"required"`
		Image  string `json:"image"` // base64 encoded
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	rpcReq := &services.RPCRequest{
		JSONRPC: "2.0",
		Method:  "claw.vision",
		ID:      time.Now().UnixNano(),
	}
	params, _ := json.Marshal(map[string]interface{}{
		"prompt": req.Prompt,
		"image":  req.Image,
	})
	rpcReq.Params = params
	resp := h.clawSvc.HandleRPC(c.Request.Context(), rpcReq)

	if resp.Error != nil {
		c.JSON(500, gin.H{"error": resp.Error.Message})
		return
	}
	c.JSON(200, gin.H{
		"result": resp.Result,
		"model":  "groq/compound",
		"source": "openclaw-gstd-vision",
	})
}

// ════════════════════════════════════════════════════════════════
// Models — list available models for OpenClaw
// GET /api/v1/openclaw/models
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) ListModels(c *gin.Context) {
	models := []gin.H{
		{
			"id": "groq/compound", "name": "Groq Compound",
			"description": "Multi-model compound agent with web search and reasoning",
			"default":     true, "capabilities": []string{"text", "reasoning", "web-search", "planning"},
		},
		{
			"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B",
			"description": "Versatile large language model for complex tasks",
			"default":     false, "capabilities": []string{"text", "reasoning", "code"},
		},
		{
			"id": "meta-llama/llama-4-scout-17b-16e-instruct", "name": "Llama 4 Scout",
			"description": "Efficient instruction-following model",
			"default":     false, "capabilities": []string{"text", "instruction-following"},
		},
		{
			"id": "moonshotai/kimi-k2-instruct", "name": "Kimi K2",
			"description": "Advanced instruction model",
			"default":     false, "capabilities": []string{"text", "reasoning"},
		},
		{
			"id": "qwen/qwen3-32b", "name": "Qwen3 32B",
			"description": "High-quality multilingual model",
			"default":     false, "capabilities": []string{"text", "multilingual", "code"},
		},
	}
	c.JSON(200, gin.H{"models": models, "default": "groq/compound"})
}

// ════════════════════════════════════════════════════════════════
// JSON-RPC — proxy raw RPC calls to the bridge
// POST /api/v1/openclaw/rpc
// ════════════════════════════════════════════════════════════════
func (h *OpenClawPanelHandler) RPC(c *gin.Context) {
	var req services.RPCRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	resp := h.clawSvc.HandleRPC(c.Request.Context(), &req)
	c.JSON(200, resp)
}

// ════════════════════════════════════════════════════════════════
// SetupOpenClawPanelRoutes registers all OpenClaw panel endpoints
// ════════════════════════════════════════════════════════════════
func SetupOpenClawPanelRoutes(v1 *gin.RouterGroup, h *OpenClawPanelHandler) {
	oc := v1.Group("/openclaw")
	{
		oc.GET("/dashboard", h.Dashboard)
		oc.GET("/agents", h.ListAgents)
		oc.GET("/agents/:id", h.GetAgent)
		oc.GET("/tasks", h.ListTasks)
		oc.POST("/tasks", h.CreateTask)
		oc.POST("/think", h.Think)
		oc.POST("/vision", h.Vision)
		oc.GET("/models", h.ListModels)
		oc.POST("/rpc", h.RPC)
	}
	log.Printf("🤖 OpenClaw Panel: ACTIVE — GET /api/v1/openclaw/dashboard, /agents, /tasks, /think, /models")
}
