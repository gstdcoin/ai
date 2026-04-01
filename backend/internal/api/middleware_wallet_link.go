package api

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// RequireWalletLinkOrSession ensures wallet linking is not anonymous:
// either X-Wallet-Link-Secret matches WALLET_LINK_SECRET (node OS / backend jobs),
// or OptionalSession has already set wallet_address (browser after TonConnect).
func RequireWalletLinkOrSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		secret := strings.TrimSpace(os.Getenv("WALLET_LINK_SECRET"))
		hdr := strings.TrimSpace(c.GetHeader("X-Wallet-Link-Secret"))
		if secret != "" && len(hdr) == len(secret) && subtle.ConstantTimeCompare([]byte(hdr), []byte(secret)) == 1 {
			c.Set("wallet_link_trust", "secret")
			c.Next()
			return
		}
		if w := c.GetString("wallet_address"); w != "" {
			c.Set("wallet_link_trust", "session")
			c.Next()
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "WALLET_LINK_SECRET (header X-Wallet-Link-Secret) or authenticated session required",
			"hint":  "Configure WALLET_LINK_SECRET for Node OS, or send X-Session-Token after login",
		})
		c.Abort()
	}
}
