package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// GROWTH SYSTEM ROUTES
// Marketplace, Burn, Welcome Bonus, Multi-Level Referrals
// ============================================================================

// GrowthSystemHandler handles all growth-related endpoints
type GrowthSystemHandler struct {
	db               *sql.DB
	bonus            *services.WelcomeBonusService
	burn             *services.BurnService
	referral         *services.MultiLevelReferralService
	agentMarketplace *services.AgentMarketplaceService
}

// NewGrowthSystemHandler creates a new growth system handler
func NewGrowthSystemHandler(
	db *sql.DB,
	bonus *services.WelcomeBonusService,
	burn *services.BurnService,
	referral *services.MultiLevelReferralService,
	agentMarketplace *services.AgentMarketplaceService,
) *GrowthSystemHandler {
	return &GrowthSystemHandler{
		db:               db,
		bonus:            bonus,
		burn:             burn,
		referral:         referral,
		agentMarketplace: agentMarketplace,
	}
}

// SetupGrowthRoutes registers all growth system routes
func SetupGrowthRoutes(v1 *gin.RouterGroup, protected *gin.RouterGroup, h *GrowthSystemHandler) {
	// ========================================================================
	// PUBLIC ROUTES (no auth required) — for frictionless onboarding
	// ========================================================================

	// Telegram Mini App Onboarding
	telegram := v1.Group("/telegram")
	{
		telegram.POST("/init", h.TelegramInit)
		telegram.POST("/onboard", h.TelegramOnboard)
		telegram.POST("/earn/start", h.StartEarning)
		telegram.POST("/earn/stop", h.StopEarning)
		telegram.GET("/stats", h.GetTelegramStats)
		telegram.POST("/faucet", h.ClaimFaucet)
	}

	// Bonus System (public — agents can bootstrap without session)
	bonus := v1.Group("/bonus")
	{
		bonus.GET("/status", h.GetBonusStatus)
		bonus.POST("/welcome", h.ClaimWelcomeBonus)
		bonus.POST("/faucet", h.ClaimFaucet) // Daily faucet from chat UI
	}

	// Agent Bootstrap endpoint moved to onboarding_handler.go to avoid conflicts
	// The GrowthSystemHandler.BootstrapAgent method is available but not routed directly

	// Burn Statistics (public — transparency)
	burn := v1.Group("/burn")
	{
		burn.GET("/stats", h.GetBurnStats)
		burn.GET("/history", h.GetBurnHistory)
		burn.GET("/simulate", h.SimulateBurn)
	}

	// Agent Marketplace (public browsing)
	marketplace := v1.Group("/marketplace/agents")
	{
		marketplace.GET("", h.BrowseAgents)
		marketplace.GET("/featured", h.GetFeaturedAgents)
		marketplace.GET("/:id", h.GetAgentDetails)
	}

	// Referral Leaderboard (public)
	v1.GET("/referrals/leaderboard", h.GetReferralLeaderboard)
	// Public referral code lookup (for chat UI share button)
	v1.GET("/referrals/code", h.GetReferralCode)
	// Public referral tracking (apply ref code on wallet connect)
	v1.POST("/referrals/track", h.TrackReferral)

	// ========================================================================
	// PROTECTED ROUTES (require session)
	// ========================================================================

	// Multi-Level Referrals - NEW endpoints only (stats/apply already in routes.go)
	referralsMl := protected.Group("/referrals/ml")
	{
		referralsMl.GET("/stats", h.GetReferralStats) // Multi-level stats
		referralsMl.POST("/generate", h.GenerateReferralCode)
		referralsMl.POST("/apply", h.ApplyReferralCode)    // Apply with multi-level tracking
		referralsMl.POST("/claim", h.ClaimReferralRewards) // Claim multi-level rewards
	}

	// Agent Marketplace (protected operations)
	marketplaceProtected := protected.Group("/marketplace/agents")
	{
		marketplaceProtected.POST("", h.RegisterAgent)
		marketplaceProtected.PUT("/:id", h.UpdateAgent)
		marketplaceProtected.GET("/mine", h.GetMyAgents)
		marketplaceProtected.POST("/:id/reviews", h.ReviewAgent)
	}

	// Rentals (protected)
	rentals := protected.Group("/marketplace/rentals")
	{
		rentals.POST("", h.RentAgent)
		rentals.POST("/:id/execute", h.ExecuteRentalTask)
		rentals.POST("/:id/end", h.EndRental)
	}
}

// ============================================================================
// TELEGRAM MINI APP HANDLERS
// ============================================================================

