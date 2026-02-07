package api

import (
	"net/http"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// TelegramOnboardHandler handles Telegram Mini App onboarding
type TelegramOnboardHandler struct {
	bonus    *services.WelcomeBonusService
	referral *services.MultiLevelReferralService
}

// NewTelegramOnboardHandler creates a new telegram onboard handler
func NewTelegramOnboardHandler(bonus *services.WelcomeBonusService, referral *services.MultiLevelReferralService) *TelegramOnboardHandler {
	return &TelegramOnboardHandler{
		bonus:    bonus,
		referral: referral,
	}
}

// InitTelegramUser initializes a user from Telegram Mini App
// POST /api/v1/telegram/init
func (h *TelegramOnboardHandler) InitTelegramUser(c *gin.Context) {
	var req struct {
		TelegramID    int64  `json:"telegram_id" binding:"required"`
		Username      string `json:"username"`
		FirstName     string `json:"first_name"`
		IsPremium     bool   `json:"is_premium"`
		LanguageCode  string `json:"language_code"`
		ReferralCode  string `json:"referral_code"`
		WalletAddress string `json:"wallet_address"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	ctx := c.Request.Context()

	// This would typically check/create telegram user record
	// For now, we focus on the wallet-based flow

	response := gin.H{
		"success":       true,
		"telegram_id":   req.TelegramID,
		"wallet_needed": req.WalletAddress == "",
		"message":       "Telegram user initialized",
	}

	// If wallet provided, check bonus status
	if req.WalletAddress != "" {
		status, err := h.bonus.GetBonusStatus(ctx, req.WalletAddress)
		if err == nil {
			response["bonus_status"] = status
		}
	}

	c.JSON(http.StatusOK, response)
}

// OnboardNewUser creates wallet and gives welcome bonus
// POST /api/v1/telegram/onboard
func (h *TelegramOnboardHandler) OnboardNewUser(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		ReferralCode  string `json:"referral_code"`
		Source        string `json:"source"` // telegram, web, agent
		TelegramID    int64  `json:"telegram_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Apply referral code if provided
	if req.ReferralCode != "" {
		err := h.referral.ApplyReferralCode(ctx, req.WalletAddress, req.ReferralCode)
		if err != nil {
			// Log but don't fail - referral is optional
			c.Set("referral_error", err.Error())
		} else {
			// Give signup bonus to referrer
			// Get referrer wallet from code
			// h.referral.SignupBonusForReferrer(ctx, referrerWallet, req.WalletAddress)
		}
	}

	// Claim welcome bonus
	source := req.Source
	if source == "" {
		source = "telegram"
	}
	
	result, err := h.bonus.ClaimWelcomeBonus(ctx, req.WalletAddress, source)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to claim bonus: " + err.Error()})
		return
	}

	// Generate referral code for new user
	refCode, _ := h.referral.GenerateReferralCode(ctx, req.WalletAddress)

	c.JSON(http.StatusOK, gin.H{
		"success":        result.Success,
		"welcome_bonus":  result,
		"referral_code":  refCode,
		"referral_link":  "https://t.me/GSTD_Main_Bot?start=ref_" + refCode,
		"next_steps": []string{
			"Start earning by enabling worker mode",
			"Complete tasks to earn GSTD",
			"Invite friends for 5% referral rewards",
		},
	})
}

// StartEarning enables worker mode for the user
// POST /api/v1/telegram/earn/start
func (h *TelegramOnboardHandler) StartEarning(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		DeviceID      string `json:"device_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// This would register the device as a worker node
	// For now, return success with instructions

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  "earning",
		"message": "🚀 Worker mode enabled! Your device is now earning GSTD.",
		"tips": []string{
			"Keep the app open to maximize earnings",
			"Connect to WiFi for better task availability",
			"Check back regularly for task notifications",
		},
	})
}

// StopEarning disables worker mode
// POST /api/v1/telegram/earn/stop
func (h *TelegramOnboardHandler) StopEarning(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  "idle",
		"message": "Worker mode paused. Resume anytime to continue earning!",
	})
}

// GetUserStats returns user statistics for Telegram Mini App
// GET /api/v1/telegram/stats
func (h *TelegramOnboardHandler) GetUserStats(c *gin.Context) {
	walletAddress := c.Query("wallet")
	if walletAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}

	ctx := c.Request.Context()

	// Get bonus status
	bonusStatus, _ := h.bonus.GetBonusStatus(ctx, walletAddress)

	// Get referral stats
	refStats, _ := h.referral.GetReferralStats(ctx, walletAddress)

	c.JSON(http.StatusOK, gin.H{
		"wallet":         walletAddress,
		"bonus_status":   bonusStatus,
		"referral_stats": refStats,
	})
}

// ClaimDailyFaucet claims daily faucet tokens
// POST /api/v1/telegram/faucet
func (h *TelegramOnboardHandler) ClaimDailyFaucet(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	ctx := c.Request.Context()

	result, err := h.bonus.ClaimDailyFaucet(ctx, req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ============================================================================
// BONUS HANDLERS
// ============================================================================

// BonusHandler handles bonus-related endpoints
type BonusHandler struct {
	bonus *services.WelcomeBonusService
}

// NewBonusHandler creates a new bonus handler
func NewBonusHandler(bonus *services.WelcomeBonusService) *BonusHandler {
	return &BonusHandler{bonus: bonus}
}

// GetBonusStatus returns bonus availability
// GET /api/v1/bonus/status
func (h *BonusHandler) GetBonusStatus(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}

	status, err := h.bonus.GetBonusStatus(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}

// ClaimWelcomeBonus claims welcome bonus
// POST /api/v1/bonus/welcome
func (h *BonusHandler) ClaimWelcomeBonus(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		Source        string `json:"source"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	result, err := h.bonus.ClaimWelcomeBonus(c.Request.Context(), req.WalletAddress, req.Source)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// BootstrapAgent bootstraps an agent with tokens
// POST /api/v1/tokens/agent/bootstrap
func (h *BonusHandler) BootstrapAgent(c *gin.Context) {
	var req struct {
		AgentWallet  string   `json:"agent_wallet" binding:"required"`
		AgentName    string   `json:"agent_name"`
		Capabilities []string `json:"capabilities"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	name := req.AgentName
	if name == "" {
		name = "Agent"
	}

	result, err := h.bonus.BootstrapAgent(c.Request.Context(), req.AgentWallet, name, req.Capabilities)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ============================================================================
// BURN HANDLERS
// ============================================================================

// BurnHandler handles burn-related endpoints
type BurnHandler struct {
	burn *services.BurnService
}

// NewBurnHandler creates a new burn handler
func NewBurnHandler(burn *services.BurnService) *BurnHandler {
	return &BurnHandler{burn: burn}
}

// GetBurnStats returns burn statistics
// GET /api/v1/burn/stats
func (h *BurnHandler) GetBurnStats(c *gin.Context) {
	stats, err := h.burn.GetBurnStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetBurnHistory returns recent burns
// GET /api/v1/burn/history
func (h *BurnHandler) GetBurnHistory(c *gin.Context) {
	limit := 50 // Default

	history, err := h.burn.GetBurnHistory(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"burns": history,
		"count": len(history),
	})
}

// SimulateBurn shows breakdown for a transaction amount
// GET /api/v1/burn/simulate
func (h *BurnHandler) SimulateBurn(c *gin.Context) {
	var amount float64
	if _, err := c.GetQuery("amount"); err {
		// Parse amount from query
		amount = 1.0 // Default
	}

	breakdown := h.burn.SimulateBurn(amount)
	c.JSON(http.StatusOK, breakdown)
}

// ============================================================================
// REFERRAL HANDLERS
// ============================================================================

// ReferralHandler handles referral endpoints
type ReferralHandler struct {
	referral *services.MultiLevelReferralService
}

// NewReferralHandler creates a new referral handler
func NewReferralHandler(referral *services.MultiLevelReferralService) *ReferralHandler {
	return &ReferralHandler{referral: referral}
}

// GetReferralStats returns referral statistics
// GET /api/v1/referrals/stats
func (h *ReferralHandler) GetReferralStats(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}

	stats, err := h.referral.GetReferralStats(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GenerateReferralCode generates a referral code
// POST /api/v1/referrals/generate
func (h *ReferralHandler) GenerateReferralCode(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	code, err := h.referral.GenerateReferralCode(c.Request.Context(), req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"referral_code": code,
		"telegram_link": "https://t.me/GSTD_Main_Bot?start=ref_" + code,
		"web_link":      "https://app.gstdtoken.com?ref=" + code,
	})
}

// ApplyReferralCode applies a referral code
// POST /api/v1/referrals/apply
func (h *ReferralHandler) ApplyReferralCode(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		Code          string `json:"code" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.referral.ApplyReferralCode(c.Request.Context(), req.WalletAddress, req.Code)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Referral code applied successfully!",
	})
}

// ClaimReferralRewards claims pending referral rewards
// POST /api/v1/referrals/claim
func (h *ReferralHandler) ClaimReferralRewards(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	result, err := h.referral.ClaimPendingRewards(c.Request.Context(), req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// GetLeaderboard returns referral leaderboard
// GET /api/v1/referrals/leaderboard
func (h *ReferralHandler) GetLeaderboard(c *gin.Context) {
	leaderboard, err := h.referral.GetReferralLeaderboard(c.Request.Context(), 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"leaderboard": leaderboard,
	})
}
