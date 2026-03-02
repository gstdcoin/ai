package api

import (
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// GetGaslessStatus returns subsidy count and swap info (public)
func GetGaslessStatus(gasless *services.GaslessUserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if gasless == nil {
			c.JSON(200, gin.H{"subsidy_count": 0, "subsidy_limit": 5000, "internal_swap_available": false})
			return
		}
		count, _ := gasless.GetSubsidyCount(c.Request.Context())
		c.JSON(200, gin.H{
			"subsidy_count":           count,
			"subsidy_limit":           5000,
			"internal_swap_available": true,
			"min_gstd_for_swap":       0.1,
		})
	}
}

// InternalSwapGSTDForTON lets user exchange GSTD for TON (for gas)
func InternalSwapGSTDForTON(gasless *services.GaslessUserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddress, ok := c.Get("wallet_address")
		if !ok || walletAddress == nil {
			walletAddress, _ = c.Get("user_id")
		}
		if walletAddress == nil || walletAddress.(string) == "" {
			c.JSON(401, gin.H{"error": "wallet required"})
			return
		}
		wallet := walletAddress.(string)

		var req struct {
			GSTDAmount float64 `json:"gstd_amount" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "gstd_amount required"})
			return
		}

		if gasless == nil {
			c.JSON(503, gin.H{"error": "internal swap temporarily unavailable"})
			return
		}

		tonNano, txHash, err := gasless.InternalSwap(c.Request.Context(), wallet, req.GSTDAmount)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{
			"ton_amount_nano": tonNano,
			"ton_amount":      float64(tonNano) / 1e9,
			"tx_hash":         txHash,
			"gstd_spent":      req.GSTDAmount,
		})
	}
}