func (h *GrowthSystemHandler) TelegramInit(c *gin.Context) {
	var req struct {
		TelegramID   int64  `json:"telegram_id" binding:"required"`
		Username     string `json:"username"`
		FirstName    string `json:"first_name"`
		IsPremium    bool   `json:"is_premium"`
		LanguageCode string `json:"language_code"`
		ReferralCode string `json:"referral_code"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"telegram_id":   req.TelegramID,
		"wallet_needed": true,
		"message":       "👋 Welcome to GSTD! Connect your wallet to start earning.",
		"next_steps": []string{
			"Connect TON wallet",
			"Get 1.0 GSTD welcome bonus",
			"Start earning by completing tasks",
		},
	})
}

func (h *GrowthSystemHandler) TelegramOnboard(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		ReferralCode  string `json:"referral_code"`
		TelegramID    int64  `json:"telegram_id"`
		Source        string `json:"source"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	ctx := c.Request.Context()

	// Apply referral code if provided
	var referralApplied bool
	if req.ReferralCode != "" && h.referral != nil {
		if err := h.referral.ApplyReferralCode(ctx, req.WalletAddress, req.ReferralCode); err == nil {
			referralApplied = true
		}
	}

	// Claim welcome bonus
	source := req.Source
	if source == "" {
		source = "telegram"
	}

	var bonusResult *services.BonusResult
	if h.bonus != nil {
		bonusResult, _ = h.bonus.ClaimWelcomeBonus(ctx, req.WalletAddress, source)
	}

	// Generate referral code for new user
	var refCode string
	if h.referral != nil {
		refCode, _ = h.referral.GenerateReferralCode(ctx, req.WalletAddress)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"wallet_address":   req.WalletAddress,
		"welcome_bonus":    bonusResult,
		"referral_applied": referralApplied,
		"referral_code":    refCode,
		"referral_link":    "https://t.me/GSTD_Main_Bot?start=ref_" + refCode,
		"message":          "🎉 Welcome to GSTD! Your account is ready.",
	})
}

func (h *GrowthSystemHandler) StartEarning(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		DeviceID      string `json:"device_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  "earning",
		"message": "🚀 Worker mode enabled! Your device is now earning GSTD.",
	})
}

func (h *GrowthSystemHandler) StopEarning(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  "idle",
		"message": "Worker mode paused. Resume anytime!",
	})
}

func (h *GrowthSystemHandler) GetTelegramStats(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}

	ctx := c.Request.Context()
	response := gin.H{"wallet": wallet}

	if h.bonus != nil {
		if status, err := h.bonus.GetBonusStatus(ctx, wallet); err == nil {
			response["bonus_status"] = status
		}
	}

	if h.referral != nil {
		if stats, err := h.referral.GetReferralStats(ctx, wallet); err == nil {
			response["referral_stats"] = stats
		}
	}

	c.JSON(http.StatusOK, response)
}

func (h *GrowthSystemHandler) ClaimFaucet(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if h.bonus == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Bonus service not available"})
		return
	}

	result, err := h.bonus.ClaimDailyFaucet(c.Request.Context(), req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// ============================================================================
// BONUS HANDLERS
// ============================================================================

func (h *GrowthSystemHandler) GetBonusStatus(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}

	if h.bonus == nil {
		c.JSON(http.StatusOK, gin.H{
			"welcome_bonus_available":   true,
			"daily_faucet_available":    false,
			"agent_bootstrap_available": true,
		})
		return
	}

	status, err := h.bonus.GetBonusStatus(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}

func (h *GrowthSystemHandler) ClaimWelcomeBonus(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		Source        string `json:"source"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if h.bonus == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Bonus service not available"})
		return
	}

	result, err := h.bonus.ClaimWelcomeBonus(c.Request.Context(), req.WalletAddress, req.Source)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *GrowthSystemHandler) BootstrapAgent(c *gin.Context) {
	var req struct {
		AgentWallet  string   `json:"agent_wallet" binding:"required"`
		AgentName    string   `json:"agent_name"`
		Capabilities []string `json:"capabilities"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if h.bonus == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Bonus service not available"})
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

func (h *GrowthSystemHandler) GetBurnStats(c *gin.Context) {
	if h.burn == nil {
		c.JSON(http.StatusOK, gin.H{
			"total_burned":   0,
			"burned_today":   0,
			"burn_rate":      5.0,
			"initial_supply": 1000000000,
			"current_supply": 1000000000,
		})
		return
	}

	stats, err := h.burn.GetBurnStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (h *GrowthSystemHandler) GetBurnHistory(c *gin.Context) {
	if h.burn == nil {
		c.JSON(http.StatusOK, gin.H{"burns": []interface{}{}, "count": 0})
		return
	}

	history, err := h.burn.GetBurnHistory(c.Request.Context(), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"burns": history, "count": len(history)})
}

func (h *GrowthSystemHandler) SimulateBurn(c *gin.Context) {
	amount := 1.0
	if amountStr := c.Query("amount"); amountStr != "" {
		if val, err := strconv.ParseFloat(amountStr, 64); err == nil {
			amount = val
		}
	}

	if h.burn == nil {
		// Simulate without service
		burnAmount := amount * 0.05
		c.JSON(http.StatusOK, gin.H{
			"total_amount":  amount,
			"worker_reward": amount * 0.90,
			"platform_fee":  amount * 0.05,
			"burn_amount":   burnAmount,
			"burn_percent":  5.0,
		})
		return
	}

	breakdown := h.burn.SimulateBurn(amount)
	c.JSON(http.StatusOK, breakdown)
}

// ============================================================================
// REFERRAL HANDLERS
// ============================================================================

func (h *GrowthSystemHandler) GetReferralStats(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		// Try to get from session
		if w, exists := c.Get("wallet_address"); exists {
			wallet = w.(string)
		}
	}
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}

	if h.referral == nil {
		c.JSON(http.StatusOK, gin.H{"wallet_address": wallet, "total_referrals": 0})
		return
	}

	stats, err := h.referral.GetReferralStats(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (h *GrowthSystemHandler) GenerateReferralCode(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if h.referral == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Referral service not available"})
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

func (h *GrowthSystemHandler) ApplyReferralCode(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
		Code          string `json:"code" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if h.referral == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Referral service not available"})
		return
	}

	err := h.referral.ApplyReferralCode(c.Request.Context(), req.WalletAddress, req.Code)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Referral code applied successfully!"})
}

