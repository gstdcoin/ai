package api

import (
	"os"

	"github.com/gin-gonic/gin"
)

// AdminAuth middleware validates admin access via X-Admin-Secret header
func AdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get admin secret from environment
		adminSecret := os.Getenv("ADMIN_SECRET")
		if adminSecret == "" {
			c.JSON(500, gin.H{"error": "Admin authentication not configured"})
			c.Abort()
			return
		}

		// Get secret from header
		providedSecret := c.GetHeader("X-Admin-Secret")
		if providedSecret == "" {
			c.JSON(401, gin.H{"error": "Missing X-Admin-Secret header"})
			c.Abort()
			return
		}

		// Compare secrets (constant-time comparison to prevent timing attacks)
		if !constantTimeCompare(providedSecret, adminSecret) {
			c.JSON(401, gin.H{"error": "Invalid admin secret"})
			c.Abort()
			return
		}

		// Authentication successful, continue
		c.Next()
	}
}

// constantTimeCompare performs a constant-time string comparison
// to prevent timing attacks
func constantTimeCompare(a, b string) bool {
	if len(a) != len(b) {
		return false
	}

	result := 0
	for i := 0; i < len(a); i++ {
		result |= int(a[i]) ^ int(b[i])
	}

	return result == 0
}

