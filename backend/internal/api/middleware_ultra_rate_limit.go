package api

import (
	"fmt"
	"time"

	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// Ultra API Tiering — Sovereign Dawn: APIKey with Ultra gets 10x rate limit
const (
	ultraRateLimitBase    = 60                    // req/min for standard
	ultraRateLimitMultiplier = 10                 // 10x for Ultra
	ultraRateLimitWindow  = time.Minute
)

// UltraRateLimitMiddleware applies rate limiting to chat. Ultra (APIKey + balance) gets 10x allowance.
func UltraRateLimitMiddleware(redisClient *redis.Client, omni *services.OmniPerformanceService) gin.HandlerFunc {
	if redisClient == nil {
		return func(c *gin.Context) { c.Next() }
	}
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		limit := ultraRateLimitBase

		// Check if Ultra (APIKey + sufficient GSTD)
		uc := GetUserContext(c)
		if uc != nil && uc.WalletAddress != "" && (uc.AuthSource == "api_key" || uc.AuthSource == "sovereign") {
			if omni != nil {
				access, err := omni.CheckUltraAccess(ctx, uc.WalletAddress)
				if err == nil && access.Allowed {
					limit = ultraRateLimitBase * ultraRateLimitMultiplier
				}
			}
		}

		key := "rate_limit:chat:" + c.ClientIP()
		if uc != nil && uc.WalletAddress != "" {
			key = "rate_limit:chat:" + uc.WalletAddress
		}

		count, err := redisClient.Get(ctx, key).Int()
		if err != nil && err != redis.Nil {
			c.Next()
			return
		}

		if count >= limit {
			c.JSON(429, gin.H{
				"error":   "Rate limit exceeded",
				"limit":   limit,
				"window":  ultraRateLimitWindow.String(),
				"message": "Upgrade to Ultra for 10x higher limits",
			})
			c.Abort()
			return
		}

		pipe := redisClient.Pipeline()
		pipe.Incr(ctx, key)
		pipe.Expire(ctx, key, ultraRateLimitWindow)
		if _, err := pipe.Exec(ctx); err != nil {
			c.Next()
			return
		}

		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
		c.Next()
	}
}
