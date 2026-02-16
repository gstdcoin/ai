package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// SetupInfrastructureSupremacyRoutes registers API gateway status, become-node CTA
func SetupInfrastructureSupremacyRoutes(v1 *gin.RouterGroup, protected *gin.RouterGroup, db *sql.DB) {
	// Gateway status: check if wallet has enough GSTD for API access (for frontend CTA)
	protected.GET("/gateway/status", gatewayStatus(db))

	// Public: minimal info for unauthenticated users (become node CTA)
	v1.GET("/gateway/info", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"protocol":   "infrastructure_supremacy",
			"min_gstd":   0.01,
			"cta":        "become_node",
			"message":    "Connect wallet with GSTD to access API. No tokens? Become a Node to earn.",
			"dashboard":  "/dashboard",
			"buy_gstd":   "/wallet/buy-gstd",
		})
	})
}

func gatewayStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(http.StatusOK, gin.H{
				"api_available": false,
				"reason":        "wallet_required",
				"cta":           "connect_wallet",
				"balance":       0,
				"min_required":  0.01,
			})
			return
		}

		var balance float64
		_ = db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1
		`, wallet).Scan(&balance)

		minRequired := 0.01
		apiAvailable := balance >= minRequired

		c.JSON(http.StatusOK, gin.H{
			"api_available": apiAvailable,
			"balance":       balance,
			"min_required":  minRequired,
			"cta":           map[bool]string{true: "none", false: "become_node"}[apiAvailable],
			"message":       map[bool]string{true: "API access granted", false: "Top up GSTD or become a Node"}[apiAvailable],
		})
	}
}
