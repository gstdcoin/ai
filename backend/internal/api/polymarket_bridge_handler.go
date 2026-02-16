package api

import (
	"distributed-computing-platform/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// PolymarketBridgeHandler handles Polymarket bridge API
type PolymarketBridgeHandler struct {
	bridge *services.PolymarketBridgeService
}

// NewPolymarketBridgeHandler creates the handler
func NewPolymarketBridgeHandler(bridge *services.PolymarketBridgeService) *PolymarketBridgeHandler {
	return &PolymarketBridgeHandler{bridge: bridge}
}

// GetBridgeTasks godoc
// @Summary List Polymarket bridge tasks
// @Tags Polymarket
// @Param status query string false "pending|collecting|analyzed|paid"
// @Param limit query int false "max results"
// @Success 200 {array} services.PolymarketTaskInfo
// @Router /polymarket/bridge/tasks [get]
func (h *PolymarketBridgeHandler) GetBridgeTasks(c *gin.Context) {
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	tasks, err := h.bridge.GetBridgeTasks(c.Request.Context(), status, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

// GetPoolBalance godoc
// @Summary Polymarket pool balance
// @Tags Polymarket
// @Success 200 {object} map[string]float64
// @Router /polymarket/bridge/pool [get]
func (h *PolymarketBridgeHandler) GetPoolBalance(c *gin.Context) {
	bal, err := h.bridge.GetPoolBalance(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"balance_gstd": bal, "fund_type": "polymarket_pool"})
}

// FetchAndCreateTasks godoc
// @Summary Fetch Polymarket events and create tasks
// @Tags Polymarket
// @Param limit query int false "max events to create (default 100)"
// @Success 200 {object} map[string]int
// @Router /polymarket/bridge/fetch [post]
func (h *PolymarketBridgeHandler) FetchAndCreateTasks(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	created, err := h.bridge.FetchAndCreateTasks(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"created": created, "message": "Tasks created from Polymarket events"})
}

// AggregateTask godoc
// @Summary Aggregate results and analyze task
// @Tags Polymarket
// @Param task_id path string true "Task ID"
// @Success 200 {object} map[string]interface{}
// @Router /polymarket/bridge/tasks/{task_id}/aggregate [post]
func (h *PolymarketBridgeHandler) AggregateTask(c *gin.Context) {
	taskID := c.Param("task_id")
	if taskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "task_id required"})
		return
	}
	consensus, confidence, err := h.bridge.AggregateAndAnalyze(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"task_id":   taskID,
		"consensus": consensus,
		"confidence": confidence,
		"status":    "analyzed",
	})
}

// FundPool godoc
// @Summary Fund Polymarket pool (admin)
// @Tags Polymarket
// @Param request body object true "amount_gstd, source"
// @Success 200 {object} map[string]interface{}
// @Router /polymarket/bridge/fund [post]
func (h *PolymarketBridgeHandler) FundPool(c *gin.Context) {
	var req struct {
		AmountGSTD float64 `json:"amount_gstd"`
		Source     string  `json:"source"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AmountGSTD <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "amount_gstd must be positive"})
		return
	}
	if req.Source == "" {
		req.Source = "manual"
	}
	if err := h.bridge.FundPolymarketPool(c.Request.Context(), req.AmountGSTD, req.Source); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	bal, _ := h.bridge.GetPoolBalance(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"funded": req.AmountGSTD, "balance_gstd": bal})
}
