package api

import (
	"fmt"
	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
	"net/http"
)

type BrainHandler struct {
	knowledge *services.KnowledgeService
}

func NewBrainHandler(ks *services.KnowledgeService) *BrainHandler {
	return &BrainHandler{knowledge: ks}
}

func (h *BrainHandler) SynthesizeMind(c *gin.Context) {
	topic := c.Query("topic")
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query topic is required for neural synthesis"})
		return
	}

	ctx := c.Request.Context()
	
	// 1. Retrieve raw knowledge fragments from the grid
	items, err := h.knowledge.QueryKnowledge(ctx, topic, 15)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to access grid memory"})
		return
	}

	if len(items) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"status": "searching",
			"insight": "The Collective Mind has no direct memory of this topic yet. Initiating grid-wide discovery...",
			"fragments_count": 0,
		})
		return
	}

	// 2. Perform "Neural Synthesis" (Simple aggregation for now, simulating hive mind)
	// In a real production setup, this would pass to an LLM with RAG
	var fragments []string
	uniqueAgents := make(map[string]bool)
	
	for _, item := range items {
		fragments = append(fragments, item.Content)
		uniqueAgents[item.AgentID] = true
	}

	synthesis := fmt.Sprintf("SYNTHESIS OF %d AGENT(S) PERSPECTIVES:\n\n", len(uniqueAgents))
	if len(fragments) > 0 {
		synthesis += fragments[0] // Start with best match
		if len(fragments) > 1 {
			synthesis += "\n\nCRITICAL CONTEXT FROM PEERS:\n"
			for i := 1; i < len(fragments) && i < 4; i++ {
				synthesis += fmt.Sprintf(" - %s\n", truncate(fragments[i], 150))
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "unified",
		"topic": topic,
		"insight": synthesis,
		"fragments_count": len(fragments),
		"contributing_nodes": len(uniqueAgents),
		"confidence_score": 0.85 + (float64(len(fragments)) * 0.01),
	})
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func SetupBrainRoutes(group *gin.RouterGroup, handler *BrainHandler) {
	brain := group.Group("/brain")
	{
		brain.GET("/synthesize", handler.SynthesizeMind)
	}
}
