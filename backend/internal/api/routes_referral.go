package api

import (
	"distributed-computing-platform/internal/services"
	"log"
	
	"github.com/gin-gonic/gin"
)

// getReferralStats retrieves referral statistics for the user
// @Summary Get referral stats
// @Description Get referral code, total referrals, and earnings
// @Tags Referrals
// @Produce json
// @Security SessionToken
// @Success 200 {object} services.ReferralStats
// @Failure 401 {object} map[string]string "Unauthorized"
// @Router /referrals/stats [get]
func getReferralStats(referralService *services.ReferralService, userService *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletRaw, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		walletAddress := walletRaw.(string)

		userID, err := userService.GetUserID(c.Request.Context(), walletAddress)
		if err != nil {
			log.Printf("Failed to resolve user ID for wallet %s: %v", walletAddress, err)
			c.JSON(500, gin.H{"error": "Failed to resolve user"})
			return
		}

		stats, err := referralService.GetUserStats(c.Request.Context(), userID)
		if err != nil {
			log.Printf("Failed to get referral stats: %v", err)
			c.JSON(500, gin.H{"error": "Failed to get stats"})
			return
		}

		c.JSON(200, stats)
	}
}

// applyReferralCode applies a referral code to the current user
// @Summary Apply referral code
// @Description Link user to a referrer using a code
// @Tags Referrals
// @Accept json
// @Produce json
// @Security SessionToken
// @Param request body object true "Referral code" example({"code":"abc12345"})
// @Success 200 {object} map[string]string "Success"
// @Failure 400 {object} map[string]string "Invalid code or already referred"
// @Router /referrals/apply [post]
func applyReferralCode(referralService *services.ReferralService, userService *services.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletRaw, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "Unauthorized"})
			return
		}
		walletAddress := walletRaw.(string)

		var req struct {
			Code string `json:"code" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "referral code is required"})
			return
		}

		userID, err := userService.GetUserID(c.Request.Context(), walletAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to resolve user"})
			return
		}

		err = referralService.ApplyReferralCode(c.Request.Context(), userID, req.Code)
		if err != nil {
			// Determine if it's a "known" logic error or internal
			// Simple heuristics for now
			errMsg := err.Error()
			if errMsg == "invalid referral code" || errMsg == "cannot refer yourself" || errMsg == "already has a referrer" {
				c.JSON(400, gin.H{"error": errMsg})
			} else {
				log.Printf("Error applying referral code: %v", err)
				c.JSON(500, gin.H{"error": "Internal server error"})
			}
			return
		}

		c.JSON(200, gin.H{"message": "Referral code applied successfully"})
	}
}
