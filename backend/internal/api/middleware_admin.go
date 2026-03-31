package api

import (
	"distributed-computing-platform/internal/config"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func normalizeTONAddr(addr string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(addr), "-", ""))
}

// RequireAdminWallet restricts routes to the configured admin TON wallet.
//
// Security: trusting only X-Wallet-Address (public knowledge from /api/v1/config) allowed
// anyone to call admin APIs with a valid non-admin session. We now require either:
// 1) Session/API context wallet_address (from ValidateSession) equals AdminWallet, or
// 2) Valid X-Admin-API-Key / Authorization: Bearer (same secret as /internal/*) for automation.
func RequireAdminWallet(tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		adminNorm := normalizeTONAddr(tonConfig.AdminWallet)
		if adminNorm == "" {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "admin wallet not configured"})
			c.Abort()
			return
		}

		// 1) Wallet bound by session / API key auth (cannot be spoofed with a header alone)
		if w := c.GetString("wallet_address"); w != "" {
			if normalizeTONAddr(w) == adminNorm {
				c.Set("admin_wallet", w)
				c.Next()
				return
			}
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Access denied. Admin routes require the admin wallet session.",
			})
			c.Abort()
			return
		}

		// 2) Server-to-server / cron: same key as internal routes
		key := c.GetHeader("X-Admin-API-Key")
		if key == "" {
			if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				key = strings.TrimPrefix(auth, "Bearer ")
			}
		}
		cfg := config.GetConfig()
		if key != "" && (key == cfg.Server.AdminAPIKey || (cfg.Server.AdminAPIKey2 != "" && key == cfg.Server.AdminAPIKey2)) {
			c.Set("admin_wallet", tonConfig.AdminWallet)
			c.Next()
			return
		}

		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "admin authentication required",
			"message": "Login as admin wallet, or send X-Admin-API-Key for automation",
		})
		c.Abort()
	}
}
