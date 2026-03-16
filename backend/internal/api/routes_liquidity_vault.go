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
		// Mock implementation returning a simulated list of Vaults until DB tables are deployed.
		// In production, this would query SovereignVaultService.GetAllVaults()
		c.JSON(http.StatusOK, []services.VaultState{
			{
				VaultID:        "VAULT-1704067200",
				NodeWallet:     "EQC_NODE_ALPHA...",
				Asset:          "USDT",
				TotalLiquidity: 15400.50,
				OperatorStake:  5400.50,
				DelegatorStake: 10000.00,
				ManagementFee:  0.15,
				TotalVolume:    89000.00,
				GeneratedYield: 445.00,
				Status:         "active",
			},
			{
				VaultID:        "VAULT-1704067300",
				NodeWallet:     "EQD_NODE_BETA...",
				Asset:          "TON",
				TotalLiquidity: 4200.00,
				OperatorStake:  4200.00,
				DelegatorStake: 0.00,
				ManagementFee:  0.10,
				TotalVolume:    12000.00,
				GeneratedYield: 60.00,
				Status:         "active",
			},
		})
	})
}
