package api

import (
	"context"
	"distributed-computing-platform/internal/services"
	"encoding/json"
	"fmt"
	"log"
	"strconv"

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
			WHERE id = $1 OR wallet_address = $1
		`, nodeID).Scan(&walletAddress)

		if err != nil {
			c.JSON(404, gin.H{"error": "node not found"})
			return
		}

		// Get pending tasks (queued status) with pagination
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

		tasks, err := taskPaymentService.GetPendingTasks(c.Request.Context(), limit, offset)
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
	zkProofService *services.ZKComputeProofService,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		handleSubmitWorkerResult(c, taskPaymentService, rewardEngine, zkProofService)
	}
}

func handleSubmitWorkerResult(c *gin.Context, taskPaymentService *services.TaskPaymentService, rewardEngine *services.RewardEngine, zkProofService *services.ZKComputeProofService) {
	var req struct {
		TaskID  string                 `json:"task_id" binding:"required"`
		NodeID  string                 `json:"node_id" binding:"required"`
		Result  json.RawMessage        `json:"result" binding:"required"`
		ZKProof *services.ComputeProof `json:"zk_proof,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	walletAddress, err := getWorkerWalletAddress(c.Request.Context(), taskPaymentService, req.NodeID)
	if err != nil {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}

	if err := verifyZKProofIfNeeded(zkProofService, req.ZKProof, req.TaskID); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Submit result and trigger reward distribution
	err = taskPaymentService.SubmitWorkerResult(c.Request.Context(), req.TaskID, req.NodeID, walletAddress, req.Result, rewardEngine)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	// Send Telegram notification about completed task
	notifyWorkerCompletion(c.Request.Context(), taskPaymentService, req.TaskID, walletAddress)

	c.JSON(200, gin.H{"message": "Result submitted successfully"})
}

func getWorkerWalletAddress(ctx context.Context, taskPaymentService *services.TaskPaymentService, nodeID string) (string, error) {
	var walletAddress string
	err := taskPaymentService.GetDB().QueryRowContext(ctx, `
		SELECT wallet_address
		FROM nodes
		WHERE id = $1
	`, nodeID).Scan(&walletAddress)

	if err != nil {
		if len(nodeID) >= 48 { // Basic TON address length check
			return nodeID, nil
		}
		return "", fmt.Errorf("node not found")
	}
	return walletAddress, nil
}

func verifyZKProofIfNeeded(zkProofService *services.ZKComputeProofService, proof *services.ComputeProof, taskID string) error {
	if proof == nil || zkProofService == nil {
		return nil
	}
	isValid, confidence, reason := zkProofService.VerifyProof(proof)
	if !isValid {
		return fmt.Errorf("ZK Proof verification failed: %s", reason)
	}
	log.Printf("✅ ZK Proof verified for task %s, confidence: %f\n", taskID, confidence)
	return nil
}

func notifyWorkerCompletion(ctx context.Context, taskPaymentService *services.TaskPaymentService, taskID, walletAddress string) {
	if taskPaymentService.GetTelegramService() == nil {
		return
	}

	var taskType string
	var rewardGSTD float64
	taskPaymentService.GetDB().QueryRowContext(ctx, `
		SELECT task_type, COALESCE(labor_compensation_gstd, 0)
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(&taskType, &rewardGSTD)

	go func() {
		// Use background context for async notification
		bgCtx := context.Background()
		if err := taskPaymentService.GetTelegramService().NotifyTaskCompleted(
			bgCtx,
			taskID,
			taskType,
			walletAddress,
			rewardGSTD,
		); err != nil {
			log.Printf("Failed to send Telegram notification for completed task: %v\n", err)
		}
	}()
}
