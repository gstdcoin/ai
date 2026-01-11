package api

import (
	"distributed-computing-platform/internal/services"
	"strings"

	"github.com/gin-gonic/gin"
)

func loginUser(service *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string `json:"wallet_address" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Basic validation: check wallet address format
		walletAddress := strings.TrimSpace(req.WalletAddress)
		if walletAddress == "" {
			c.JSON(400, gin.H{"error": "wallet_address cannot be empty"})
			return
		}

		// TON addresses are typically 48 characters (EQ/UQ/kQ/0Q + 44 base64 chars)
		// Allow some flexibility for raw format (0:...) but enforce minimum length
		if len(walletAddress) < 10 {
			c.JSON(400, gin.H{"error": "wallet_address has invalid length"})
			return
		}

		// TODO: In next sprint, add full TonConnect signature validation here
		// This will verify that the user actually owns the wallet by checking:
		// 1. Signature from TonConnect UI
		// 2. Message payload matches expected format
		// 3. Public key resolves to the provided wallet address
		// Example: if err := validateTonConnectSignature(req.Signature, req.Message, walletAddress); err != nil { ... }

		user, err := service.LoginOrRegister(c.Request.Context(), walletAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, user)
	}
}

