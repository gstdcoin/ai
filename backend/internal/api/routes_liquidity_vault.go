package api

import (
	"database/sql"
	"net/http"

	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
)

func SetupLiquidityVaultRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	vaultService := services.NewSovereignVaultService(db)
	vaults := v1.Group("/nodes/liquidity")

	// Create a new liquidity vault for a node
	vaults.POST("/vault", func(c *gin.Context) {
		var req struct {
			NodeWallet   string  `json:"node_wallet"`
			Asset        string  `json:"asset"`
			InitialStake float64 `json:"initial_stake"`
			FeePct       float64 `json:"fee_pct"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request formulation"})
			return
		}

		vault, err := vaultService.CreateVault(req.NodeWallet, req.Asset, req.InitialStake, req.FeePct)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, vault)
	})

	// Get all active liquidity vaults
	vaults.GET("/pools", func(c *gin.Context) {
		pools, err := vaultService.GetAllVaults()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve vaults"})
			return
		}
		if pools == nil {
			pools = []services.VaultState{}
		}
		c.JSON(http.StatusOK, pools)
	})
}
