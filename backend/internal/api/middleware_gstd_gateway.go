package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// RequireGSTDBalance middleware: API-as-a-Service — No tokens = no API, CTA to become Node
// MinBalanceGSTD: minimum required for API access (e.g. 0.01)
func RequireGSTDBalance(db *sql.DB, minBalanceGSTD float64) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "wallet required",
				"code":    "AUTH_REQUIRED",
				"cta":     "connect_wallet",
				"message": "Connect your wallet to access the API",
			})
			c.Abort()
			return
		}

		var balance float64
		err := db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1
		`, wallet).Scan(&balance)
		if err != nil {
			// User might not exist — treat as 0 balance
			balance = 0
		}

		if balance < minBalanceGSTD {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"error":    "insufficient_gstd_balance",
				"code":     "PAYMENT_REQUIRED",
				"balance":  balance,
				"required": minBalanceGSTD,
				"cta":      "become_node",
				"message":  "Insufficient GSTD balance. Top up your wallet or become a Node to earn GSTD.",
				"actions": []map[string]string{
					{"action": "become_node", "label": "Become a Node", "url": "/dashboard?mode=producer"},
					{"action": "buy_gstd", "label": "Buy GSTD", "url": "/wallet/buy-gstd"},
				},
			})
			c.Abort()
			return
		}

		c.Set("gstd_balance", balance)
		c.Next()
	}
}
