package api

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

type TelegramLaunchRequest struct {
	TaskID       string  `json:"task_id"`
	StarsPaid    int     `json:"stars_paid"`
	RewardGSTD   float64 `json:"reward_gstd"`
	AdminFeeGSTD float64 `json:"admin_fee_gstd"`
}

func setupMonitorRoutes(router *gin.RouterGroup, _ *services.TaskService, telegramService *services.TelegramService, _ *sql.DB) {
	router.POST("/tasks/telegram-launch", func(c *gin.Context) {
		var req TelegramLaunchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request body"})
			return
		}

		wallet := c.GetString("wallet_address")
		if wallet == "" {
			wallet = c.GetHeader("X-GSTD-Target-Wallet")
			if wallet == "" {
				wallet = "platform_monitor"
			}
		}

		log.Printf("🚀 [Monitor] Requesting invoice for task %s via Telegram Stars (Amount: %d ⭐️)", req.TaskID, req.StarsPaid)

		taskID := req.TaskID
		if taskID == "" {
			taskID = fmt.Sprintf("signal-%d", time.Now().Unix())
		}

		// Create invoice link via Telegram API
		payload := fmt.Sprintf("monitor_launch:%s:%s:%.2f", taskID, wallet, req.RewardGSTD)
		link, err := telegramService.CreateInvoiceLinkWithStars(c.Request.Context(),
			"Verify Global Signal",
			fmt.Sprintf("Sponsor Swarm Analysis for %s", taskID),
			payload,
			req.StarsPaid,
		)
		if err != nil {
			log.Printf("❌ [Monitor] Invoice error: %v", err)
			c.JSON(500, gin.H{"error": "Failed to create invoice"})
			return
		}

		c.JSON(200, gin.H{
			"status":      "success",
			"invoice_url": link,
			"task_id":     taskID,
		})
	})
}
