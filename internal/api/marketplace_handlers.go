package api

import (
	"net/http"
	"strconv"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// AgentMarketplaceHandler handles agent marketplace endpoints
type AgentMarketplaceHandler struct {
	marketplace *services.AgentMarketplaceService
}

// NewAgentMarketplaceHandler creates a new agent marketplace handler
func NewAgentMarketplaceHandler(marketplace *services.AgentMarketplaceService) *AgentMarketplaceHandler {
	return &AgentMarketplaceHandler{marketplace: marketplace}
}

// ============================================================================
// AGENT REGISTRATION
// ============================================================================

// RegisterAgent registers an agent for rental
// POST /api/v1/marketplace/agents
func (h *AgentMarketplaceHandler) RegisterAgent(c *gin.Context) {
	var req services.AgentRegistration

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	agent, err := h.marketplace.RegisterAgent(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"agent":   agent,
		"message": "🤖 Agent registered successfully! It's now available for rental.",
	})
}

// UpdateAgent updates agent details
// PUT /api/v1/marketplace/agents/:id
func (h *AgentMarketplaceHandler) UpdateAgent(c *gin.Context) {
	agentID := c.Param("id")
	ownerWallet := c.GetHeader("X-Wallet-Address")
	if ownerWallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Wallet address required"})
		return
	}

	var updates services.AgentUpdate
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.marketplace.UpdateAgent(c.Request.Context(), agentID, ownerWallet, &updates)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Agent updated successfully",
	})
}

// GetMyAgents returns agents owned by the user
// GET /api/v1/marketplace/agents/mine
func (h *AgentMarketplaceHandler) GetMyAgents(c *gin.Context) {
	ownerWallet := c.Query("wallet")
	if ownerWallet == "" {
		ownerWallet = c.GetHeader("X-Wallet-Address")
	}
	if ownerWallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Wallet address required"})
		return
	}

	agents, err := h.marketplace.GetMyAgents(c.Request.Context(), ownerWallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"agents": agents,
		"count":  len(agents),
	})
}

// ============================================================================
// BROWSING & DISCOVERY
// ============================================================================

// BrowseAgents returns available agents
// GET /api/v1/marketplace/agents
func (h *AgentMarketplaceHandler) BrowseAgents(c *gin.Context) {
	filter := &services.AgentFilter{
		Capability:   c.Query("capability"),
		PricingModel: c.Query("pricing_model"),
		SortBy:       c.Query("sort_by"),
	}

	// Parse numeric filters
	if minTrust := c.Query("min_trust"); minTrust != "" {
		if val, err := strconv.ParseFloat(minTrust, 64); err == nil {
			filter.MinTrustScore = val
		}
	}
	if maxPrice := c.Query("max_price"); maxPrice != "" {
		if val, err := strconv.ParseFloat(maxPrice, 64); err == nil {
			filter.MaxPrice = val
		}
	}
	if limit := c.Query("limit"); limit != "" {
		if val, err := strconv.Atoi(limit); err == nil {
			filter.Limit = val
		}
	}
	if offset := c.Query("offset"); offset != "" {
		if val, err := strconv.Atoi(offset); err == nil {
			filter.Offset = val
		}
	}

	agents, err := h.marketplace.BrowseAgents(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"agents": agents,
		"count":  len(agents),
		"filter": filter,
	})
}

// GetAgentDetails returns detailed info about an agent
// GET /api/v1/marketplace/agents/:id
func (h *AgentMarketplaceHandler) GetAgentDetails(c *gin.Context) {
	agentID := c.Param("id")

	details, err := h.marketplace.GetAgentDetails(c.Request.Context(), agentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, details)
}

// ============================================================================
// RENTAL OPERATIONS
// ============================================================================

// RentAgent starts a rental session
// POST /api/v1/marketplace/rentals
func (h *AgentMarketplaceHandler) RentAgent(c *gin.Context) {
	var req services.RentRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	session, err := h.marketplace.RentAgent(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"rental":  session,
		"message": "🤝 Rental started! You can now use this agent.",
	})
}

// ExecuteTask records a task execution during rental
// POST /api/v1/marketplace/rentals/:id/execute
func (h *AgentMarketplaceHandler) ExecuteTask(c *gin.Context) {
	rentalID := c.Param("id")

	var execution services.TaskExecution
	if err := c.ShouldBindJSON(&execution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.marketplace.ExecuteAgentTask(c.Request.Context(), rentalID, &execution)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Task executed and recorded",
	})
}

// EndRental ends a rental session
// POST /api/v1/marketplace/rentals/:id/end
func (h *AgentMarketplaceHandler) EndRental(c *gin.Context) {
	rentalID := c.Param("id")

	var req struct {
		RenterWallet string `json:"renter_wallet" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	summary, err := h.marketplace.EndRental(c.Request.Context(), rentalID, req.RenterWallet)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"summary": summary,
		"message": "Rental completed successfully!",
	})
}

// ============================================================================
// REVIEWS
// ============================================================================

// ReviewAgent adds a review for an agent
// POST /api/v1/marketplace/agents/:id/reviews
func (h *AgentMarketplaceHandler) ReviewAgent(c *gin.Context) {
	agentID := c.Param("id")

	var req struct {
		ReviewerWallet string  `json:"reviewer_wallet" binding:"required"`
		Rating         float64 `json:"rating" binding:"required,min=1,max=5"`
		Comment        string  `json:"comment"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	review := &services.AgentReview{
		AgentID:        agentID,
		ReviewerWallet: req.ReviewerWallet,
		Rating:         req.Rating,
		Comment:        req.Comment,
	}

	err := h.marketplace.ReviewAgent(c.Request.Context(), review)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "Review submitted successfully!",
	})
}

// ============================================================================
// FEATURED & STATS
// ============================================================================

// GetFeaturedAgents returns top featured agents
// GET /api/v1/marketplace/featured
func (h *AgentMarketplaceHandler) GetFeaturedAgents(c *gin.Context) {
	filter := &services.AgentFilter{
		SortBy:        "trust",
		MinTrustScore: 0.7,
		Limit:         10,
	}

	agents, err := h.marketplace.BrowseAgents(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"featured_agents": agents,
		"count":           len(agents),
	})
}

// GetMarketplaceStats returns marketplace statistics
// GET /api/v1/marketplace/stats
func (h *AgentMarketplaceHandler) GetMarketplaceStats(c *gin.Context) {
	// This would aggregate stats from DB
	c.JSON(http.StatusOK, gin.H{
		"total_agents":     0, // Would query DB
		"active_rentals":   0,
		"total_volume":     0.0,
		"avg_agent_rating": 0.0,
		"popular_capabilities": []string{
			"text-processing",
			"data-validation",
			"image-analysis",
		},
	})
}
