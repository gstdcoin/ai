package api

import (
	"database/sql"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// DB circuit breaker: when connections >= 90% of max, block non-critical routes (stats, history)
// Critical routes (payouts, claims, results) always pass.
const dbCircuitThresholdPercent = 90

var (
	dbCircuitLastCheck time.Time
	dbCircuitTripped   bool
	dbCircuitMu        sync.RWMutex
)

// Critical path prefixes that bypass circuit breaker (Payouts, Task Claims, Results)
var criticalPathPrefixes = []string{
	"/api/v1/device/tasks/",      // claim, result
	"/api/v1/payments/",          // payout-intent
	"/api/v1/users/claim_balance",
	"/api/v1/orchestrator/claim",
	"/api/v1/marketplace/tasks/", // claim, complete, payout
	"/internal/",                 // admin
	"/api/v1/sovereign/",         // OpenClaw, paid inference
	"/api/v1/auth/",
	"/api/v1/genesis/",
	"/health",
	"/api/v1/pipeline/",
}

// DBCircuitBreaker returns middleware that returns 503 for non-critical routes when DB is overloaded.
func DBCircuitBreaker(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		// Critical paths always pass
		for _, prefix := range criticalPathPrefixes {
			if strings.HasPrefix(path, prefix) || path == prefix {
				c.Next()
				return
			}
		}

		// Check connection pool (throttle checks to every 2s)
		dbCircuitMu.Lock()
		now := time.Now()
		if now.Sub(dbCircuitLastCheck) < 2*time.Second {
			tripped := dbCircuitTripped
			dbCircuitMu.Unlock()
			if tripped {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"error":   "service_temporarily_unavailable",
					"message": "Database under load. Critical operations (payouts, claims) remain active. Retry shortly.",
				})
				c.Abort()
				return
			}
			c.Next()
			return
		}
		dbCircuitLastCheck = now
		dbCircuitMu.Unlock()

		stats := db.Stats()
		maxOpen := 250 // Match database.go SetMaxOpenConns
		threshold := int(float64(maxOpen) * float64(dbCircuitThresholdPercent) / 100)
		tripped := stats.OpenConnections >= threshold

		dbCircuitMu.Lock()
		dbCircuitTripped = tripped
		dbCircuitMu.Unlock()

		if tripped {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "service_temporarily_unavailable",
				"message": "Database under load. Critical operations (payouts, claims) remain active. Retry shortly.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
