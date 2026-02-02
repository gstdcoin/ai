package api

import (
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// registerNode registers a new computing node
// @Summary Register node
// @Description Register a new computing node for the wallet
// @Tags Nodes
// @Accept json
// @Produce json
// @Security SessionToken
// @Param request body object true "Node registration request" example({"name":"My Node","specs":{"cpu":"Intel i7","ram":16}})
// @Success 200 {object} models.Node "Node registered successfully"
// @Failure 400 {object} map[string]string "Invalid request"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /nodes/register [post]
// registerNode registers a new computing node
func registerNode(service *services.NodeService, geoService *services.GeoService, telegramService *services.TelegramService) gin.HandlerFunc {
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

		// Extract GPS coordinates
		var lat, lon *float64
		if specs, ok := req.Specs["location"].(map[string]interface{}); ok {
			if l, ok := specs["lat"].(float64); ok {
				lat = &l
			}
			if l, ok := specs["lng"].(float64); ok {
				lon = &l
			}
		}

		// Determine country by IP (non-blocking, continue if fails)
		var country *string
		if geoService != nil && ipAddress != "" {
			countryCode, err := geoService.GetCountryByIP(c.Request.Context(), ipAddress)
			if err != nil {
				log.Printf("⚠️  Failed to determine country for IP %s: %v", ipAddress, err)
			} else if countryCode != "" {
				country = &countryCode
				log.Printf("✅ Determined country for node registration: %s (IP: %s)", countryCode, ipAddress)
			}
		}

		// GPS Spoofing check
		isSpoofing := false
		if lat != nil && lon != nil && geoService != nil {
			existingNode, err := service.GetNodeByWalletAddress(c.Request.Context(), walletAddress)
			if err == nil && existingNode != nil && existingNode.Latitude != nil && existingNode.Longitude != nil {
				timeDiff := time.Since(existingNode.UpdatedAt)
				spoofingDetected, speed := geoService.CheckSpoofing(*existingNode.Latitude, *existingNode.Longitude, *lat, *lon, timeDiff)
				if spoofingDetected {
					isSpoofing = true
					log.Printf("🚨 SPOOFING DETECTED for worker %s: Speed %.2f km/h", walletAddress, speed)
					
					// Send Telegram Alert
					if telegramService != nil && telegramService.IsEnabled() {
						alertMsg := fmt.Sprintf("⚠️ Внимание! Воркер [%s] замечен в подмене GPS. Доступ заблокирован. (Скорость: %.2f км/ч)", 
							walletAddress, speed)
						telegramService.SendMessage(c.Request.Context(), alertMsg)
					}
				}
			}
		}

		node, err := service.RegisterNode(c.Request.Context(), walletAddress, req.Name, req.Specs, country, lat, lon, isSpoofing)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, node)
	}
}

// getMyNodes retrieves all nodes owned by the authenticated user
// @Summary Get my nodes
// @Description Get list of all nodes registered by the authenticated wallet
// @Tags Nodes
// @Produce json
// @Security SessionToken
// @Success 200 {object} map[string]interface{} "List of nodes"
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /nodes/my [get]
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

// getPublicNodes retrieves public location data for all online nodes
func getPublicNodes(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		nodes, err := service.GetPublicActiveNodes(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"nodes": nodes})
	}
}

// UpdateHeartbeat handles worker heartbeat with battery and signal info
func UpdateHeartbeat(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string `json:"wallet"`  // Frontend uses this
			NodeID        string `json:"node_id"` // A2A SDK uses this
			Status        string `json:"status"`  // A2A SDK uses this
			Battery       int    `json:"battery"`
			Signal        int    `json:"signal"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Normalize identifier
		identifier := req.WalletAddress
		if identifier == "" {
			identifier = req.NodeID
		}
		if identifier == "" {
			c.JSON(400, gin.H{"error": "wallet or node_id required"})
			return
		}

		err := service.UpdateHealthStats(c.Request.Context(), identifier, req.Battery, req.Signal)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"status": "ok", "timestamp": time.Now().Unix()})
	}
}

// SetupNodeRoutes registers node-related routes
func SetupNodeRoutes(group *gin.RouterGroup, service *services.NodeService, geoService *services.GeoService, telegramService *services.TelegramService) {
	group.POST("/nodes/register", registerNode(service, geoService, telegramService))
	group.GET("/nodes/my", getMyNodes(service))
	group.GET("/nodes/public", getPublicNodes(service))
	group.POST("/nodes/heartbeat", UpdateHeartbeat(service))
}