func (h *GrowthSystemHandler) ClaimReferralRewards(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if h.referral == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Referral service not available"})
		return
	}

	result, err := h.referral.ClaimPendingRewards(c.Request.Context(), req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *GrowthSystemHandler) GetReferralLeaderboard(c *gin.Context) {
	if h.referral == nil {
		c.JSON(http.StatusOK, gin.H{"leaderboard": []interface{}{}})
		return
	}

	leaderboard, err := h.referral.GetReferralLeaderboard(c.Request.Context(), 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"leaderboard": leaderboard})
}

// GetReferralCode returns the referral code for a wallet (public, for chat UI share button)
func (h *GrowthSystemHandler) GetReferralCode(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet parameter required"})
		return
	}
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"referral_code": "", "share_link": ""})
		return
	}
	var code string
	err := h.db.QueryRowContext(c.Request.Context(),
		"SELECT COALESCE(referral_code, '') FROM users WHERE wallet_address = $1", wallet).Scan(&code)
	if err != nil || code == "" {
		c.JSON(http.StatusOK, gin.H{"referral_code": "", "share_link": ""})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"referral_code": code,
		"share_link":    "https://chat.gstdtoken.com/?ref=" + code,
	})
}

// TrackReferral applies a referral code to a user on wallet connect (public)
func (h *GrowthSystemHandler) TrackReferral(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address"`
		ReferralCode  string `json:"referral_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.WalletAddress == "" || req.ReferralCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet_address and referral_code required"})
		return
	}
	if h.referral == nil || h.db == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Referral service not available"})
		return
	}
	// Check if user already has a referrer
	var existing string
	h.db.QueryRowContext(c.Request.Context(),
		"SELECT COALESCE(referred_by, '') FROM users WHERE wallet_address = $1", req.WalletAddress).Scan(&existing)
	if existing != "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Already has referrer"})
		return
	}
	// Find referrer wallet
	var referrerWallet string
	err := h.db.QueryRowContext(c.Request.Context(),
		"SELECT wallet_address FROM users WHERE referral_code = $1", req.ReferralCode).Scan(&referrerWallet)
	if err != nil || referrerWallet == "" || referrerWallet == req.WalletAddress {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Invalid referral code"})
		return
	}
	// Apply referral
	_, err = h.db.ExecContext(c.Request.Context(),
		"UPDATE users SET referred_by = $1 WHERE wallet_address = $2 AND (referred_by IS NULL OR referred_by = '')",
		referrerWallet, req.WalletAddress)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Failed to apply"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Referral applied!", "referrer": referrerWallet[:6] + "..."})
}
// AGENT MARKETPLACE HANDLERS
// ============================================================================

func (h *GrowthSystemHandler) BrowseAgents(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusOK, gin.H{"agents": []interface{}{}, "count": 0})
		return
	}

	filter := &services.AgentFilter{
		Capability:   c.Query("capability"),
		PricingModel: c.Query("pricing_model"),
		SortBy:       c.Query("sort_by"),
	}

	if minTrust := c.Query("min_trust"); minTrust != "" {
		if val, err := strconv.ParseFloat(minTrust, 64); err == nil {
			filter.MinTrustScore = val
		}
	}
	if maxPrice := c.Query("max_price"); maxPrice != "" {
		if val, err := strconv.ParseFloat(maxPrice, 64); err == nil {
			filter.MaxPrice = val
		}
	}
	if limit := c.Query("limit"); limit != "" {
		if val, err := strconv.Atoi(limit); err == nil {
			filter.Limit = val
		}
	}

	agents, err := h.agentMarketplace.BrowseAgents(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"agents": agents, "count": len(agents)})
}

func (h *GrowthSystemHandler) GetFeaturedAgents(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusOK, gin.H{"featured_agents": []interface{}{}})
		return
	}

	filter := &services.AgentFilter{
		SortBy:        "trust",
		MinTrustScore: 0.7,
		Limit:         10,
	}

	agents, err := h.agentMarketplace.BrowseAgents(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"featured_agents": agents})
}

func (h *GrowthSystemHandler) GetAgentDetails(c *gin.Context) {
	agentID := c.Param("id")
	if h.agentMarketplace == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Agent not found"})
		return
	}

	details, err := h.agentMarketplace.GetAgentDetails(c.Request.Context(), agentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, details)
}

func (h *GrowthSystemHandler) RegisterAgent(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Marketplace not available"})
		return
	}

	var req services.AgentRegistration
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request: " + err.Error()})
		return
	}

	agent, err := h.agentMarketplace.RegisterAgent(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "agent": agent})
}

func (h *GrowthSystemHandler) UpdateAgent(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Marketplace not available"})
		return
	}

	agentID := c.Param("id")
	ownerWallet := c.GetHeader("X-Wallet-Address")
	if ownerWallet == "" {
		if w, exists := c.Get("wallet_address"); exists {
			ownerWallet = w.(string)
		}
	}

	var updates services.AgentUpdate
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.agentMarketplace.UpdateAgent(c.Request.Context(), agentID, ownerWallet, &updates)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *GrowthSystemHandler) GetMyAgents(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusOK, gin.H{"agents": []interface{}{}})
		return
	}

	wallet := c.Query("wallet")
	if wallet == "" {
		if w, exists := c.Get("wallet_address"); exists {
			wallet = w.(string)
		}
	}

	agents, err := h.agentMarketplace.GetMyAgents(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"agents": agents, "count": len(agents)})
}

func (h *GrowthSystemHandler) ReviewAgent(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Marketplace not available"})
		return
	}

	agentID := c.Param("id")
	var req struct {
		ReviewerWallet string  `json:"reviewer_wallet" binding:"required"`
		Rating         float64 `json:"rating" binding:"required,min=1,max=5"`
		Comment        string  `json:"comment"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	review := &services.AgentReview{
		AgentID:        agentID,
		ReviewerWallet: req.ReviewerWallet,
		Rating:         req.Rating,
		Comment:        req.Comment,
	}

	err := h.agentMarketplace.ReviewAgent(c.Request.Context(), review)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true})
}

func (h *GrowthSystemHandler) RentAgent(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Marketplace not available"})
		return
	}

	var req services.RentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	session, err := h.agentMarketplace.RentAgent(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "rental": session})
}

func (h *GrowthSystemHandler) ExecuteRentalTask(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Marketplace not available"})
		return
	}

	rentalID := c.Param("id")
	var execution services.TaskExecution
	if err := c.ShouldBindJSON(&execution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	err := h.agentMarketplace.ExecuteAgentTask(c.Request.Context(), rentalID, &execution)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *GrowthSystemHandler) EndRental(c *gin.Context) {
	if h.agentMarketplace == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Marketplace not available"})
		return
	}

	rentalID := c.Param("id")
	var req struct {
		RenterWallet string `json:"renter_wallet" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	summary, err := h.agentMarketplace.EndRental(c.Request.Context(), rentalID, req.RenterWallet)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "summary": summary})
}
