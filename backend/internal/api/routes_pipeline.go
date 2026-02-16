package api

import (
	"distributed-computing-platform/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

// SetupPipelineRoutes registers Pipeline Parallelism endpoints
func SetupPipelineRoutes(v1 *gin.RouterGroup, protected *gin.RouterGroup, pipelineService *services.PipelineParallelismService) {
	if pipelineService == nil {
		log.Println("⚠️ Pipeline service is nil, skipping route registration")
		return
	}

	// Public: Pipeline network status
	v1.GET("/pipeline/status", func(c *gin.Context) {
		status, err := pipelineService.GetPipelineStatus(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, status)
	})

	// Protected: Register a node for pipeline inference
	protected.POST("/pipeline/register", func(c *gin.Context) {
		var req struct {
			NodeID        string `json:"node_id"`
			VRAM_MB       int    `json:"vram_mb"`
			RAM_MB        int    `json:"ram_mb"`
			GPUModel      string `json:"gpu_model"`
			BandwidthMbps int    `json:"bandwidth_mbps"`
			Region        string `json:"region"`
			EndpointURL   string `json:"endpoint_url"` // Clean Core: HTTP endpoint for proxied inference
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request"})
			return
		}

		walletAddress := c.GetString("wallet_address")
		if walletAddress == "" {
			walletAddress = c.GetString("user_id")
		}

		node := &services.PipelineNode{
			NodeID:        req.NodeID,
			WalletAddr:    walletAddress,
			VRAM_MB:       req.VRAM_MB,
			RAM_MB:        req.RAM_MB,
			GPUModel:      req.GPUModel,
			Bandwidth_Mbps: req.BandwidthMbps,
			Region:        req.Region,
			EndpointURL:   req.EndpointURL,
		}

		if err := pipelineService.RegisterNode(c.Request.Context(), node); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"status": "registered", "node_id": req.NodeID})
	})

	// Protected: Assemble a pipeline for a specific model
	protected.POST("/pipeline/assemble", func(c *gin.Context) {
		var req struct {
			Model string `json:"model"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Model name required"})
			return
		}

		pipeline, err := pipelineService.AssemblePipeline(c.Request.Context(), req.Model)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, pipeline)
	})

	// Protected: Node heartbeat
	protected.POST("/pipeline/heartbeat", func(c *gin.Context) {
		var req struct {
			NodeID string `json:"node_id"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "node_id required"})
			return
		}

		if err := pipelineService.NodeHeartbeat(c.Request.Context(), req.NodeID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"status": "ok"})
	})

	log.Println("✅ Pipeline Parallelism routes registered")
}
