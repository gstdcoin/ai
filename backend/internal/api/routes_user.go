package api

import (
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

func loginUser(service *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string `json:"wallet_address" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		user, err := service.LoginOrRegister(c.Request.Context(), req.WalletAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}

		c.JSON(200, user)
	}
}

