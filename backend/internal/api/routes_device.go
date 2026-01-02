package api

import (
	"distributed-computing-platform/internal/services"
	"fmt"

	"github.com/gin-gonic/gin"
)

func registerDevice(deviceService *services.DeviceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req services.RegisterDeviceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		if err := deviceService.RegisterDevice(c.Request.Context(), req); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

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

		if err := c.ShouldBindJSON(&req); err != nil {
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

