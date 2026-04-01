package api

import (
	"fmt"
	"log"
	"strings"

	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// HybridAuth — Unified Identity: transparently unifies Session (browser) and API Key (agents).
// Provides common UserContext with wallet_address and auth_source.
// Ultra rights are checked downstream (e.g. in gateway handler) when wallet is set.
func HybridAuth(redisClient *redis.Client, apiKeyService APIKeyValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		uc := &services.UserContext{}

		// 1. Try Session (browser users)
		sessionToken := c.GetHeader("X-Session-Token")
		if sessionToken == "" {
			sessionToken, _ = c.Cookie("session_token")
		}
		if sessionToken != "" && redisClient != nil {
			sessionKey := fmt.Sprintf("session:%s", sessionToken)
			exists, err := redisClient.Exists(ctx, sessionKey).Result()
			if err == nil && exists > 0 {
				walletAddress, _ := redisClient.HGet(ctx, sessionKey, "wallet_address").Result()
				if walletAddress != "" {
					uc.WalletAddress = walletAddress
					uc.AuthSource = "session"
					if userID, _ := redisClient.HGet(ctx, sessionKey, "user_id").Result(); userID != "" {
						uc.UserID = userID
					}
					c.Set("wallet_address", walletAddress)
					c.Set("user_context", uc)
					c.Next()
					return
				}
			}
		}

		// 2. Try API Key (agents)
		apiKey := c.GetHeader("X-GSTD-API-KEY")
		if apiKey == "" {
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				apiKey = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}
		if apiKey != "" {
			if strings.HasPrefix(apiKey, "sk_sovereign_") && redisClient != nil {
				if w, ok := walletFromRegisteredSovereignKey(ctx, redisClient, apiKey); ok {
					uc.WalletAddress = w
					uc.AuthSource = "sovereign"
					c.Set("wallet_address", w)
					c.Set("user_context", uc)
					log.Printf("🤖 HybridAuth: Sovereign agent %s", w[:min(8, len(w))])
					c.Next()
					return
				}
			}
			// Master keys
			cfg := config.GetConfig()
			if apiKey == cfg.Server.AdminAPIKey || (cfg.Server.AdminAPIKey2 != "" && apiKey == cfg.Server.AdminAPIKey2) {
				targetWallet := c.GetHeader("X-GSTD-Target-Wallet")
				if targetWallet == "" {
					targetWallet = "EQ_GENESIS_BOOTSTRAP_WALLET"
				}
				uc.WalletAddress = targetWallet
				uc.AuthSource = "api_key"
				c.Set("wallet_address", targetWallet)
				c.Set("user_context", uc)
				c.Next()
				return
			}
			// User API keys
			if apiKeyService != nil {
				if wallet, err := apiKeyService.ValidateKey(ctx, apiKey); err == nil && wallet != "" {
					targetWallet := c.GetHeader("X-GSTD-Target-Wallet")
					if targetWallet == "" {
						targetWallet = wallet
					}
					uc.WalletAddress = targetWallet
					uc.AuthSource = "api_key"
					c.Set("wallet_address", targetWallet)
					c.Set("user_context", uc)
					log.Printf("🤖 HybridAuth: Agent via API key %s", targetWallet[:min(8, len(targetWallet))])
					c.Next()
					return
				}
			}
		}

		// No auth — continue (optional auth, never abort)
		c.Set("user_context", uc)
		c.Next()
	}
}

// GetUserContext returns UserContext from gin context if set by HybridAuth.
func GetUserContext(c *gin.Context) *services.UserContext {
	if v, ok := c.Get("user_context"); ok {
		if uc, ok := v.(*services.UserContext); ok {
			return uc
		}
	}
	return nil
}
