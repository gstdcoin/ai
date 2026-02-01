package api

import (
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"

	"github.com/gin-gonic/gin"
)

func registerDevice(deviceService *services.DeviceService, errorLogger *services.ErrorLogger) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		
		var req services.RegisterDeviceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("DeviceRegistration: Failed to bind JSON - %v", err)
			c.JSON(400, gin.H{"error": "Invalid request: " + err.Error()})
			return
		}
		
		// Log device registration attempt
		log.Printf("DeviceRegistration: Attempting to register device - DeviceID: %s, WalletAddress: %s, DeviceType: %s", 
			req.DeviceID, req.WalletAddress, req.DeviceType)
		
		if err := deviceService.RegisterDevice(ctx, req); err != nil {
			log.Printf("DeviceRegistration: Failed to register device - Error: %v", err)
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		
		log.Printf("DeviceRegistration: Successfully registered device - DeviceID: %s", req.DeviceID)
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
		
        // Using a map to bind flexible JSON
        var req services.SubmitResultRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("submitResult: Binding error: %v", err)
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
        req.TaskID = taskID

		if err := resultService.SubmitResult(c.Request.Context(), req, validationService); err != nil {
			log.Printf("submitResult: Error: %v", err)
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

func getMyTasks(assignmentService *services.AssignmentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		deviceID := c.Query("device_id")
		if deviceID == "" {
			c.JSON(400, gin.H{"error": "device_id parameter is required"})
			return
		}

		tasks, err := assignmentService.GetTasksByDevice(c.Request.Context(), deviceID)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, gin.H{"tasks": tasks})
	}
}
