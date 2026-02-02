package api

import (
	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
	"net/http"
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

		// Convert tags for pq driver if service didn't handle it
		pgTags := pq.Array(req.Tags)
		// But wait, service signature expects []string. We should handle driver specific inside service or rely on driver.
		// Go's lib/pq handles []string automatically for array columns usually.
		// Let's pass raw tags.

		if err := service.StoreKnowledge(c.Request.Context(), req.AgentID, req.Topic, req.Content, req.Tags); err != nil {
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

func SetupKnowledgeRoutes(group *gin.RouterGroup, service *services.KnowledgeService) {
	group.POST("/knowledge/store", storeKnowledge(service))
	group.GET("/knowledge/query", queryKnowledge(service))
}
