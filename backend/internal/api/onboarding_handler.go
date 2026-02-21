package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// OnboardingHandler handles onboarding API endpoints
type OnboardingHandler struct {
	// In production, would inject OnboardingOptimizer, TokenGateway etc.
}

func NewOnboardingHandler() *OnboardingHandler {
	return &OnboardingHandler{}
}

// RegisterRoutes registers all onboarding and acquisition routes
func (h *OnboardingHandler) RegisterRoutes(r *gin.RouterGroup) {
	// Onboarding
	onboarding := r.Group("/onboarding")
	{
		onboarding.POST("/start", h.StartOnboarding)
		onboarding.GET("/step/:user_id", h.GetCurrentStep)
		onboarding.POST("/complete/:user_id", h.CompleteStep)
		onboarding.POST("/skip/:user_id", h.SkipStep)
		onboarding.GET("/progress/:user_id", h.GetProgress)
	}

	// Token Acquisition (Free tokens)
	tokens := r.Group("/tokens")
	{
		tokens.POST("/welcome", h.ClaimWelcomeBonus)
		tokens.POST("/faucet", h.ClaimDailyFaucet)
		tokens.GET("/tasks", h.GetSimpleTasks)
		tokens.POST("/tasks/:task_id/complete", h.CompleteSimpleTask)
		tokens.POST("/referral", h.ClaimReferralBonus)
		tokens.POST("/agent/bootstrap", h.AgentBootstrap)
		tokens.GET("/earn-guide", h.GetEarnWithoutMoneyGuide)
		tokens.GET("/buy-link", h.GetQuickBuyLink)
	}

	// Translation
	translate := r.Group("/translate")
	{
		translate.POST("/text", h.TranslateText)
		translate.POST("/batch", h.TranslateBatch)
		translate.GET("/languages", h.GetSupportedLanguages)
		translate.GET("/ui/:lang", h.GetUITranslations)
	}
}

// ===== ONBOARDING HANDLERS =====

// StartOnboarding begins the onboarding flow
// @Summary Start onboarding for a new user
// @Tags Onboarding
// @Accept json
// @Produce json
// @Param body body StartOnboardingRequest true "User info"
// @Success 200 {object} OnboardingFlowResponse
// @Router /v1/onboarding/start [post]
func (h *OnboardingHandler) StartOnboarding(c *gin.Context) {
	var req struct {
		UserID   string `json:"user_id" binding:"required"`
		UserType string `json:"user_type"` // human, agent, developer
		Language string `json:"language"`  // en, ru, zh, etc.
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Defaults
	if req.UserType == "" {
		req.UserType = "human"
	}
	if req.Language == "" {
		req.Language = "en"
	}

	// Would call OnboardingOptimizer.StartOnboarding()
	flow := gin.H{
		"id":           req.UserID,
		"user_type":    req.UserType,
		"language":     req.Language,
		"current_step": 0,
		"total_steps":  5,
		"steps": []gin.H{
			{
				"order":       1,
				"title":       getWelcomeTitle(req.Language),
				"description": getWelcomeDesc(req.Language),
				"action":      "welcome",
				"skippable":   false,
			},
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"flow":    flow,
	})
}

// GetCurrentStep returns the current onboarding step
func (h *OnboardingHandler) GetCurrentStep(c *gin.Context) {
	userID := c.Param("user_id")

	// Would call optimizer.GetCurrentStep()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"step": gin.H{
			"order":       2,
			"title":       "Connect Your Wallet",
			"description": "Tap to connect your TON wallet",
			"action":      "connect_wallet",
			"help_text":   "Don't have a wallet? We'll create one for you!",
			"skippable":   false,
		},
		"user_id": userID,
	})
}

// CompleteStep marks the current step as complete
func (h *OnboardingHandler) CompleteStep(c *gin.Context) {
	userID := c.Param("user_id")

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"message":     "Step completed!",
		"next_step":   3,
		"total_steps": 5,
		"user_id":     userID,
	})
}

// SkipStep skips the current step if allowed
func (h *OnboardingHandler) SkipStep(c *gin.Context) {
	userID := c.Param("user_id")

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   "Step skipped",
		"next_step": 4,
		"user_id":   userID,
	})
}

