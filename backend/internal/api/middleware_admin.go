package api

import (
	"distributed-computing-platform/internal/config"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// RequireAdminWallet middleware checks if the request is from admin wallet
// Admin wallet address is verified via TonConnect signature or wallet address header
func RequireAdminWallet(tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get wallet address from header or query parameter
		walletAddress := c.GetHeader("X-Wallet-Address")
		if walletAddress == "" {
			walletAddress = c.Query("wallet_address")
		}

		if walletAddress == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Wallet address required. Provide X-Wallet-Address header or wallet_address query parameter",
			})
			c.Abort()
			return
		}

		// Normalize addresses (remove dashes, convert to uppercase for comparison)
		normalizedRequest := strings.ToUpper(strings.ReplaceAll(walletAddress, "-", ""))
		normalizedAdmin := strings.ToUpper(strings.ReplaceAll(tonConfig.AdminWallet, "-", ""))

		// Verify wallet address matches admin wallet (case-insensitive, dash-insensitive)
		if normalizedRequest != normalizedAdmin {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Access denied. Only admin wallet can access this endpoint",
			})
			c.Abort()
			return
		}

		// Store admin wallet in context for use in handlers
		c.Set("admin_wallet", walletAddress)
		c.Next()
	}
}
