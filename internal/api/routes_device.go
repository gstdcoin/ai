package api

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"
	"strings"

	"github.com/gin-gonic/gin"
)

func registerDevice(deviceService *services.DeviceService, errorLogger *services.ErrorLogger, referral *services.MultiLevelReferralService, db *sql.DB, gaslessUser *services.GaslessUserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		var req services.RegisterDeviceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("DeviceRegistration: Failed to bind JSON - %v", err)
			c.JSON(400, gin.H{"error": "Invalid request: " + err.Error()})
			return
		}

		// Hyper-Expansion: Ref-Link Deep Integration - ensure user exists, apply referral from Telegram start=ref_XXX
		// Gasless User: try subsidy for new wallet (first-time device registration)
		if req.WalletAddress != "" {
			var existed int
			_ = db.QueryRowContext(ctx, `SELECT 1 FROM users WHERE wallet_address = $1`, req.WalletAddress).Scan(&existed)
			_, _ = db.ExecContext(ctx, `INSERT INTO users (wallet_address, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, req.WalletAddress)
			if existed == 0 && gaslessUser != nil {
				go func() {
					gaslessUser.TrySubsidizeOnboarding(context.Background(), req.WalletAddress)
				}()
			}
			if req.ReferralCode != "" && referral != nil {
				code := strings.TrimPrefix(req.ReferralCode, "ref_")
				if err := referral.ApplyReferralCode(ctx, req.WalletAddress, code); err == nil {
					log.Printf("DeviceRegistration: Referral applied for worker %s (code=%s)", req.WalletAddress[:16], code)
				}
			}
		}

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
			if w, ok := c.Get("wallet_address"); ok && w != "" {
				walletAddress = w.(string)
			}
		}
		if walletAddress == "" {
			c.JSON(400, gin.H{"error": "wallet_address required"})
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

// getTasksPending returns pending tasks for agents (API key auth). Uses wallet from session.
// Alias for GET /api/v1/tasks/pending — device_id derived from wallet.
func getTasksPending(assignmentService *services.AssignmentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet, _ := c.Get("wallet_address")
		walletStr, _ := wallet.(string)
		if walletStr == "" || len(walletStr) < 8 {
			c.JSON(400, gin.H{"error": "wallet_address required (use API key or session)"})
			return
		}
		suffix := walletStr
		if len(walletStr) > 8 {
			suffix = walletStr[:8]
		}
		deviceID := "autonomous-" + suffix
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

func claimTask(assignmentService *services.AssignmentService, deviceService *services.DeviceService) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("id")
		deviceID := c.Query("device_id")
		if deviceID == "" {
			var body struct {
				DeviceID string `json:"device_id"`
			}
			if err := c.ShouldBindJSON(&body); err == nil && body.DeviceID != "" {
				deviceID = body.DeviceID
			}
		}
		walletStr := ""
		if w, ok := c.Get("wallet_address"); ok {
			if ws, ok := w.(string); ok {
				walletStr = ws
			}
		}
		if deviceID == "" && len(walletStr) >= 8 {
			deviceID = "autonomous-" + walletStr[:8]
		}
		if deviceID == "" {
			c.JSON(400, gin.H{"error": "device_id required (query, JSON body, or API key wallet)"})
			return
		}

		// Register autonomous device so ResultService can resolve wallet for payout
		if deviceService != nil && strings.HasPrefix(deviceID, "autonomous-") && walletStr != "" {
			_ = deviceService.RegisterDevice(c.Request.Context(), services.RegisterDeviceRequest{
				DeviceID:      deviceID,
				WalletAddress: walletStr,
				DeviceType:    "a2a",
				PoWNonce:      "claim-" + taskID,
			})
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
		// Fallback device_id for autonomous agents (from wallet)
		if req.DeviceID == "" {
			if w, ok := c.Get("wallet_address"); ok {
				if ws, ok := w.(string); ok && len(ws) >= 8 {
					req.DeviceID = "autonomous-" + ws[:8]
				}
			}
		}

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
