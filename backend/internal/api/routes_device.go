package api

import (
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
)

func registerDevice(deviceService *services.DeviceService, errorLogger *services.ErrorLogger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		
		// Get validated request from middleware
		validatedReq, exists := c.Get("validated_request")
		if !exists {
			// Fallback: try to bind directly
			var req services.RegisterDeviceRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				log.Printf("DeviceRegistration: Failed to bind JSON - %v", err)
				if errorLogger != nil {
					errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
						"error_type": "JSON_BIND_ERROR",
						"error":      err.Error(),
					})
				}
				c.JSON(400, gin.H{"error": "Invalid request: " + err.Error()})
				return
			}
			
			// Log device registration attempt
			log.Printf("DeviceRegistration: Attempting to register device - DeviceID: %s, WalletAddress: %s, DeviceType: %s", 
				req.DeviceID, req.WalletAddress, req.DeviceType)
			
			// Validate DeviceID format
			if req.DeviceID == "" {
				err := fmt.Errorf("device_id is required")
				log.Printf("DeviceRegistration: %v", err)
				if errorLogger != nil {
					errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
						"error_type":     "MISSING_DEVICE_ID",
						"wallet_address": req.WalletAddress,
						"device_type":    req.DeviceType,
					})
				}
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			
			if len(req.DeviceID) > 255 {
				err := fmt.Errorf("device_id exceeds maximum length of 255 characters")
				log.Printf("DeviceRegistration: %v - DeviceID length: %d", err, len(req.DeviceID))
				if errorLogger != nil {
					errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
						"error_type":     "INVALID_DEVICE_ID_LENGTH",
						"device_id":      req.DeviceID[:50] + "...", // Log first 50 chars
						"device_id_len":  len(req.DeviceID),
						"wallet_address": req.WalletAddress,
					})
				}
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			
			// Validate wallet address using middleware function
			// Note: isValidTONAddress is in middleware_validation.go
			// We'll do a simple check here and let the service handle validation
			
			if err := deviceService.RegisterDevice(ctx, req); err != nil {
				log.Printf("DeviceRegistration: Failed to register device - DeviceID: %s, Error: %v", req.DeviceID, err)
				if errorLogger != nil {
					errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityError, map[string]interface{}{
						"error_type":     "REGISTRATION_FAILED",
						"device_id":      req.DeviceID,
						"wallet_address": req.WalletAddress,
						"device_type":    req.DeviceType,
						"error":          err.Error(),
					})
				}
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			
			log.Printf("DeviceRegistration: Successfully registered device - DeviceID: %s, WalletAddress: %s", 
				req.DeviceID, req.WalletAddress)
			c.JSON(200, gin.H{"message": "Device registered successfully"})
			return
		}
		
		// Use validated request from middleware
		req := validatedReq.(struct {
			DeviceID      string `json:"device_id"`
			WalletAddress string `json:"wallet_address"`
			DeviceType    string `json:"device_type"`
		})
		
		// Log device registration attempt
		log.Printf("DeviceRegistration: Attempting to register device (validated) - DeviceID: %s, WalletAddress: %s, DeviceType: %s", 
			req.DeviceID, req.WalletAddress, req.DeviceType)
		
		// Validate DeviceID format
		if req.DeviceID == "" {
			err := fmt.Errorf("device_id is required")
			log.Printf("DeviceRegistration: %v", err)
			if errorLogger != nil {
				errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
					"error_type":     "MISSING_DEVICE_ID",
					"wallet_address": req.WalletAddress,
					"device_type":    req.DeviceType,
				})
			}
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		
		if len(req.DeviceID) > 255 {
			err := fmt.Errorf("device_id exceeds maximum length of 255 characters")
			log.Printf("DeviceRegistration: %v - DeviceID length: %d", err, len(req.DeviceID))
			if errorLogger != nil {
				errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityWarning, map[string]interface{}{
					"error_type":     "INVALID_DEVICE_ID_LENGTH",
					"device_id":      req.DeviceID[:50] + "...", // Log first 50 chars
					"device_id_len":  len(req.DeviceID),
					"wallet_address": req.WalletAddress,
				})
			}
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		
		registerReq := services.RegisterDeviceRequest{
			DeviceID:      req.DeviceID,
			WalletAddress: req.WalletAddress,
			DeviceType:    req.DeviceType,
		}
		
		if err := deviceService.RegisterDevice(ctx, registerReq); err != nil {
			log.Printf("DeviceRegistration: Failed to register device (validated) - DeviceID: %s, Error: %v", req.DeviceID, err)
			if errorLogger != nil {
				errorLogger.LogError(ctx, "DEVICE_REGISTRATION_ERROR", err, services.SeverityError, map[string]interface{}{
					"error_type":     "REGISTRATION_FAILED",
					"device_id":      req.DeviceID,
					"wallet_address": req.WalletAddress,
					"device_type":    req.DeviceType,
					"error":          err.Error(),
				})
			}
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		log.Printf("DeviceRegistration: Successfully registered device (validated) - DeviceID: %s, WalletAddress: %s", 
			req.DeviceID, req.WalletAddress)
		c.JSON(200, gin.H{"message": "Device registered successfully"})
	}
}

func getMyDevices(deviceService *services.DeviceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddress := c.Query("wallet_address")
		if walletAddress == "" {
			c.JSON(400, gin.H{"error": "wallet_address parameter is required"})
			return
		}

		devices, err := deviceService.GetDevicesByWallet(c.Request.Context(), walletAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"devices": devices})
	}
}

func getAvailableTasks(assignmentService *services.AssignmentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID := c.Query("device_id")
		if deviceID == "" {
			c.JSON(400, gin.H{"error": "device_id parameter is required"})
			return
		}

		limit := 10
		if l := c.Query("limit"); l != "" {
			fmt.Sscanf(l, "%d", &limit)
		}

		tasks, err := assignmentService.GetAvailableTasks(c.Request.Context(), deviceID, limit)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"tasks": tasks})
	}
}

func claimTask(assignmentService *services.AssignmentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		deviceID := c.Query("device_id")
		if deviceID == "" {
			c.JSON(400, gin.H{"error": "device_id parameter is required"})
			return
		}

		if err := assignmentService.ClaimTask(c.Request.Context(), taskID, deviceID); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Task claimed successfully"})
	}
}

func submitResult(resultService *services.ResultService, validationService *services.ValidationService) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		var req services.SubmitResultRequest
		req.TaskID = taskID

		if err := c.ShouldBindBodyWith(&req, binding.JSON); err != nil {
			log.Printf("submitResult: Binding error: %v", err)
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		if err := resultService.SubmitResult(c.Request.Context(), req, validationService); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"message": "Result submitted successfully"})
	}
}

func getTaskResult(resultService *services.ResultService) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		requesterAddress := c.Query("requester_address")
		if requesterAddress == "" {
			c.JSON(400, gin.H{"error": "requester_address parameter is required"})
			return
		}

		result, err := resultService.GetResult(c.Request.Context(), taskID, requesterAddress)
		if err != nil {
			c.JSON(404, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"result": result})
	}
}

