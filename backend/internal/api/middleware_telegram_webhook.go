package api

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// telegramWebhookSecretMiddleware enforces TELEGRAM_WEBHOOK_SECRET when set (Telegram sends it in
// X-Telegram-Bot-Api-Secret-Token; query secret_token is supported as fallback).
func telegramWebhookSecretMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		secret := strings.TrimSpace(os.Getenv("TELEGRAM_WEBHOOK_SECRET"))
		if secret == "" {
			c.Next()
			return
		}
		hdr := strings.TrimSpace(c.GetHeader("X-Telegram-Bot-Api-Secret-Token"))
		if hdr == "" {
			hdr = strings.TrimSpace(c.Query("secret_token"))
		}
		if len(hdr) != len(secret) || subtle.ConstantTimeCompare([]byte(hdr), []byte(secret)) != 1 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook secret"})
			c.Abort()
			return
		}
		c.Next()
	}
}
