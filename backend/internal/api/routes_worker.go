package api

import (
	"encoding/json"
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

func getWorkerPendingTasks(taskPaymentService *services.TaskPaymentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get node_id from query parameter
		nodeID := c.Query("node_id")
		if nodeID == "" {
			c.JSON(400, gin.H{"error": "node_id parameter is required"})
			return
		}

		// Verify node exists and get wallet address
		var walletAddress string
		err := taskPaymentService.GetDB().QueryRowContext(c.Request.Context(), `
			SELECT wallet_address
			FROM nodes
			WHERE id = $1
		`, nodeID).Scan(&walletAddress)

		if err != nil {
			c.JSON(404, gin.H{"error": "node not found"})
			return
		}

		// Get pending tasks (queued status)
		tasks, err := taskPaymentService.GetPendingTasks(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"tasks": tasks})
	}
}

func submitWorkerResult(
	taskPaymentService *services.TaskPaymentService,
	rewardEngine *services.RewardEngine,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TaskID string          `json:"task_id" binding:"required"`
			NodeID string          `json:"node_id" binding:"required"`
			Result json.RawMessage `json:"result" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Verify node exists
		var walletAddress string
		err := taskPaymentService.GetDB().QueryRowContext(c.Request.Context(), `
			SELECT wallet_address
			FROM nodes
			WHERE id = $1
		`, req.NodeID).Scan(&walletAddress)

		if err != nil {
			c.JSON(404, gin.H{"error": "node not found"})
			return
		}

		// Submit result and trigger reward distribution
		err = taskPaymentService.SubmitWorkerResult(c.Request.Context(), req.TaskID, req.NodeID, walletAddress, req.Result, rewardEngine)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Result submitted successfully"})
	}
}

