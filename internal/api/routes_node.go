package api

import (
	"distributed-computing-platform/internal/services"
	leviathan "distributed-computing-platform/internal/services/leviathan"
	"fmt"
	"log"
	"strconv"
	"strings"
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
func registerNode(service *services.NodeService, geoService *services.GeoService, telegramService *services.TelegramService, referral *services.MultiLevelReferralService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Name         string                 `json:"name" binding:"required"`
			Specs        map[string]interface{} `json:"specs"`
			ReferralCode string                 `json:"referral_code"` // Hyper-Expansion: ref_XXX from Telegram (5% forever)
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

		// Hyper-Expansion: Ref-Link Deep Integration - apply referral after node created (user exists)
		if req.ReferralCode != "" && referral != nil {
			code := strings.TrimPrefix(req.ReferralCode, "ref_")
			if err := referral.ApplyReferralCode(c.Request.Context(), walletAddress, code); err == nil {
				log.Printf("NodeRegistration: Referral applied for worker %s (code=%s)", walletAddress[:16], code)
			}
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

// getPublicNodes retrieves public location data for all online nodes with pagination
func getPublicNodes(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

		nodes, err := service.GetPublicActiveNodes(c.Request.Context(), limit, offset)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"nodes": nodes})
	}
}

// UpdateHeartbeat handles worker heartbeat with battery, signal, and optional location.
// When lat/lon provided, node location is stored as H3 Resolution 6 index (Data Airlock).
func UpdateHeartbeat(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string  `json:"wallet"`
			NodeID        string  `json:"node_id"`
			Status        string  `json:"status"`
			Battery       int     `json:"battery"`
			Signal        int     `json:"signal"`
			Latitude      float64 `json:"latitude"`
			Longitude     float64 `json:"longitude"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		identifier := req.WalletAddress
		if identifier == "" && req.NodeID != "" {
			if node, err := service.GetNodeByID(c.Request.Context(), req.NodeID); err == nil && node != nil {
				identifier = node.WalletAddress
			} else {
				identifier = req.NodeID
			}
		}
		if identifier == "" {
			identifier = req.NodeID
		}
		if identifier == "" {
			c.JSON(400, gin.H{"error": "wallet or node_id required"})
			return
		}

		var lat, lon *float64
		if req.Latitude != 0 || req.Longitude != 0 {
			lat, lon = &req.Latitude, &req.Longitude
		}

		err := service.UpdateHealthStats(c.Request.Context(), identifier, req.Battery, req.Signal, lat, lon)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"status": "ok", "timestamp": time.Now().Unix()})
	}
}

// fleetCommand - Symbiotic Management: Group command for all nodes of a wallet
func fleetCommand(fleet *services.FleetCommandService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if fleet == nil {
			c.JSON(503, gin.H{"error": "fleet command service unavailable"})
			return
		}
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			wallet = c.Query("wallet_address")
		}
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet required"})
			return
		}
		var req struct {
			Action  string      `json:"action" binding:"required"`
			Payload interface{} `json:"payload"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		allowed := map[string]bool{"standby": true, "resume": true, "model": true, "update": true, "clean": true}
		if !allowed[req.Action] {
			c.JSON(400, gin.H{"error": "invalid action"})
			return
		}
		if err := fleet.SetCommand(c.Request.Context(), wallet, services.FleetCommand{Action: req.Action, Payload: req.Payload}); err != nil {
			c.JSON(500, gin.H{"error": "failed to set command"})
			return
		}
		c.JSON(200, gin.H{"status": "ok", "action": req.Action, "message": "Command queued for fleet delivery"})
	}
}

// maintenanceAlerts - Owner's Advocate AI: Predictive maintenance alerts for user's nodes
func maintenanceAlerts(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			wallet = c.Query("wallet_address")
		}
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet required"})
			return
		}
		alerts, err := service.GetMaintenanceAlerts(c.Request.Context(), wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"alerts": alerts})
	}
}

// activateWalletAsNode — Wallet-as-Node via Telegram: creates minimal node so wallet can claim tasks.
// POST /nodes/activate-wallet (session required)
// Body: { "source": "telegram" } — when from Telegram mining promo, feeds Leviathan for network learning.
func activateWalletAsNode(service *services.NodeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(401, gin.H{"error": "session required"})
			return
		}
		var req struct {
			Source string `json:"source"` // telegram, web — for growth/learning
		}
		_ = c.ShouldBindJSON(&req)
		node, activated, err := service.ActivateWalletAsNode(c.Request.Context(), wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		// Omnipresence: Mining vertical — network learns from Telegram mining activations
		if activated && req.Source == "telegram" {
			leviathan.RecordMiningGrowth("telegram_mining", "wallet_activation")
		}
		c.JSON(200, gin.H{
			"node_id":   node.ID,
			"activated": activated,
			"message":   "Wallet-as-Node active. You can claim tasks.",
		})
	}
}

// SetupNodeRoutes registers all node-related routes (for backward compat)
func SetupNodeRoutes(group *gin.RouterGroup, service *services.NodeService, geoService *services.GeoService, telegramService *services.TelegramService, referral *services.MultiLevelReferralService, fleetCommandService *services.FleetCommandService) {
	group.POST("/nodes/register", registerNode(service, geoService, telegramService, referral))
	group.POST("/nodes/activate-wallet", activateWalletAsNode(service))
	group.GET("/nodes/my", getMyNodes(service))
	group.GET("/nodes/public", getPublicNodes(service))
	group.POST("/nodes/heartbeat", UpdateHeartbeat(service))
	group.POST("/nodes/fleet/command", fleetCommand(fleetCommandService))
	group.GET("/nodes/maintenance-alerts", maintenanceAlerts(service))
}

// SetupNodeProtectedRoutes registers only the protected node endpoints (require session)
func SetupNodeProtectedRoutes(group *gin.RouterGroup, service *services.NodeService, geoService *services.GeoService, telegramService *services.TelegramService, referral *services.MultiLevelReferralService, fleetCommandService *services.FleetCommandService) {
	group.GET("/nodes/my", getMyNodes(service))
	group.POST("/nodes/fleet/command", fleetCommand(fleetCommandService))
	group.GET("/nodes/maintenance-alerts", maintenanceAlerts(service))
}
