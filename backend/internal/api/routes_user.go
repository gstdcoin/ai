package api

import (
	"crypto/rand"
	"distributed-computing-platform/internal/services"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// loginUser handles user login with TonConnect signature validation
func loginUser(service *services.UserService, validator *services.TonConnectValidator, redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string `json:"wallet_address" binding:"required"`
			Signature     string `json:"signature" binding:"required"`
			Payload       string `json:"payload" binding:"required"`
			PublicKey     string `json:"public_key,omitempty"` // Optional: public key from frontend
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "missing required fields: wallet_address, signature, and payload are required"})
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

		// Validate signature and payload
		if req.Signature == "" {
			c.JSON(400, gin.H{"error": "signature is required"})
			return
		}

		if req.Payload == "" {
			c.JSON(400, gin.H{"error": "payload is required"})
			return
		}

		// Validate TonConnect signature (max age: 20 minutes - increased for time sync issues)
		ctx := c.Request.Context()
		if err := validator.ValidateSignature(ctx, walletAddress, req.Signature, req.Payload, 20*time.Minute, req.PublicKey); err != nil {
			log.Printf("❌ TonConnect signature validation failed for %s: %v", walletAddress, err)
			// Return detailed error message
			c.JSON(401, gin.H{
				"error": fmt.Sprintf("signature validation failed: %v", err),
				"details": err.Error(),
			})
			return
		}

		// Create or get user
		user, err := service.LoginOrRegister(ctx, walletAddress)
		if err != nil {
			log.Printf("Failed to login/register user %s: %v", walletAddress, err)
			c.JSON(500, gin.H{"error": "failed to create user session"})
			return
		}

		// Create session in Redis (24 hour TTL)
		sessionToken, err := generateSessionToken()
		if err != nil {
			log.Printf("Failed to generate session token: %v", err)
			c.JSON(500, gin.H{"error": "failed to create session"})
			return
		}

		sessionKey := fmt.Sprintf("session:%s", sessionToken)
		sessionData := map[string]interface{}{
			"wallet_address": walletAddress,
			"user_id":        user.WalletAddress,
			"created_at":     time.Now().Unix(),
			"last_access":    time.Now().Unix(),
		}

		// Store session in Redis with 24 hour TTL
		if redisClient != nil {
			if err := redisClient.HSet(ctx, sessionKey, sessionData).Err(); err != nil {
				log.Printf("Failed to store session in Redis: %v", err)
				// Continue even if Redis fails - user is still logged in
			} else {
				// Set expiration
				if err := redisClient.Expire(ctx, sessionKey, 24*time.Hour).Err(); err != nil {
					log.Printf("Failed to set session expiration: %v", err)
				}
			}
		}

		// Return user data with session token
		c.JSON(200, gin.H{
			"user":          user,
			"session_token": sessionToken,
			"expires_in":    86400, // 24 hours in seconds
		})
	}
}

// generateSessionToken generates a secure random session token
func generateSessionToken() (string, error) {
	bytes := make([]byte, 32) // 256 bits
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random token: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}

