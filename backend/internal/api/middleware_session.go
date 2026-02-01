package api

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"distributed-computing-platform/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// ValidateSession validates session token from Redis
// Session token can be provided in:
// 1. Cookie: "session_token"
// 2. Header: "X-Session-Token"
// 3. Query parameter: "session_token" (for backward compatibility, not recommended)
// sessionTTL is the session duration (e.g., 24*time.Hour)
func ValidateSession(redisClient *redis.Client, sessionTTL ...time.Duration) gin.HandlerFunc {
	// Default TTL is 24 hours
	ttl := 24 * time.Hour
	if len(sessionTTL) > 0 && sessionTTL[0] > 0 {
		ttl = sessionTTL[0]
	}
	
	return func(c *gin.Context) {
		// If Redis is not available, treat as authentication service failure
		if redisClient == nil {
			log.Printf("❌ ValidateSession: Redis client not available - authentication service unavailable")
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "authentication service unavailable",
				"message": "Please try again later",
			})
			c.Abort()
			return
		}

		ctx := c.Request.Context()

		// 1. Try to get session_token from cookie
		sessionToken, err := c.Cookie("session_token")
		if err != nil || sessionToken == "" {
			// 2. Try to get from header
			sessionToken = c.GetHeader("X-Session-Token")
			if sessionToken == "" {
				// 3. Try query parameter (for backward compatibility, not recommended)
				sessionToken = c.Query("session_token")
			}
		}

		if sessionToken == "" {
			// 4. Try Master API Key (for autonomous bots)
			apiKey := c.GetHeader("X-GSTD-API-KEY")
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				apiKey = strings.TrimPrefix(authHeader, "Bearer ")
			}

			masterKey := config.GetConfig().Server.AdminAPIKey
			if apiKey != "" && apiKey == masterKey {
				// Use a dedicated wallet for the Master Key or extract from header
				targetWallet := c.GetHeader("X-GSTD-Target-Wallet")
				if targetWallet == "" {
					targetWallet = "EQ_GENESIS_BOOTSTRAP_WALLET" // Default
				}
				c.Set("wallet_address", targetWallet)
				c.Next()
				return
			}

			log.Printf("❌ ValidateSession: No session token provided for path: %s", c.Request.URL.Path)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "session token required",
				"message": "Please login or provide a valid API Key (Bearer token) to access this resource",
			})
			c.Abort()
			return
		}

		// Check session in Redis
		sessionKey := fmt.Sprintf("session:%s", sessionToken)
		exists, err := redisClient.Exists(ctx, sessionKey).Result()
		if err != nil {
			log.Printf("❌ ValidateSession: Redis error checking session: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "session validation failed",
				"message": "Unable to validate session, please try again",
			})
			c.Abort()
			return
		}

		if exists == 0 {
			log.Printf("❌ ValidateSession: Session not found or expired: %s", sessionToken[:min(8, len(sessionToken))])
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired session",
				"message": "Your session has expired, please login again",
			})
			c.Abort()
			return
		}

		// Update last_access timestamp and extend TTL (Sliding Session)
		pipe := redisClient.Pipeline()
		pipe.HSet(ctx, sessionKey, "last_access", time.Now().Unix())
		pipe.Expire(ctx, sessionKey, ttl)  // Use configurable TTL
		if _, err := pipe.Exec(ctx); err != nil {
			log.Printf("⚠️  ValidateSession: Failed to update session stats: %v", err)
			// Continue anyway - not critical
		}

		// Get wallet_address from session
		walletAddress, err := redisClient.HGet(ctx, sessionKey, "wallet_address").Result()
		if err == nil && walletAddress != "" {
			c.Set("wallet_address", walletAddress)
			log.Printf("✅ ValidateSession: Session validated for wallet: %s", walletAddress[:min(8, len(walletAddress))])
		} else {
			log.Printf("⚠️  ValidateSession: Could not get wallet_address from session: %v", err)
		}

		// Get user_id from session
		userID, err := redisClient.HGet(ctx, sessionKey, "user_id").Result()
		if err == nil && userID != "" {
			c.Set("user_id", userID)
		}

		c.Next()
	}
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
