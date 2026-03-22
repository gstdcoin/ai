package api

import (
	"net/http"

	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
)

// ═══════════════════════════════════════════════════════════════
// Autonomy API — endpoints for the self-governing platform
// ═══════════════════════════════════════════════════════════════

type AutonomyHandler struct {
	brain *services.SwarmBrain
	ai    *services.CompoundAI
}

func NewAutonomyHandler(brain *services.SwarmBrain, ai *services.CompoundAI) *AutonomyHandler {
	return &AutonomyHandler{brain: brain, ai: ai}
}

func (h *AutonomyHandler) RegisterRoutes(r *gin.RouterGroup) {
	auto := r.Group("/autonomy")
	{
		auto.GET("/status", h.GetStatus)
		auto.GET("/state", h.GetNetworkState)
		auto.GET("/ai/stats", h.GetAIStats)
		auto.GET("/ai/history", h.GetAIHistory)
		auto.POST("/ai/ask", h.AskBrain)
		auto.POST("/ai/analyze", h.RunAnalysis)
		auto.POST("/nodes/optimize", h.OptimizeNodes)
		auto.GET("/alerts", h.GetAlerts)
	}
}

// GET /api/v1/autonomy/status — full autonomous system status
func (h *AutonomyHandler) GetStatus(c *gin.Context) {
	state := h.brain.GetState()
	aiStats := h.brain.GetAIStats()

	c.JSON(http.StatusOK, gin.H{
		"autonomous":   true,
		"brain_active": true,
		"cycles":       h.brain.GetCycles(),
		"network":      state,
		"ai_stats":     aiStats,
		"capabilities": []string{
			"self_healing",
			"auto_node_management",
			"ai_driven_task_distribution",
			"growth_optimization",
			"economic_autopilot",
			"collective_intelligence",
			"compound_ai_brain",
		},
	})
}

// GET /api/v1/autonomy/state — network state
func (h *AutonomyHandler) GetNetworkState(c *gin.Context) {
	c.JSON(http.StatusOK, h.brain.GetState())
}

// GET /api/v1/autonomy/ai/stats — AI usage statistics
func (h *AutonomyHandler) GetAIStats(c *gin.Context) {
	c.JSON(http.StatusOK, h.ai.GetStats())
}

// GET /api/v1/autonomy/ai/history — recent AI decisions
func (h *AutonomyHandler) GetAIHistory(c *gin.Context) {
	history := h.ai.GetHistory(50)
	c.JSON(http.StatusOK, gin.H{
		"decisions": history,
		"count":     len(history),
	})
}

// POST /api/v1/autonomy/ai/ask — ask the brain a question
func (h *AutonomyHandler) AskBrain(c *gin.Context) {
	var req struct {
		Question string `json:"question" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "question required"})
		return
	}

	answer, err := h.brain.AskBrain(c.Request.Context(), req.Question)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"question": req.Question,
		"answer":   answer,
		"model":    "compound-beta",
		"cost":     0,
	})
}

// POST /api/v1/autonomy/ai/analyze — trigger an analysis
func (h *AutonomyHandler) RunAnalysis(c *gin.Context) {
	var req struct {
		Category string                 `json:"category"` // node_mgmt, healing, growth, economic, analysis
		Context  map[string]interface{} `json:"context"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Category = "analysis"
	}
	if req.Category == "" {
		req.Category = "analysis"
	}
	if req.Context == nil {
		state := h.brain.GetState()
		req.Context = map[string]interface{}{
			"total_nodes":    state.TotalNodes,
			"online_nodes":   state.OnlineNodes,
			"health":         state.NetworkHealth,
			"growth_rate_7d": state.GrowthRate7d,
		}
	}

	decision, err := h.ai.Analyze(c.Request.Context(), req.Category, req.Context)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"decision": decision,
		"cost":     0,
	})
}

// POST /api/v1/autonomy/nodes/optimize — AI-driven node optimization
func (h *AutonomyHandler) OptimizeNodes(c *gin.Context) {
	decision, err := h.brain.OptimizeNodes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"decision":       decision,
		"cost":           0,
		"auto_applied":   false,
		"needs_approval": true,
	})
}

// GET /api/v1/autonomy/alerts — network alerts
func (h *AutonomyHandler) GetAlerts(c *gin.Context) {
	state := h.brain.GetState()
	c.JSON(http.StatusOK, gin.H{
		"alerts": state.Alerts,
		"count":  len(state.Alerts),
	})
}
