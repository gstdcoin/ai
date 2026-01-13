package api

import (
	"distributed-computing-platform/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

func registerNode(service *services.NodeService, geoService *services.GeoService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Name  string                 `json:"name" binding:"required"`
			Specs map[string]interface{} `json:"specs"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Get wallet address from query parameter or header
		walletAddress := c.Query("wallet_address")
		if walletAddress == "" {
			// Try to get from header
			walletAddress = c.GetHeader("X-Wallet-Address")
		}
		if walletAddress == "" {
			c.JSON(400, gin.H{"error": "wallet_address is required (query parameter or X-Wallet-Address header)"})
			return
		}

		// Get IP address from request
		ipAddress := c.ClientIP()
		if ipAddress == "" {
			ipAddress = c.RemoteIP()
		}

		// Determine country by IP (non-blocking, continue if fails)
		var country *string
		if geoService != nil && ipAddress != "" {
			countryCode, err := geoService.GetCountryByIP(c.Request.Context(), ipAddress)
			if err != nil {
				log.Printf("⚠️  Failed to determine country for IP %s: %v", ipAddress, err)
				// Continue without country - not critical
			} else if countryCode != "" {
				country = &countryCode
				log.Printf("✅ Determined country for node registration: %s (IP: %s)", countryCode, ipAddress)
			}
		}

		node, err := service.RegisterNode(c.Request.Context(), walletAddress, req.Name, req.Specs, country)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, node)
	}
}

func getMyNodes(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddress := c.Query("wallet_address")
		if walletAddress == "" {
			// Try to get from header
			walletAddress = c.GetHeader("X-Wallet-Address")
		}
		if walletAddress == "" {
			c.JSON(400, gin.H{"error": "wallet_address is required (query parameter or X-Wallet-Address header)"})
			return
		}

		nodes, err := service.GetMyNodes(c.Request.Context(), walletAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"nodes": nodes})
	}
}

