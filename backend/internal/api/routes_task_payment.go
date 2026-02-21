package api

import (
	"distributed-computing-platform/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

func createTaskWithPayment(service *services.TaskPaymentService, rateLimiter *services.RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get creator wallet from query parameter or header
		creatorWallet := c.Query("wallet_address")
		if creatorWallet == "" {
			creatorWallet = c.GetHeader("X-Wallet-Address")
		}
		if creatorWallet == "" {
			c.JSON(400, gin.H{"error": "wallet_address is required (query parameter or X-Wallet-Address header)"})
			return
		}

		// Validate wallet address format
		if !isValidTONAddress(creatorWallet) {
			c.JSON(400, gin.H{"error": "Invalid wallet address format"})
			return
		}

		// Rate limiting: 10 tasks per minute per wallet
		if rateLimiter != nil && !rateLimiter.Allow(creatorWallet) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Maximum 10 tasks per minute per wallet.",
			})
			return
		}

		var req services.CreateTaskRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": SanitizeError(err)})
			return
		}

		// Validate budget
		if req.Budget <= 0 {
			c.JSON(400, gin.H{"error": "budget must be greater than 0"})
			return
		}

		response, err := service.CreateTask(c.Request.Context(), creatorWallet, req)
		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
		}

		c.JSON(200, response)
	}
}

