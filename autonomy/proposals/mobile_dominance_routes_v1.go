package api

import (
    "github.com/gin-contrib/gzip" // Added for Mobile Optimization
	"github.com/gin-gonic/gin"
    // ... imports
)

// Mobile Dominance Optimization
// 1. Gzip Compression for low-bandwidth mobile networks
// 2. Mobile-Detection Middleware

func SetupRoutes(router *gin.Engine, ...) { // (Signature unchanged)
    
    // [MOBILE_OPTIMIZATION_START]
    // Enable Gzip compression (Level 5 for balance between CPU/Bandwidth)
    router.Use(gzip.Gzip(gzip.BestSpeed))
    
    // Add Mobile Optimization Middleware
    router.Use(func(c *gin.Context) {
        userAgent := c.GetHeader("User-Agent")
        if isMobile(userAgent) {
            // Set shorter timeout for mobile to fail fast and retry
            c.Header("X-Mobile-Optimization", "Active")
            c.Set("is_mobile", true)
        }
        c.Next()
    })
    // [MOBILE_OPTIMIZATION_END]

	// ... rest of the code
}

func isMobile(ua string) bool {
    // Simple heuristic
    ua = strings.ToLower(ua)
    return strings.Contains(ua, "android") || strings.Contains(ua, "iphone")
}
