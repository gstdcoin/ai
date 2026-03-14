package api

import (
	"database/sql"

	"github.com/gin-gonic/gin"
)

// RegisterMemoryRoutes provides endpoints for Node OS collective memory (L3).
func RegisterMemoryRoutes(v1 *gin.RouterGroup, dbConn *sql.DB) {
	// GET /memory/ping — health check for collective memory L3 layer
	v1.GET("/memory/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "layer": "L3", "platform": "gstd"})
	})

	// POST /memory/recall — collective memory recall from L3 platform layer
	v1.POST("/memory/recall", func(c *gin.Context) {
		// Basic stub — full implementation would search agent_knowledge
		var req struct {
			Key      string `json:"key"`
			Question string `json:"question"`
			NodeID   string `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}
		// Search in agent_knowledge table
		var answer, model string
		var confidence float64
		err := dbConn.QueryRowContext(c.Request.Context(),
			`SELECT content, COALESCE(model, 'platform'), COALESCE(confidence, 0.8)
			 FROM agent_knowledge
			 WHERE key = $1 OR question_hash = $1
			 ORDER BY confidence DESC LIMIT 1`, req.Key).Scan(&answer, &model, &confidence)
		if err != nil {
			c.JSON(200, gin.H{"found": false})
			return
		}
		c.JSON(200, gin.H{
			"found":      true,
			"answer":     answer,
			"model":      model,
			"confidence": confidence,
		})
	})

	// POST /memory/store — store knowledge in collective memory L3
	v1.POST("/memory/store", func(c *gin.Context) {
		var req struct {
			Key        string  `json:"key"`
			Question   string  `json:"question"`
			Answer     string  `json:"answer"`
			Model      string  `json:"model"`
			Confidence float64 `json:"confidence"`
			NodeID     string  `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Key == "" || req.Answer == "" {
			c.JSON(400, gin.H{"error": "key and answer required"})
			return
		}
		_, _ = dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO agent_knowledge (key, question_hash, content, model, confidence, node_id, created_at)
			 VALUES ($1, $1, $2, $3, $4, $5, NOW())
			 ON CONFLICT (key) DO UPDATE SET content = $2, confidence = GREATEST(agent_knowledge.confidence, $4), updated_at = NOW()`,
			req.Key, req.Answer, req.Model, req.Confidence, req.NodeID)
		c.JSON(200, gin.H{"status": "stored", "key": req.Key})
	})
}
