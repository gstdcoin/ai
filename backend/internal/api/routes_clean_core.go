package api

import (
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// SetupCleanCoreRoutes registers Clean Core Protocol endpoints.
// - POST /admin/models/propagate: Shard-First propagation (admin)
// - POST /pipeline/proof-storage: Availability Staking (nodes)
func SetupCleanCoreRoutes(
	protected *gin.RouterGroup,
	cleanCore *services.CleanCoreService,
	tonConfig config.TONConfig,
) {
	if cleanCore == nil {
		return
	}

	// Admin: Shard-First — initiate model propagation (model lives in network, not on server disk)
	admin := protected.Group("/admin")
	admin.Use(RequireAdminWallet(tonConfig))
	{
		admin.POST("/models/propagate", func(c *gin.Context) {
			var req struct {
				ModelID string `json:"model_id"`
			}
			if err := c.ShouldBindJSON(&req); err != nil || req.ModelID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "model_id required"})
				return
			}
			if err := cleanCore.PropagateModel(c.Request.Context(), req.ModelID); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "propagated", "model_id": req.ModelID, "message": "Model lives in network"})
		})
	}

	// Protected: Availability Staking — nodes submit Proof-of-Storage every 10 min
	protected.POST("/pipeline/proof-storage", func(c *gin.Context) {
		var req services.ProofOfStorageRecord
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid proof format"})
			return
		}
		if req.NodeID == "" || req.ModelID == "" || len(req.BlockIDs) == 0 || req.ProofHash == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "node_id, model_id, block_ids, proof_hash required"})
			return
		}
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			wallet = c.GetString("user_id")
		}
		req.WalletAddr = wallet

		if err := cleanCore.SubmitProofOfStorage(c.Request.Context(), &req); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "verified", "valid_for_minutes": 10})
	})

	log.Println("✅ Clean Core Protocol routes registered")
}
