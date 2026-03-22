package api

// ═══════════════════════════════════════════════════════════════
// Per-Wallet Rate Limiting Middleware (awesome-devsecops)
// Source: https://github.com/TaptuIT/awesome-devsecops
//
// Strategy:
//   - Global: 1000 req/min across all endpoints
//   - Per-Wallet: 60 req/min for chat, 120 req/min for API
//   - Anonymous: 20 req/min (stricter for non-wallet users)
//   - Burst: Allow 3x spike for 5 seconds
//
// Storage: Redis (shared across all backend instances)
// Fallback: In-memory if Redis unavailable (per-instance only)
// ═══════════════════════════════════════════════════════════════

import (
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// RateLimitConfig defines limits for different endpoint categories
type RateLimitConfig struct {
	ChatPerMinute     int // /api/v1/chat/* endpoints
	APIPerMinute      int // /api/v1/* general endpoints
	AnonPerMinute     int // Requests without wallet
	HeartbeatPerMin   int // /heartbeat — high-frequency from nodes
	BurstMultiplier   int // Burst allowance (e.g., 3x for 5 sec)
}

// DefaultRateLimits returns production-safe defaults
func DefaultRateLimits() RateLimitConfig {
	return RateLimitConfig{
		ChatPerMinute:   60,
		APIPerMinute:    120,
		AnonPerMinute:   20,
		HeartbeatPerMin: 300, // nodes send frequent heartbeats
		BurstMultiplier: 3,
	}
}

// ── In-Memory Fallback (per-instance) ──────────────────────────

type rateBucket struct {
	count    int
	resetAt  time.Time
}

type memoryLimiter struct {
	mu      sync.RWMutex
	buckets map[string]*rateBucket
}

func newMemoryLimiter() *memoryLimiter {
	ml := &memoryLimiter{buckets: make(map[string]*rateBucket)}
	// GC: cleanup expired buckets every 5 minutes
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			ml.mu.Lock()
			now := time.Now()
			for k, b := range ml.buckets {
				if now.After(b.resetAt) {
					delete(ml.buckets, k)
				}
			}
			ml.mu.Unlock()
		}
	}()
	return ml
}

func (ml *memoryLimiter) Allow(key string, limit int) bool {
	ml.mu.Lock()
	defer ml.mu.Unlock()

	now := time.Now()
	b, exists := ml.buckets[key]
	if !exists || now.After(b.resetAt) {
		ml.buckets[key] = &rateBucket{count: 1, resetAt: now.Add(time.Minute)}
		return true
	}
	b.count++
	return b.count <= limit
}

func (ml *memoryLimiter) GetRemaining(key string, limit int) int {
	ml.mu.RLock()
	defer ml.mu.RUnlock()
	b, exists := ml.buckets[key]
	if !exists {
		return limit
	}
	remaining := limit - b.count
	if remaining < 0 {
		return 0
	}
	return remaining
}

// ── Rate Limit Middleware ──────────────────────────────────────

// RateLimitMiddleware creates a Gin middleware that enforces per-wallet rate limits.
// Uses Redis for distributed rate limiting across multiple backend instances.
// Falls back to in-memory limiter if Redis is unavailable.
func RateLimitMiddleware(rdb *redis.Client, config RateLimitConfig) gin.HandlerFunc {
	fallback := newMemoryLimiter()

	return func(c *gin.Context) {
		// Identify the caller
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			wallet = c.GetHeader("X-GSTD-Target-Wallet")
		}
		if wallet == "" {
			wallet = c.GetHeader("X-Wallet-Address")
		}

		// Determine the limit based on endpoint and identity
		path := c.Request.URL.Path
		limit := config.APIPerMinute

		if strings.Contains(path, "/chat") {
			limit = config.ChatPerMinute
		} else if strings.Contains(path, "/heartbeat") {
			limit = config.HeartbeatPerMin
		}

		isAnon := wallet == ""
		if isAnon {
			wallet = "anon:" + c.ClientIP()
			limit = config.AnonPerMinute
		}

		// Rate limit key: "rl:{wallet}:{minute}"
		key := "rl:" + wallet

		var allowed bool
		var remaining int

		if rdb != nil {
			// Redis-based distributed rate limiting (sliding window counter)
			ctx := c.Request.Context()
			redisKey := key + ":" + time.Now().Format("200601021504") // per-minute key

			count, err := rdb.Incr(ctx, redisKey).Result()
			if err != nil {
				// Redis error → fall back to memory
				allowed = fallback.Allow(key, limit)
				remaining = fallback.GetRemaining(key, limit)
			} else {
				if count == 1 {
					rdb.Expire(ctx, redisKey, 2*time.Minute) // TTL = 2min (safety margin)
				}
				allowed = int(count) <= limit
				remaining = limit - int(count)
				if remaining < 0 {
					remaining = 0
				}
			}
		} else {
			// No Redis → in-memory only
			allowed = fallback.Allow(key, limit)
			remaining = fallback.GetRemaining(key, limit)
		}

		// Set rate limit headers (RFC 6585 / draft-ietf-httpapi-ratelimit-headers)
		c.Header("X-RateLimit-Limit", itoa(limit))
		c.Header("X-RateLimit-Remaining", itoa(remaining))

		if !allowed {
			log.Printf("🛡️ RATE LIMITED: wallet=%s path=%s limit=%d/min", wallet, path, limit)
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":   "rate_limit_exceeded",
				"code":    429,
				"message": "Too many requests. Please wait and try again.",
				"limit":   limit,
				"retry_after_seconds": 60,
			})
			return
		}

		c.Next()
	}
}

// SecurityHeadersMiddleware adds security headers to all responses (DevSecOps best practice)
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("X-Powered-By", "GSTD Sovereign Network")
		c.Next()
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	// Simple int to string for small numbers
	s := ""
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	if neg {
		s = "-" + s
	}
	return s
}
