package api

import (
	"database/sql"
	"log"
	"strings"

	"github.com/gin-gonic/gin"
)

// RegisterMemoryRoutes provides endpoints for Node OS collective memory (L3).
func RegisterMemoryRoutes(v1 *gin.RouterGroup, dbConn *sql.DB) {
	// GET /memory/ping — health check for collective memory L3 layer
	v1.GET("/memory/ping", func(c *gin.Context) {
		var count int
		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM agent_knowledge`).Scan(&count)
		c.JSON(200, gin.H{
			"status":        "ok",
			"layer":         "L3",
			"platform":      "gstd",
			"total_entries": count,
		})
	})

	// POST /memory/recall — collective memory recall from L3 platform layer
	v1.POST("/memory/recall", func(c *gin.Context) {
		var req struct {
			Key      string `json:"key"`
			Question string `json:"question"`
			NodeID   string `json:"node_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		// Search by topic (exact match on key hash) or content similarity
		searchTerm := req.Question
		if searchTerm == "" {
			searchTerm = req.Key
		}

		// Try exact topic match first
		var answer, agentID, topic string
		err := dbConn.QueryRowContext(c.Request.Context(),
			`SELECT content, agent_id, topic FROM agent_knowledge
			 WHERE topic = $1 ORDER BY created_at DESC LIMIT 1`, searchTerm).Scan(&answer, &agentID, &topic)
		if err == nil {
			c.JSON(200, gin.H{
				"found":      true,
				"answer":     answer,
				"model":      "platform-l3",
				"confidence": 0.9,
				"agent_id":   agentID,
				"topic":      topic,
			})
			return
		}

		// Fallback: search content with ILIKE for partial match
		words := strings.Fields(strings.ToLower(searchTerm))
		if len(words) == 0 {
			c.JSON(200, gin.H{"found": false})
			return
		}
		// Use first 3 significant words for search
		searchWords := words
		if len(searchWords) > 3 {
			searchWords = searchWords[:3]
		}
		pattern := "%" + strings.Join(searchWords, "%") + "%"
		err = dbConn.QueryRowContext(c.Request.Context(),
			`SELECT content, agent_id, topic FROM agent_knowledge
			 WHERE LOWER(content) LIKE $1
			 ORDER BY created_at DESC LIMIT 1`, pattern).Scan(&answer, &agentID, &topic)
		if err != nil {
			c.JSON(200, gin.H{"found": false})
			return
		}
		c.JSON(200, gin.H{
			"found":      true,
			"answer":     answer,
			"model":      "platform-l3",
			"confidence": 0.7,
			"agent_id":   agentID,
			"topic":      topic,
		})
	})

	// POST /memory/store — store knowledge in collective memory L3
	v1.POST("/memory/store", func(c *gin.Context) {
		var req struct {
			Key        string   `json:"key"`
			Question   string   `json:"question"`
			Answer     string   `json:"answer"`
			Model      string   `json:"model"`
			Confidence float64  `json:"confidence"`
			NodeID     string   `json:"node_id"`
			Tags       []string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Answer == "" {
			c.JSON(400, gin.H{"error": "answer required"})
			return
		}

		// Determine topic and agent_id
		topic := req.Question
		if topic == "" {
			topic = req.Key
		}
		if len(topic) > 200 {
			topic = topic[:200]
		}
		agentID := req.NodeID
		if agentID == "" {
			agentID = "anonymous"
		}

		// Build tags array: include model and confidence for searchability
		tags := req.Tags
		if req.Model != "" {
			tags = append(tags, "model:"+req.Model)
		}
		if req.Confidence >= 0.8 {
			tags = append(tags, "verified")
		}

		_, err := dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO agent_knowledge (agent_id, topic, content, tags, created_at)
			 VALUES ($1, $2, $3, $4, NOW())`,
			agentID, topic, req.Answer, tags)
		if err != nil {
			log.Printf("[Memory L3] store error: %v", err)
			c.JSON(500, gin.H{"error": "store failed"})
			return
		}
		c.JSON(200, gin.H{"status": "stored", "topic": topic, "agent_id": agentID})
	})

	// GET /memory/stats — overview of collective memory
	v1.GET("/memory/stats", func(c *gin.Context) {
		var total, topics, agents int
		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*), COUNT(DISTINCT topic), COUNT(DISTINCT agent_id) FROM agent_knowledge`).Scan(&total, &topics, &agents)

		var globalLayers int
		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM global_knowledge_layer`).Scan(&globalLayers)

		c.JSON(200, gin.H{
			"total_entries":       total,
			"unique_topics":       topics,
			"contributing_agents": agents,
			"global_layers":       globalLayers,
			"layers": gin.H{
				"l1": "in-memory (per node)",
				"l2": "redis (shared cache)",
				"l3": "postgresql (global)",
			},
		})
	})
}
