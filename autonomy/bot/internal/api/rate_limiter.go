package api

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// RateLimiter provides rate limiting per endpoint
type RateLimiter struct {
	redisClient *redis.Client
	limits      map[string]*EndpointLimit
	mu          sync.RWMutex
}

// EndpointLimit defines rate limit for an endpoint
type EndpointLimit struct {
	Requests int
	Window   time.Duration
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(redisClient *redis.Client) *RateLimiter {
	rl := &RateLimiter{
		redisClient: redisClient,
		limits:      make(map[string]*EndpointLimit),
	}
	
	// Set default limits - generous for MVP/Demo to avoid 429s
	rl.limits["/api/v1/tasks"] = &EndpointLimit{Requests: 1000, Window: time.Minute}
	rl.limits["/api/v1/tasks/create"] = &EndpointLimit{Requests: 200, Window: time.Minute}
	rl.limits["/api/v1/devices/register"] = &EndpointLimit{Requests: 100, Window: time.Minute}
	rl.limits["/api/v1/admin"] = &EndpointLimit{Requests: 500, Window: time.Minute}
	rl.limits["/api/v1/users/balance"] = &EndpointLimit{Requests: 500, Window: time.Minute}
	rl.limits["/api/v1/network/stats"] = &EndpointLimit{Requests: 500, Window: time.Minute}
	
	// Telemetry/Genesis Task endpoints - stricter limits to prevent spam
	rl.limits["/api/v1/tasks/worker/submit"] = &EndpointLimit{Requests: 60, Window: time.Minute}    // 1 per second max
	rl.limits["/api/v1/device/tasks/:id/result"] = &EndpointLimit{Requests: 60, Window: time.Minute}
	rl.limits["/api/v1/telemetry/submit"] = &EndpointLimit{Requests: 30, Window: time.Minute}      // Stricter for raw telemetry
	
	return rl
}

// RateLimitMiddleware creates rate limiting middleware
func (rl *RateLimiter) RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.FullPath()
		if path == "" {
			c.Next()
			return
		}
		
		limit, exists := rl.limits[path]
		if !exists {
			c.Next()
			return
		}
		
		// Use IP address as key
		key := "rate_limit:" + c.ClientIP() + ":" + path
		
		// Check current count
		count, err := rl.redisClient.Get(c.Request.Context(), key).Int()
		if err != nil && err != redis.Nil {
			// If Redis error, allow request but log
			c.Next()
			return
		}
		
		if count >= limit.Requests {
			c.JSON(429, gin.H{
				"error": "Rate limit exceeded",
				"limit": limit.Requests,
				"window": limit.Window.String(),
			})
			c.Abort()
			return
		}
		
		// Increment counter
		pipe := rl.redisClient.Pipeline()
		pipe.Incr(c.Request.Context(), key)
		pipe.Expire(c.Request.Context(), key, limit.Window)
		_, _ = pipe.Exec(c.Request.Context())
		
		c.Next()
	}
}

// SetLimit sets rate limit for an endpoint
func (rl *RateLimiter) SetLimit(path string, requests int, window time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.limits[path] = &EndpointLimit{Requests: requests, Window: window}
}