// GetProgress returns onboarding progress
func (h *OnboardingHandler) GetProgress(c *gin.Context) {
	userID := c.Param("user_id")

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"user_id":         userID,
		"current_step":    2,
		"total_steps":     5,
		"completed_steps": 1,
		"progress":        20.0,
		"completed":       false,
	})
}

// ===== TOKEN ACQUISITION HANDLERS =====

// ClaimWelcomeBonus gives free tokens to new users
// @Summary Claim welcome bonus (1 GSTD)
// @Tags Tokens
// @Accept json
// @Produce json
// @Param body body WalletRequest true "Wallet address"
// @Success 200 {object} ClaimResponse
// @Router /v1/tokens/welcome [post]
func (h *OnboardingHandler) ClaimWelcomeBonus(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Would call TokenGateway.ClaimWelcomeBonus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "🎁 Welcome bonus claimed!",
		"claim": gin.H{
			"wallet_address": req.WalletAddress,
			"amount":         1.0,
			"type":           "welcome",
			"claimed_at":     "2026-02-07T08:18:00Z",
		},
	})
}

// ClaimDailyFaucet provides daily free tokens
func (h *OnboardingHandler) ClaimDailyFaucet(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "💧 Daily faucet claimed!",
		"claim": gin.H{
			"wallet_address": req.WalletAddress,
			"amount":         0.1,
			"type":           "daily",
			"next_claim_in":  "24h",
		},
	})
}

// GetSimpleTasks returns easy tasks anyone can complete
func (h *OnboardingHandler) GetSimpleTasks(c *gin.Context) {
	tasks := []gin.H{
		{
			"id":            "task_001",
			"type":          "survey",
			"title":         "Quick Survey",
			"description":   "Answer 3 simple questions about AI",
			"reward_gstd":   0.1,
			"time_estimate": "30 seconds",
			"difficulty":    "beginner",
		},
		{
			"id":            "task_002",
			"type":          "feedback",
			"title":         "Platform Feedback",
			"description":   "Tell us what you think",
			"reward_gstd":   0.2,
			"time_estimate": "1 minute",
			"difficulty":    "beginner",
		},
		{
			"id":            "task_003",
			"type":          "share",
			"title":         "Share on Social Media",
			"description":   "Share GSTD on Twitter/X",
			"reward_gstd":   0.5,
			"time_estimate": "2 minutes",
			"difficulty":    "easy",
		},
		{
			"id":            "task_004",
			"type":          "captcha",
			"title":         "Solve Captcha",
			"description":   "Help train AI",
			"reward_gstd":   0.05,
			"time_estimate": "10 seconds",
			"difficulty":    "beginner",
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"tasks":   tasks,
		"count":   len(tasks),
	})
}

// CompleteSimpleTask completes a simple task and rewards user
func (h *OnboardingHandler) CompleteSimpleTask(c *gin.Context) {
	taskID := c.Param("task_id")

	var req struct {
		WalletAddress string      `json:"wallet_address" binding:"required"`
		Response      interface{} `json:"response"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "✅ Task completed!",
		"task_id": taskID,
		"reward": gin.H{
			"amount":   0.1,
			"currency": "GSTD",
		},
	})
}

// ClaimReferralBonus rewards users for inviting others
func (h *OnboardingHandler) ClaimReferralBonus(c *gin.Context) {
	var req struct {
		ReferrerWallet string `json:"referrer_wallet" binding:"required"`
		NewUserWallet  string `json:"new_user_wallet" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "🎯 Referral bonus claimed!",
		"reward": gin.H{
			"referrer_amount": 1.0,
			"new_user_amount": 0.5,
		},
	})
}

