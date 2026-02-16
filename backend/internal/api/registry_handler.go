package api

import (
	"context"
	"database/sql"
	"log"
	"strings"

	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
)

// RegistryJoinRequest — Unified Identity: flexible payload for /registry/join
type RegistryJoinRequest struct {
	// Common
	WalletAddress     string                 `json:"wallet_address"`
	ReferralCode      string                 `json:"referral_code"`
	Source            string                 `json:"source"` // swarm, browser, telegram, agent, desktop
	PlatformFingerprint string               `json:"platform_fingerprint"`

	// Node-style (agents, swarm, desktop)
	Name  string                 `json:"name"`
	Specs map[string]interface{} `json:"specs"`

	// Device-style (browser, mobile)
	DeviceID   string  `json:"device_id"`
	DeviceType string  `json:"device_type"` // browser, android, ios, desktop, swarm, telegram
	DeviceInfo string  `json:"device_info"`
	PoWNonce   string  `json:"pow_nonce"`
	CPUScore   int     `json:"cpu_score"`
	RAMGB      float64 `json:"ram_gb"`
	PublicKey  string  `json:"public_key"`
}

// RegistryJoinResponse — unified response
type RegistryJoinResponse struct {
	Type       string      `json:"type"`        // "node" | "device"
	ID         string      `json:"id"`           // node_id or device_id
	Wallet     string      `json:"wallet"`
	Message    string      `json:"message"`
	Registered interface{} `json:"registered,omitempty"`
}

