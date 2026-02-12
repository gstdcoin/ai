package api

import (
	"net/http"
	"strings"

	"distributed-computing-platform/internal/config"

	"github.com/gin-gonic/gin"
)

// RequireAdminAPIKey checks X-Admin-API-Key or Authorization: Bearer <key>
// for internal/cron endpoints. No session or wallet required.
func RequireAdminAPIKey() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-Admin-API-Key")
		if key == "" {
			if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				key = strings.TrimPrefix(auth, "Bearer ")
			}
		}
		cfg := config.GetConfig()
		if key == "" || key != cfg.Server.AdminAPIKey {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "X-Admin-API-Key required",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