// AgentBootstrap provides startup tokens for new AI agents
func (h *OnboardingHandler) AgentBootstrap(c *gin.Context) {
	var req struct {
		AgentWallet  string   `json:"agent_wallet" binding:"required"`
		AgentName    string   `json:"agent_name" binding:"required"`
		Capabilities []string `json:"capabilities"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Calculate bootstrap based on capabilities
	baseAmount := 0.5
	capBonus := float64(len(req.Capabilities)) * 0.1
	totalAmount := baseAmount + capBonus

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "🤖 Agent bootstrapped successfully!",
		"bootstrap": gin.H{
			"agent_name":   req.AgentName,
			"wallet":       req.AgentWallet,
			"amount":       totalAmount,
			"capabilities": req.Capabilities,
		},
	})
}

// GetEarnWithoutMoneyGuide returns guide for earning without investment
func (h *OnboardingHandler) GetEarnWithoutMoneyGuide(c *gin.Context) {
	guide := gin.H{
		"title": "🆓 Get GSTD Tokens for FREE",
		"methods": []gin.H{
			{
				"name":        "Welcome Bonus",
				"reward":      "1.0 GSTD",
				"description": "Connect wallet and receive instantly",
				"difficulty":  "instant",
				"endpoint":    "POST /api/v1/tokens/welcome",
			},
			{
				"name":        "Daily Faucet",
				"reward":      "0.1 GSTD",
				"description": "Claim free tokens every 24 hours",
				"difficulty":  "instant",
				"endpoint":    "POST /api/v1/tokens/faucet",
			},
			{
				"name":        "Complete Tasks",
				"reward":      "0.05-0.5 GSTD",
				"description": "Simple tasks anyone can do",
				"difficulty":  "30 sec - 5 min",
				"endpoint":    "GET /api/v1/tokens/tasks",
			},
			{
				"name":        "Invite Friends",
				"reward":      "1.0 GSTD per friend",
				"description": "Share referral link",
				"difficulty":  "easy",
				"endpoint":    "POST /api/v1/tokens/referral",
			},
			{
				"name":        "Become a Worker",
				"reward":      "Unlimited",
				"description": "Register device and earn from tasks",
				"difficulty":  "5 min setup",
				"endpoint":    "POST /api/v1/nodes/register",
			},
		},
		"agent_methods": []gin.H{
			{
				"name":        "Agent Bootstrap",
				"reward":      "0.5-1.0 GSTD",
				"description": "New agents get startup tokens",
				"endpoint":    "POST /api/v1/tokens/agent/bootstrap",
			},
			{
				"name":        "Task Execution",
				"reward":      "Variable",
				"description": "Execute tasks automatically",
				"endpoint":    "GET /api/v1/tasks/pending",
			},
		},
	}

	c.JSON(http.StatusOK, guide)
}

// GetQuickBuyLink returns simple buy link
func (h *OnboardingHandler) GetQuickBuyLink(c *gin.Context) {
	amount := c.DefaultQuery("amount", "10")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"links": gin.H{
			"ston_fi":     "https://app.ston.fi/swap?ft=TON&tt=GSTD&ta=" + amount,
			"dedust":      "https://dedust.io/swap/TON/GSTD",
			"getgems":     "https://getgems.io/collection/gstd",
			"telegram":    "https://t.me/GSTD_Bot?start=buy",
			"direct_swap": "https://api.gstdtoken.com/swap?amount=" + amount,
		},
		"instructions": "Easiest: Use Telegram link or STON.fi",
	})
}

// ===== TRANSLATION HANDLERS =====

// TranslateText translates a single text
func (h *OnboardingHandler) TranslateText(c *gin.Context) {
	var req struct {
		Text       string `json:"text" binding:"required"`
		SourceLang string `json:"source_lang"`
		TargetLang string `json:"target_lang" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.SourceLang == "" {
		req.SourceLang = "en"
	}

	// Would call TranslationService.Translate()
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"original":   req.Text,
		"translated": translateSimple(req.Text, req.TargetLang),
		"from":       req.SourceLang,
		"to":         req.TargetLang,
	})
}

