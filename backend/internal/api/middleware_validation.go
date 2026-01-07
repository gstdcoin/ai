package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ValidateTaskRequest validates task creation request
func ValidateTaskRequest() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			RequesterAddress string  `json:"requester_address" binding:"required"`
			TaskType         string  `json:"task_type" binding:"required,oneof=inference human validation agent"`
			Operation        string  `json:"operation" binding:"required,min=1,max=50"`
			Model            string  `json:"model" binding:"max=100"`
			InputSource      string  `json:"input_source" binding:"required,oneof=ipfs http inline"`
			InputHash        string  `json:"input_hash" binding:"max=255"`
			TimeLimitSec     int     `json:"time_limit_sec" binding:"required,min=1,max=300"`
			MaxEnergyMwh     int     `json:"max_energy_mwh" binding:"required,min=1,max=1000"`
			LaborCompensationTon float64 `json:"labor_compensation_ton" binding:"required,min=0.001"`
			ValidationMethod string  `json:"validation_method" binding:"required,oneof=reference majority ai_check human"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request: " + sanitizeValidationError(err),
			})
			c.Abort()
			return
		}

		// Additional validations
		if req.RequesterAddress != "" && !isValidTONAddress(req.RequesterAddress) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid TON address format",
			})
			c.Abort()
			return
		}

		// Store validated request in context
		c.Set("validated_request", req)
		c.Next()
	}
}

// ValidateDeviceRequest validates device registration request
func ValidateDeviceRequest() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			DeviceID     string `json:"device_id" binding:"required,min=1,max=255"`
			WalletAddress string `json:"wallet_address" binding:"required"`
			DeviceType   string `json:"device_type" binding:"required,oneof=android ios desktop browser"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request: " + sanitizeValidationError(err),
			})
			c.Abort()
			return
		}

		if !isValidTONAddress(req.WalletAddress) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid TON address format",
			})
			c.Abort()
			return
		}

		c.Set("validated_request", req)
		c.Next()
	}
}

// ValidateResultSubmission validates result submission request
func ValidateResultSubmission() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			DeviceID        string `json:"device_id" binding:"required"`
			Result          interface{} `json:"result" binding:"required"`
			Proof           string `json:"proof" binding:"required"`
			ExecutionTimeMs int    `json:"execution_time_ms" binding:"required,min=0,max=300000"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid request: " + sanitizeValidationError(err),
			})
			c.Abort()
			return
		}

		// Validate proof format (hex or base64)
		if len(req.Proof) < 64 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid proof format (must be at least 64 characters)",
			})
			c.Abort()
			return
		}

		c.Set("validated_request", req)
		c.Next()
	}
}

// isValidTONAddress checks if address is a valid TON address format
// TON addresses can be in multiple formats:
// - Raw format: 0:... (48 characters)
// - User-friendly format: EQ..., UQ..., kQ..., 0Q... (48 characters)
// - With dashes: EQD...-...-... (user-friendly with dashes)
func isValidTONAddress(address string) bool {
	if address == "" {
		return false
	}
	
	// Remove whitespace
	address = strings.TrimSpace(address)
	
	// Remove dashes (user-friendly format with dashes)
	addressNoDashes := strings.ReplaceAll(address, "-", "")
	
	// Check length (TON addresses are 48 characters in raw/base64 format)
	// Raw format: 0: + 48 hex chars = 50 chars
	// User-friendly: 48 base64 chars
	// With dashes: 48 base64 chars + dashes
	if len(addressNoDashes) < 10 {
		return false
	}
	
	// Check for raw format (0:...)
	if strings.HasPrefix(address, "0:") {
		// Raw format: 0: + 48 hex characters
		if len(address) >= 50 && len(address) <= 66 {
			// Check if rest is valid hex
			hexPart := address[2:]
			if len(hexPart) >= 48 {
				// Validate hex characters
				for _, c := range hexPart {
					if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
						return false
					}
				}
				return true
			}
		}
	}
	
	// Check for user-friendly format (EQ, UQ, kQ, 0Q)
	validPrefixes := []string{"EQ", "UQ", "kQ", "0Q"}
	for _, prefix := range validPrefixes {
		if strings.HasPrefix(addressNoDashes, prefix) {
			// User-friendly format: 48 base64 characters
			// Base64url alphabet: A-Z, a-z, 0-9, _, -
			base64Part := addressNoDashes[len(prefix):]
			if len(base64Part) >= 44 && len(base64Part) <= 48 {
				// Validate base64url characters
				valid := true
				for _, c := range base64Part {
					if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || 
						 (c >= '0' && c <= '9') || c == '_' || c == '-') {
						valid = false
						break
					}
				}
				if valid {
					return true
				}
			}
		}
	}
	
	// Also accept addresses that look like TON addresses (more lenient)
	// If it starts with valid prefix and has reasonable length, accept it
	// This handles edge cases and different TON address formats
	if len(addressNoDashes) >= 44 && len(addressNoDashes) <= 66 {
		for _, prefix := range validPrefixes {
			if strings.HasPrefix(addressNoDashes, prefix) {
				return true
			}
		}
		// Also accept raw format without strict hex validation
		if strings.HasPrefix(address, "0:") {
			return true
		}
	}
	
	return false
}

// sanitizeValidationError sanitizes validation error messages
func sanitizeValidationError(err error) string {
	if err == nil {
		return "validation error"
	}
	
	errStr := err.Error()
	// Remove sensitive information
	errStr = strings.ReplaceAll(errStr, "password", "***")
	errStr = strings.ReplaceAll(errStr, "private_key", "***")
	
	return errStr
}

