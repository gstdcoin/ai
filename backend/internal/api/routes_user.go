package api

import (
	"crypto/rand"
	"distributed-computing-platform/internal/services"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// SignatureData represents the signature structure from TonConnect
// The 'type' field is required by SDK but we default it to 'test-item' if not provided
type SignatureData struct {
	Signature string `json:"signature" binding:"required"`
	Type      string `json:"type"` // No binding:"required" - defaults to 'test-item' if empty
}

// ConnectPayload represents the connect_payload structure from frontend
// Signature can be either a string or an object with signature and optional type fields
type ConnectPayload struct {
	WalletAddress string      `json:"wallet_address" binding:"required"`
	Signature     interface{} `json:"signature"` // Can be string or SignatureData object (type field is optional)
	Payload       string      `json:"payload" binding:"required"`
	PublicKey     string      `json:"public_key,omitempty"`
}

// loginUser handles user login with TonConnect signature validation
func loginUser(service *services.UserService, validator *services.TonConnectValidator, redisClient *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			// New format: connect_payload object
			ConnectPayload *ConnectPayload `json:"connect_payload,omitempty"`
			// Old format: individual fields (for backward compatibility)
			WalletAddress string      `json:"wallet_address,omitempty"`
			Signature     interface{} `json:"signature,omitempty"` // Can be string or SignatureData object
			Payload       string      `json:"payload,omitempty"`
			PublicKey     string      `json:"public_key,omitempty"`
		}

		// Bind JSON to structured request
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ Failed to bind JSON request: %v", err)
			c.JSON(400, gin.H{"error": "missing required fields: wallet_address, signature, and payload are required"})
			return
		}

		// Log received payload for debugging
		log.Printf("📥 Received login payload: ConnectPayload=%v, WalletAddress=%s, Payload=%s, Signature type=%T", 
			req.ConnectPayload != nil, req.WalletAddress, req.Payload, req.Signature)
		
		if req.ConnectPayload != nil {
			log.Printf("📦 connect_payload details: WalletAddress=%s, Payload=%s, Signature type=%T, PublicKey=%s",
				req.ConnectPayload.WalletAddress, req.ConnectPayload.Payload, req.ConnectPayload.Signature, req.ConnectPayload.PublicKey)
		}

		// Extract data from either connect_payload or individual fields
		var walletAddress, signatureStr, payload, publicKey string

		if req.ConnectPayload != nil {
			// Use connect_payload if provided
			walletAddress = req.ConnectPayload.WalletAddress
			payload = req.ConnectPayload.Payload
			publicKey = req.ConnectPayload.PublicKey

			// Handle signature - can be string or object
			switch sig := req.ConnectPayload.Signature.(type) {
			case string:
				signatureStr = sig
			case map[string]interface{}:
				if sigVal, ok := sig["signature"].(string); ok {
					signatureStr = sigVal
					// Type field: if empty, default to 'test-item' for validation
					typeVal, hasType := sig["type"].(string)
					if !hasType || typeVal == "" {
						typeVal = "test-item"
						log.Printf("📝 Signature type field not provided or empty, defaulting to 'test-item'")
					} else {
						log.Printf("📝 Signature type field received: %s", typeVal)
					}
					// Type is logged but not used in signature validation
				} else {
					c.JSON(400, gin.H{"error": "invalid signature format in connect_payload"})
					return
				}
			default:
				// Try to unmarshal as JSON to SignatureData
				sigJSON, err := json.Marshal(sig)
				if err == nil {
					var sigData SignatureData
					if err := json.Unmarshal(sigJSON, &sigData); err == nil {
						signatureStr = sigData.Signature
						// Type field: if empty, default to 'test-item' for validation
						if sigData.Type == "" {
							sigData.Type = "test-item"
							log.Printf("📝 Signature type field not provided, defaulting to 'test-item'")
						} else {
							log.Printf("📝 Signature type field received: %s", sigData.Type)
						}
						// Type is logged but not used in signature validation
					} else {
						c.JSON(400, gin.H{"error": "signature must be a string or object with signature field"})
						return
					}
				} else {
					c.JSON(400, gin.H{"error": "signature must be a string or object with signature field"})
					return
				}
			}
		} else {
			// Use individual fields (backward compatibility)
			log.Printf("📦 Processing individual fields format (backward compatibility)")
			walletAddress = req.WalletAddress
			payload = req.Payload
			publicKey = req.PublicKey

			log.Printf("🔍 Signature type in individual fields: %T, value: %+v", req.Signature, req.Signature)

			// Handle signature - can be string or object
			switch sig := req.Signature.(type) {
			case string:
				log.Printf("✅ Signature is string format")
				signatureStr = sig
			case map[string]interface{}:
				log.Printf("✅ Signature is object format: %+v", sig)
				if sigVal, ok := sig["signature"].(string); ok {
					signatureStr = sigVal
					// Type field: if empty, default to 'test-item' for validation
					typeVal, hasType := sig["type"].(string)
					if !hasType || typeVal == "" {
						typeVal = "test-item"
						log.Printf("📝 Signature type field not provided or empty, defaulting to 'test-item'")
					} else {
						log.Printf("📝 Signature type field received: %s", typeVal)
					}
					// Type is logged but not used in signature validation
				} else {
					log.Printf("❌ Invalid signature format: missing 'signature' field")
					c.JSON(400, gin.H{"error": "invalid signature format: missing 'signature' field"})
					return
				}
			default:
				// Try to unmarshal as JSON to SignatureData
				sigJSON, err := json.Marshal(sig)
				if err == nil {
					var sigData SignatureData
					if err := json.Unmarshal(sigJSON, &sigData); err == nil {
						signatureStr = sigData.Signature
						// Type field: if empty, default to 'test-item' for validation
						if sigData.Type == "" {
							sigData.Type = "test-item"
							log.Printf("📝 Signature type field not provided, defaulting to 'test-item'")
						} else {
							log.Printf("📝 Signature type field received: %s", sigData.Type)
						}
						// Type is logged but not used in signature validation
					} else {
						c.JSON(400, gin.H{"error": "signature must be a string or object with signature field"})
						return
					}
				} else {
					c.JSON(400, gin.H{"error": "signature must be a string or object with signature field"})
					return
				}
			}
		}

		// Basic validation: check wallet address format
		walletAddress = strings.TrimSpace(walletAddress)
		if walletAddress == "" {
			c.JSON(400, gin.H{"error": "wallet_address cannot be empty"})
			return
		}

		// TON addresses are typically 48 characters (EQ/UQ/kQ/0Q + 44 base64 chars)
		// Allow some flexibility for raw format (0:...) but enforce minimum length
		if len(walletAddress) < 10 {
			c.JSON(400, gin.H{"error": "wallet_address has invalid length"})
			return
		}

		// Validate signature and payload
		if signatureStr == "" {
			c.JSON(400, gin.H{"error": "signature is required"})
			return
		}

		if payload == "" {
			c.JSON(400, gin.H{"error": "payload is required"})
			return
		}

		// Validate TonConnect signature (max age: 20 minutes - increased for time sync issues)
		ctx := c.Request.Context()
		if err := validator.ValidateSignature(ctx, walletAddress, signatureStr, payload, 20*time.Minute, publicKey); err != nil {
			log.Printf("❌ TonConnect signature validation failed for %s: %v", walletAddress, err)
			// Return detailed error message
			c.JSON(401, gin.H{
				"error":   fmt.Sprintf("signature validation failed: %v", err),
				"details": err.Error(),
			})
			return
		}

		// Create or get user
		user, err := service.LoginOrRegister(ctx, walletAddress)
		if err != nil {
			log.Printf("Failed to login/register user %s: %v", walletAddress, err)
			c.JSON(500, gin.H{"error": "failed to create user session"})
			return
		}

		// Create session in Redis (24 hour TTL)
		sessionToken, err := generateSessionToken()
		if err != nil {
			log.Printf("Failed to generate session token: %v", err)
			c.JSON(500, gin.H{"error": "failed to create session"})
			return
		}

		sessionKey := fmt.Sprintf("session:%s", sessionToken)
		sessionData := map[string]interface{}{
			"wallet_address": walletAddress,
			"user_id":        user.WalletAddress,
			"created_at":     time.Now().Unix(),
			"last_access":    time.Now().Unix(),
		}

		// Store session in Redis with 24 hour TTL
		if redisClient != nil {
			if err := redisClient.HSet(ctx, sessionKey, sessionData).Err(); err != nil {
				log.Printf("Failed to store session in Redis: %v", err)
				// Continue even if Redis fails - user is still logged in
			} else {
				// Set expiration
				if err := redisClient.Expire(ctx, sessionKey, 24*time.Hour).Err(); err != nil {
					log.Printf("Failed to set session expiration: %v", err)
				}
			}
		}

		// Return user data with session token
		c.JSON(200, gin.H{
			"user":          user,
			"session_token": sessionToken,
			"expires_in":    86400, // 24 hours in seconds
		})
	}
}

// generateSessionToken generates a secure random session token
func generateSessionToken() (string, error) {
	bytes := make([]byte, 32) // 256 bits
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random token: %w", err)
	}
	return hex.EncodeToString(bytes), nil
}