// RegistryJoin — Unified Identity: single endpoint merging nodes + devices
// POST /api/v1/registry/join
// Auto-detects node type from metadata (specs.type, device_type, source)
func RegistryJoin(
	nodeService *services.NodeService,
	deviceService *services.DeviceService,
	geoService *services.GeoService,
	telegramService *services.TelegramService,
	referral *services.MultiLevelReferralService,
	db *sql.DB,
	gaslessUser *services.GaslessUserService,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		var req RegistryJoinRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Invalid request: " + err.Error()})
			return
		}

		// Wallet: body > query > header
		wallet := strings.TrimSpace(req.WalletAddress)
		if wallet == "" {
			wallet = c.Query("wallet_address")
		}
		if wallet == "" {
			wallet = c.GetHeader("X-Wallet-Address")
		}
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet_address is required (body, query, or X-Wallet-Address header)"})
			return
		}

		// Ensure user exists
		_, _ = db.ExecContext(ctx, `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, wallet)
		if gaslessUser != nil {
			var existed int
			_ = db.QueryRowContext(ctx, `SELECT 1 FROM users WHERE wallet_address = $1`, wallet).Scan(&existed)
			if existed == 0 {
				go gaslessUser.TrySubsidizeOnboarding(context.Background(), wallet)
			}
		}
		if req.ReferralCode != "" && referral != nil {
			code := strings.TrimPrefix(req.ReferralCode, "ref_")
			if err := referral.ApplyReferralCode(ctx, wallet, code); err == nil {
				log.Printf("RegistryJoin: Referral applied for %s (code=%s)", wallet[:min(16, len(wallet))], code)
			}
		}

		// Detect node type from metadata
		nodeType := services.NodeTypeFromMetadata(req.Specs, req.DeviceType, req.Source)
		if nodeType == "unknown" {
			// Heuristic: has name+specs with capabilities → node; has device_type → device
			if req.Name != "" && req.Specs != nil && (req.Specs["capabilities"] != nil || req.Specs["type"] != nil) {
				nodeType = "node"
			} else if req.DeviceType != "" || req.DeviceID != "" {
				nodeType = "device"
			} else {
				// Default: node for API-key callers (agents), device for browser
				nodeType = "node"
			}
		}

		// Route to appropriate registration
		if nodeType == "device" {
			// Device registration
			deviceID := services.NormalizeDeviceID(wallet, req.PlatformFingerprint, req.DeviceID)
			if deviceID == "" {
				// Build fingerprint from metadata if not provided
				fp := services.PlatformFingerprintFromMetadata(
					req.DeviceType,
					getString(req.Specs, "hostname"),
					getString(req.Specs, "os"),
					c.GetHeader("User-Agent"),
				)
				deviceID = services.NormalizeDeviceID(wallet, fp, req.DeviceID)
			}
			if deviceID == "" {
				deviceID = req.DeviceID
			}
			if deviceID == "" {
				c.JSON(400, gin.H{"error": "device_id or platform_fingerprint required for device registration"})
				return
			}
			dt := req.DeviceType
			if dt == "" {
				dt = "desktop"
			}
			supported := map[string]bool{"browser": true, "android": true, "ios": true, "desktop": true, "telegram": true, "swarm": true}
			if !supported[strings.ToLower(dt)] {
				dt = "desktop"
			}
			powNonce := req.PoWNonce
			if len(powNonce) < 5 {
				powNonce = "gstd_registry_join"
			}
			devReq := services.RegisterDeviceRequest{
				DeviceID:      deviceID,
				WalletAddress: wallet,
				DeviceType:    dt,
				DeviceInfo:    req.DeviceInfo,
				PoWNonce:      powNonce,
				CPUScore:      req.CPUScore,
				RAMGB:         req.RAMGB,
				PublicKey:     req.PublicKey,
				ReferralCode:  req.ReferralCode,
			}
			if err := deviceService.RegisterDevice(ctx, devReq); err != nil {
				log.Printf("RegistryJoin: Device registration failed: %v", err)
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			log.Printf("RegistryJoin: Device registered %s (device_id=%s)", wallet[:min(8, len(wallet))], deviceID[:min(16, len(deviceID))])
			c.JSON(200, RegistryJoinResponse{
				Type:    "device",
				ID:      deviceID,
				Wallet:  wallet,
				Message: "Device registered successfully",
			})
			return
		}

		// Node registration
		name := req.Name
		if name == "" {
			short := wallet
			if len(short) > 12 {
				short = short[:6] + "..." + short[len(short)-6:]
			}
			name = "Node-" + short
		}
		specs := req.Specs
		if specs == nil {
			specs = make(map[string]interface{})
		}
		if req.DeviceType != "" {
			specs["type"] = req.DeviceType
		}
		if req.PlatformFingerprint != "" {
			specs["platform_fingerprint"] = req.PlatformFingerprint
		}

		ipAddress := c.ClientIP()
		if ipAddress == "" {
			ipAddress = c.RemoteIP()
		}
		var country *string
		if geoService != nil && ipAddress != "" {
			if cc, err := geoService.GetCountryByIP(ctx, ipAddress); err == nil && cc != "" {
				country = &cc
			}
		}
		var lat, lon *float64
		if specs != nil {
			if loc, ok := specs["location"].(map[string]interface{}); ok {
				if l, ok := loc["lat"].(float64); ok {
					lat = &l
				}
				if l, ok := loc["lng"].(float64); ok {
					lon = &l
				}
			}
		}
		isSpoofing := false
		if lat != nil && lon != nil && geoService != nil {
			if existing, err := nodeService.GetNodeByWalletAddress(ctx, wallet); err == nil && existing != nil && existing.Latitude != nil && existing.Longitude != nil {
				if spoofed, _ := geoService.CheckSpoofing(*existing.Latitude, *existing.Longitude, *lat, *lon, 0); spoofed {
					isSpoofing = true
					if telegramService != nil && telegramService.IsEnabled() {
						telegramService.SendMessage(ctx, "⚠️ GPS spoofing detected for worker "+wallet[:12])
					}
				}
			}
		}

		node, err := nodeService.RegisterNode(ctx, wallet, name, specs, country, lat, lon, isSpoofing)
		if err != nil {
			log.Printf("RegistryJoin: Node registration failed: %v", err)
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		log.Printf("RegistryJoin: Node registered %s (node_id=%s)", wallet[:min(8, len(wallet))], node.ID)
		c.JSON(200, RegistryJoinResponse{
			Type:       "node",
			ID:         node.ID,
			Wallet:     wallet,
			Message:    "Node registered successfully",
			Registered: node,
		})
	}
}

func getString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

// RegistryLegacyCheck — Sovereign Dawn: check if user has legacy devices (device_id not gstd_*)
// GET /api/v1/registry/legacy-check?wallet_address=EQ...
func RegistryLegacyCheck(deviceService *services.DeviceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet_address")
		if wallet == "" {
			wallet = c.GetHeader("X-Wallet-Address")
		}
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet_address required"})
			return
		}
		devices, err := deviceService.GetDevicesByWallet(c.Request.Context(), wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		var legacyCount int
		for _, d := range devices {
			did, _ := d["device_id"].(string)
			if did != "" && !services.IsUnifiedDeviceID(did) {
				legacyCount++
			}
		}
		c.JSON(200, gin.H{
			"has_legacy":   legacyCount > 0,
			"legacy_count": legacyCount,
		})
	}
}
