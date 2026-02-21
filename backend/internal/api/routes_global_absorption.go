package api

import (
	"net/http"
	"strconv"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SetupGlobalAbsorptionRoutes registers Global Absorption Protocol endpoints
func SetupGlobalAbsorptionRoutes(v1 *gin.RouterGroup, absorption *services.GlobalAbsorptionService) {
	if absorption == nil {
		return
	}
	g := v1.Group("/absorption")
	{
		// Search HF models by query (public)
		g.GET("/search", func(c *gin.Context) {
			query := c.Query("q")
			if query == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "q (query) required"})
				return
			}
			limit := 10
			if l := c.Query("limit"); l != "" {
				if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 50 {
					limit = n
				}
			}
			models, err := absorption.SearchHF(c.Request.Context(), query, limit)
			if err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"models": models})
		})

		// Search and absorb first open-license model not in registry (Proxy-Hugging-Bridge)
		g.POST("/search-absorb", func(c *gin.Context) {
			var req struct {
				Query string `json:"query" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			models, err := absorption.SearchAndAbsorb(c.Request.Context(), req.Query)
			if err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"models": models, "message": "Search complete. Open-license models absorbed if not in registry."})
		})

		// Absorb specific HF model by ID (e.g. "Qwen/Qwen3-Coder-Next")
		g.POST("/absorb", func(c *gin.Context) {
			var req struct {
				ModelID string `json:"model_id" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if err := absorption.AbsorbModel(c.Request.Context(), req.ModelID, nil); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "absorbed", "model_id": req.ModelID})
		})
	}
}
