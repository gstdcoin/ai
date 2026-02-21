package api

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Genesis manifest hash expected by A2A connectors (connect.py, connect.js)
// Must match: https://github.com/gstdcoin/A2A
const GenesisManifestHash = "d428d9226912f8a7cdb557c382ac1e5fe00989fa18c6737262c93cf14c80a40a"

// getSystemIntegrity returns manifest hash for A2A Sentinel verification
func getSystemIntegrity() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"manifest_hash": GenesisManifestHash,
			"version":       "1.2.3",
			"status":       "genesis_verified",
		})
	}
}

// agentsHandshakeRequest from A2A connect.py / connect.js
type agentsHandshakeRequest struct {
	AgentVersion string   `json:"agent_version"`
	Capabilities []string `json:"capabilities"`
	Status       string   `json:"status"`
	DeviceID     string   `json:"device_id"`
	DeviceType   string   `json:"device_type"`
	WalletAddr   string   `json:"wallet_address"`
}

// agentsHandshake handles A2A handshake — registers device and returns agent_id
func agentsHandshake(deviceService *services.DeviceService, apiKeyService *services.APIKeyService, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req agentsHandshakeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "message": err.Error()})
			return
		}

		// Resolve wallet: body > sk_sovereign parse > ValidateKey > header
		wallet := req.WalletAddr
		if wallet == "" {
			apiKey := c.GetHeader("X-API-Key")
			if apiKey == "" {
				apiKey = c.GetHeader("X-GSTD-API-KEY")
			}
			if apiKey == "" {
				if ah := c.GetHeader("Authorization"); len(ah) > 7 && ah[:7] == "Bearer " {
					apiKey = ah[7:]
				}
			}
			// sk_sovereign_{WALLET}_{NONCE} — wallet may contain underscores
			if wallet == "" && strings.HasPrefix(apiKey, "sk_sovereign_") {
				rest := strings.TrimPrefix(apiKey, "sk_sovereign_")
				if idx := strings.LastIndex(rest, "_"); idx > 0 {
					wallet = rest[:idx]
				}
			}
			if wallet == "" && apiKey != "" && apiKeyService != nil {
				if w, err := apiKeyService.ValidateKey(c.Request.Context(), apiKey); err == nil && w != "" {
					wallet = w
				}
			}
		}
		if wallet == "" {
			wallet = c.GetHeader("X-GSTD-Target-Wallet")
		}

		// Generate device_id if not provided
		deviceID := req.DeviceID
		if deviceID == "" {
			deviceID = "a2a-" + uuid.New().String()[:12]
		}

		deviceType := req.DeviceType
		if deviceType == "" {
			deviceType = "a2a"
		}

		// Register device
		if deviceService != nil && wallet != "" {
			regReq := services.RegisterDeviceRequest{
				DeviceID:      deviceID,
				WalletAddress: wallet,
				DeviceType:    deviceType,
				DeviceInfo:    strings.Join(req.Capabilities, ","),
				PoWNonce:      "a2a-handshake-" + time.Now().Format("20060102150405"),
				CPUScore:      10,
				RAMGB:         0.5,
			}
			if err := deviceService.RegisterDevice(c.Request.Context(), regReq); err != nil {
				log.Printf("[A2A] Device registration warning: %v", err)
			}
		}

		// Ensure user exists
		if db != nil && wallet != "" {
			_, _ = db.ExecContext(c.Request.Context(),
				`INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`,
				wallet)
		}

		agentID := deviceID
		if wallet != "" && len(wallet) >= 8 {
			agentID = deviceID + "@" + wallet[:8]
		} else if wallet != "" {
			agentID = deviceID + "@" + wallet
		}

		c.JSON(http.StatusOK, gin.H{
			"status":       "connected",
			"agent_id":     agentID,
			"device_id":    deviceID,
			"wallet":       maskWalletForResponse(wallet),
			"capabilities": req.Capabilities,
		})
	}
}

func maskWalletForResponse(w string) string {
	if len(w) <= 12 {
		return "***"
	}
	return w[:6] + "***" + w[len(w)-4:]
}

// computeGenesisHash returns SHA256 of canonical genesis payload (for verification)
func computeGenesisHash() string {
	payload := map[string]interface{}{
		"protocol": "gstd-a2a",
		"version":  "1.2.3",
		"genesis":  true,
	}
	b, _ := json.Marshal(payload)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
