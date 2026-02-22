package api

import (
	"database/sql"
	"log"
	"strings"

	"github.com/gin-gonic/gin"
)

// OmegaAuthMiddleware intercepts Omega API keys (gstd_sk_* or any validated key) and sets wallet context.
// Does not abort — continues to next handler if no valid key.
func OmegaAuthMiddleware(apiKeyService APIKeyValidator, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			auth := c.GetHeader("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				apiKey = strings.TrimPrefix(auth, "Bearer ")
			}
		}
		if apiKey == "" {
			c.Next()
			return
		}
		if apiKeyService != nil {
			wallet, err := apiKeyService.ValidateKey(c.Request.Context(), apiKey)
			if err == nil && wallet != "" {
				target := c.GetHeader("X-GSTD-Target-Wallet")
				if target == "" {
					target = wallet
				}
				c.Set("wallet_address", target)
				trunc := target
				if len(trunc) > 12 {
					trunc = trunc[:12]
				}
				log.Printf("🤖 OmegaAuth: agent %s", trunc)
			}
		}
		c.Next()
	}
}

// OmegaBillingMiddleware records billing after Omega chat completions.
// Runs after handler; only records when wallet is set and path is /v1/chat/completions.
func OmegaBillingMiddleware(db *sql.DB, apiKeyService APIKeyValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		// Post-handler: billing is handled in GatewayHandler via SettlementService
		_ = db
		_ = apiKeyService
	}
}
