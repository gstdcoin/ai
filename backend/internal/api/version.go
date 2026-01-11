package api

import (
	"github.com/gin-gonic/gin"
)

const (
	APIVersion = "v1"
	APIVersionHeader = "X-API-Version"
)

// APIVersionMiddleware adds API version header to responses
func APIVersionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header(APIVersionHeader, APIVersion)
		c.Next()
	}
}

// GetAPIVersion returns current API version
func GetAPIVersion() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"version": APIVersion,
			"endpoints": gin.H{
				"health": "/api/v1/health",
				"metrics": "/api/v1/metrics",
				"openapi": "/api/v1/openapi.json",
				"tasks": "/api/v1/tasks",
				"devices": "/api/v1/devices",
				"stats": "/api/v1/stats",
			},
		})
	}
}
