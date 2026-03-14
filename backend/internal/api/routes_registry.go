package api

import (
	"github.com/gin-gonic/gin"
)

// RegisterRegistryRoutes provides model registry listings.
func RegisterRegistryRoutes(v1 *gin.RouterGroup) {
	// GET /models/registry — returns available models for node training subsystem
	v1.GET("/models/registry", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"models": []gin.H{
				{"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "type": "inference", "available": true},
				{"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "type": "inference", "available": true},
				{"id": "qwen/qwen3-32b", "name": "Qwen3 32B", "type": "inference", "available": true},
				{"id": "meta-llama/llama-4-scout-17b-16e-instruct", "name": "Llama 4 Scout", "type": "inference", "available": true},
				{"id": "openai/gpt-oss-120b", "name": "GPT-OSS 120B", "type": "inference", "available": true},
				{"id": "openai/gpt-oss-20b", "name": "GPT-OSS 20B", "type": "inference", "available": true},
				{"id": "moonshotai/kimi-k2-instruct", "name": "Kimi K2", "type": "inference", "available": true},
				{"id": "groq/compound", "name": "Groq Compound", "type": "inference", "available": true},
			},
		})
	})
}
