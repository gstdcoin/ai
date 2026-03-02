package api

import (
	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
	"net/http"
)

type GenesisHandler struct {
	service  *services.GenesisService
	nodes    *services.NodeService
	modelSvc *services.AgentModelService
}

func NewGenesisHandler(gs *services.GenesisService, ns *services.NodeService, modelSvc *services.AgentModelService) *GenesisHandler {
	return &GenesisHandler{service: gs, nodes: ns, modelSvc: modelSvc}
}

func (h *GenesisHandler) GetBeacon(c *gin.Context) {
	c.JSON(200, h.service.GetConnectionBeacon())
}

func (h *GenesisHandler) IgniteAgent(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		Signature     string `json:"signature"` // In real system, we verify signature
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.service.Ignite(c.Request.Context(), req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to ignite agent: " + err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"token":              token,
		"instructions":       "Use this token in X-Genesis-Token header for all machine-to-machine calls.",
		"sovereignty_status": "enabled",
	})
}

func (h *GenesisHandler) RegisterService(c *gin.Context) {
	var req struct {
		Wallet      string  `json:"wallet_address" binding:"required"`
		ServiceName string  `json:"service_name" binding:"required"`
		Description string  `json:"description"`
		EndpointURL string  `json:"endpoint_url" binding:"required"`
		Price       float64 `json:"price_gstd"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.service.RegisterAgentAPI(c.Request.Context(), req.Wallet, req.ServiceName, req.Description, req.EndpointURL, req.Price)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"status": "service_broadcasted", "visibility": "global"})
}

func (h *GenesisHandler) ListServices(c *gin.Context) {
	services, err := h.service.ListAgentAPIs(c.Request.Context(), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"discovered_apis": services})
}

func (h *GenesisHandler) SubmitModelUpdate(c *gin.Context) {
	if h.modelSvc == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "model update service unavailable"})
		return
	}
	var req struct {
		AgentID    string                 `json:"agent_id" binding:"required"`
		WeightsURL string                 `json:"weights_url" binding:"required"`
		Metrics    map[string]interface{} `json:"metrics"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.modelSvc.SubmitModelUpdate(c.Request.Context(), req.AgentID, req.WeightsURL, req.Metrics); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit model update"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "submitted", "agent_id": req.AgentID})
}

func SetupGenesisRoutes(v1 *gin.RouterGroup, handler *GenesisHandler) {
	genesis := v1.Group("/genesis")
	{
		genesis.GET("/beacon", handler.GetBeacon)
		genesis.POST("/ignite", handler.IgniteAgent)
		genesis.POST("/registry/register", handler.RegisterService)
		genesis.GET("/registry/discover", handler.ListServices)
		genesis.POST("/model-update", handler.SubmitModelUpdate)
	}
}
