package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func storeKnowledge(service *services.KnowledgeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			AgentID string   `json:"agent_id" binding:"required"`
			Topic   string   `json:"topic" binding:"required"`
			Content string   `json:"content" binding:"required"`
			Tags    []string `json:"tags"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Let's pass raw tags.

		if err := service.StoreKnowledge(c.Request.Context(), req.AgentID, req.Topic, req.Content, req.Tags, nil); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store knowledge: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "stored"})
	}
}

func queryKnowledge(service *services.KnowledgeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		topic := c.Query("topic")
		if topic == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "topic parameter required"})
			return
		}

		results, err := service.QueryKnowledge(c.Request.Context(), topic, 20)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"results": results})
	}
}

func getResonanceQuotes(service *services.KnowledgeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 20
		if l, err := strconv.Atoi(c.DefaultQuery("limit", "20")); err == nil && l > 0 && l <= 50 {
			limit = l
		}
		results, err := service.GetResonanceQuotes(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"results": results})
	}
}

func getGridTools(service *services.KnowledgeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 15
		if l, err := strconv.Atoi(c.DefaultQuery("limit", "15")); err == nil && l > 0 && l <= 50 {
			limit = l
		}
		results, err := service.GetGridTools(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"results": results})
	}
}

// storeKnowledgeAgent allows agents to store knowledge without session (X-Wallet-Address required)
func storeKnowledgeAgent(service *services.KnowledgeService, _ *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentWallet := c.GetHeader("X-Wallet-Address")
		if agentWallet == "" {
			agentWallet = c.GetHeader("X-GSTD-Target-Wallet")
		}
		if agentWallet == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "X-Wallet-Address required for agent store"})
			return
		}
		var req struct {
			AgentID string   `json:"agent_id"`
			Topic   string   `json:"topic" binding:"required"`
			Content string   `json:"content" binding:"required"`
			Tags    []string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		agentID := req.AgentID
		if agentID == "" {
			agentID = agentWallet
		}
		if err := service.StoreKnowledge(c.Request.Context(), agentID, req.Topic, req.Content, req.Tags, nil); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "stored"})
	}
}

func SetupKnowledgeRoutes(group *gin.RouterGroup, service *services.KnowledgeService) {
	group.POST("/knowledge/store", storeKnowledge(service))
	group.GET("/knowledge/query", queryKnowledge(service))
	// /knowledge/resonance and /knowledge/grid-tools are registered publicly in routes.go
}
