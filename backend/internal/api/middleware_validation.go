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
func isValidTONAddress(address string) bool {
	if address == "" {
		return false
	}
	
	// TON addresses start with 0: or EQ and are 48 characters
	// Basic validation
	if len(address) < 10 || len(address) > 48 {
		return false
	}
	
	// Check for valid TON address prefixes
	validPrefixes := []string{"0:", "EQ", "UQ", "kQ", "0Q"}
	for _, prefix := range validPrefixes {
		if strings.HasPrefix(address, prefix) {
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