// TranslateBatch translates multiple texts
func (h *OnboardingHandler) TranslateBatch(c *gin.Context) {
	var req struct {
		Texts      []string `json:"texts" binding:"required"`
		SourceLang string   `json:"source_lang"`
		TargetLang string   `json:"target_lang" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	translations := make([]string, len(req.Texts))
	for i, text := range req.Texts {
		translations[i] = translateSimple(text, req.TargetLang)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"translations": translations,
		"count":        len(translations),
	})
}

// GetSupportedLanguages returns list of supported languages
func (h *OnboardingHandler) GetSupportedLanguages(c *gin.Context) {
	langs := []gin.H{
		{"code": "en", "name": "English", "native": "English"},
		{"code": "ru", "name": "Russian", "native": "Русский"},
		{"code": "zh", "name": "Chinese", "native": "中文"},
		{"code": "es", "name": "Spanish", "native": "Español"},
		{"code": "de", "name": "German", "native": "Deutsch"},
		{"code": "fr", "name": "French", "native": "Français"},
		{"code": "ja", "name": "Japanese", "native": "日本語"},
		{"code": "ko", "name": "Korean", "native": "한국어"},
		{"code": "pt", "name": "Portuguese", "native": "Português"},
		{"code": "ar", "name": "Arabic", "native": "العربية"},
		{"code": "hi", "name": "Hindi", "native": "हिन्दी"},
		{"code": "tr", "name": "Turkish", "native": "Türkçe"},
		{"code": "vi", "name": "Vietnamese", "native": "Tiếng Việt"},
		{"code": "th", "name": "Thai", "native": "ไทย"},
		{"code": "id", "name": "Indonesian", "native": "Bahasa Indonesia"},
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"languages": langs,
		"count":     len(langs),
	})
}

// GetUITranslations returns all UI strings for a language
func (h *OnboardingHandler) GetUITranslations(c *gin.Context) {
	lang := c.Param("lang")

	// Base UI strings
	translations := getUIStrings(lang)

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"language":     lang,
		"translations": translations,
	})
}

// ===== HELPER FUNCTIONS =====

func getWelcomeTitle(lang string) string {
	titles := map[string]string{
		"en": "Welcome to GSTD!",
		"ru": "Добро пожаловать в GSTD!",
		"zh": "欢迎来到GSTD!",
		"es": "¡Bienvenido a GSTD!",
		"de": "Willkommen bei GSTD!",
	}
	if t, ok := titles[lang]; ok {
		return t
	}
	return titles["en"]
}

func getWelcomeDesc(lang string) string {
	descs := map[string]string{
		"en": "The AI network that pays YOU. Let's get started!",
		"ru": "AI сеть, которая платит ВАМ. Начнём!",
		"zh": "付费给您的AI网络。让我们开始吧！",
		"es": "La red AI que te PAGA. ¡Comencemos!",
	}
	if d, ok := descs[lang]; ok {
		return d
	}
	return descs["en"]
}

func translateSimple(text, lang string) string {
	// Simple translation fallback
	// In production, would call LLM
	return text + " [" + lang + "]"
}

func getUIStrings(lang string) map[string]string {
	base := map[string]string{
		"welcome":          "Welcome",
		"login":            "Login",
		"logout":           "Logout",
		"dashboard":        "Dashboard",
		"balance":          "Balance",
		"tasks":            "Tasks",
		"nodes":            "Nodes",
		"settings":         "Settings",
		"help":             "Help",
		"connect_wallet":   "Connect Wallet",
		"claim_rewards":    "Claim Rewards",
		"create_task":      "Create Task",
		"my_earnings":      "My Earnings",
		"referrals":        "Referrals",
		"documentation":    "Documentation",
		"loading":          "Loading...",
		"error":            "Error",
		"success":          "Success",
		"submit":           "Submit",
		"cancel":           "Cancel",
		"confirm":          "Confirm",
	}

	translations := map[string]map[string]string{
		"ru": {
			"welcome":         "Добро пожаловать",
			"login":           "Войти",
			"logout":          "Выйти",
			"dashboard":       "Панель",
			"balance":         "Баланс",
			"tasks":           "Задачи",
			"nodes":           "Узлы",
			"settings":        "Настройки",
			"help":            "Помощь",
			"connect_wallet":  "Подключить кошелек",
			"claim_rewards":   "Получить награды",
			"create_task":     "Создать задачу",
			"my_earnings":     "Мои доходы",
			"referrals":       "Рефералы",
			"documentation":   "Документация",
			"loading":         "Загрузка...",
			"error":           "Ошибка",
			"success":         "Успешно",
			"submit":          "Отправить",
			"cancel":          "Отмена",
			"confirm":         "Подтвердить",
		},
		"zh": {
			"welcome":        "欢迎",
			"login":          "登录",
			"logout":         "登出",
			"dashboard":      "仪表板",
			"balance":        "余额",
			"tasks":          "任务",
			"nodes":          "节点",
			"settings":       "设置",
			"help":           "帮助",
			"connect_wallet": "连接钱包",
			"claim_rewards":  "领取奖励",
			"create_task":    "创建任务",
			"loading":        "加载中...",
			"error":          "错误",
			"success":        "成功",
		},
	}

	if t, ok := translations[lang]; ok {
		// Merge with base
		result := make(map[string]string)
		for k, v := range base {
			result[k] = v
		}
		for k, v := range t {
			result[k] = v
		}
		return result
	}

	return base
}
