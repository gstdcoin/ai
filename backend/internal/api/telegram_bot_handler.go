package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// Fund wallet addresses — loaded from env or use defaults.
// These wallets receive platform fee allocations on every paid operation.
//
//	development_fund  → Binance TON deposit (project expenses, infra, marketing)
//	cocoon_fund       → Admin wallet (pays for Cocoon AI confidential compute)
//	gold_reserve      → STON.fi XAUt/GSTD pool EQA--JXG...Iez25sLp
//	                    (GSTD is swapped → XAUt and added as pool liquidity)
func fundWallet(fundType string) string {
	switch fundType {
	case "development_fund":
		if w := os.Getenv("DEVELOPMENT_FUND_WALLET"); w != "" {
			return w
		}
		return "UQA5HpVG96CBqR000VmY9PjyFCwUbuaiWWYv7lrZtEyD_Z3P"
	case "cocoon_fund":
		if w := os.Getenv("COCOON_FUND_WALLET"); w != "" {
			return w
		}
		return "UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED"
	case "gold_reserve":
		if w := os.Getenv("STONFI_XAUT_GSTD_POOL"); w != "" {
			return w
		}
		return "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
	default:
		return os.Getenv("ADMIN_WALLET")
	}
}

// RequireBotToken validates X-Bot-Token header (for Telegram bot API calls)
func RequireBotToken() gin.HandlerFunc {
	botKey := os.Getenv("BOT_API_KEY")
	return func(c *gin.Context) {
		if botKey == "" {
			botKey = os.Getenv("TELEGRAM_BOT_TOKEN") // Fallback: use bot token as API key
		}
		token := c.GetHeader("X-Bot-Token")
		if token == "" {
			token = c.GetHeader("Authorization")
			if len(token) > 7 && token[:7] == "Bearer " {
				token = token[7:]
			}
		}
		if token == "" || token != botKey {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or missing X-Bot-Token"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// TelegramBotHandler handles Telegram bot → backend integration for tasks
type TelegramBotHandler struct {
	db            *sql.DB
	marketplace   *services.MarketplaceService
	nodeService   *services.NodeService
	deviceService *services.DeviceService
	gaslessUser   *services.GaslessUserService
	gateway       *GatewayHandler
}

// NewTelegramBotHandler creates the handler
func NewTelegramBotHandler(db *sql.DB, marketplace *services.MarketplaceService, nodeService *services.NodeService, deviceService *services.DeviceService, gaslessUser *services.GaslessUserService, gateway *GatewayHandler) *TelegramBotHandler {
	return &TelegramBotHandler{
		db: db, marketplace: marketplace, nodeService: nodeService, deviceService: deviceService, gaslessUser: gaslessUser, gateway: gateway,
	}
}

// LinkWallet links telegram_id to wallet_address
// POST /api/v1/telegram/bot/link
func (h *TelegramBotHandler) LinkWallet(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var req struct {
		TelegramID    int64  `json:"telegram_id" binding:"required"`
		WalletAddress string `json:"wallet_address" binding:"required"`
		Username      string `json:"username"`
		FirstName     string `json:"first_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Ensure user exists (for ClaimTask balance check); detect if NEW user
	var existed bool
	err := h.db.QueryRowContext(c.Request.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE wallet_address = $1)`, req.WalletAddress).Scan(&existed)
	if err != nil {
		existed = false
	}

	// Migrate balance from tg-{id} if user bought GSTD with Stars before linking
	tgWallet := fmt.Sprintf("tg-%d", req.TelegramID)
	var tgBalance float64
	if h.db.QueryRowContext(c.Request.Context(), `SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1`, tgWallet).Scan(&tgBalance) == nil && tgBalance > 0 {
		_, _ = h.db.ExecContext(c.Request.Context(), `
			UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1 WHERE wallet_address = $2
		`, tgBalance, req.WalletAddress)
		_, _ = h.db.ExecContext(c.Request.Context(), `UPDATE users SET gstd_balance = 0, balance = 0 WHERE wallet_address = $1`, tgWallet)
	}

	_, _ = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO users (wallet_address, balance, created_at, updated_at)
		VALUES ($1, 0, NOW(), NOW())
		ON CONFLICT (wallet_address) DO NOTHING
	`, req.WalletAddress)

	_, err = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO telegram_users (telegram_id, wallet_address, telegram_username, telegram_first_name, last_activity_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (telegram_id) DO UPDATE SET
			wallet_address = EXCLUDED.wallet_address,
			telegram_username = EXCLUDED.telegram_username,
			telegram_first_name = EXCLUDED.telegram_first_name,
			last_activity_at = NOW()
	`, req.TelegramID, req.WalletAddress, req.Username, req.FirstName)
	if err != nil {
		log.Printf("telegram link wallet: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to link wallet"})
		return
	}

	// Wallet-as-Node: activate wallet so user can claim tasks from bot
	if h.nodeService != nil {
		if _, _, actErr := h.nodeService.ActivateWalletAsNode(c.Request.Context(), req.WalletAddress); actErr != nil {
			log.Printf("telegram activate wallet-as-node: %v", actErr)
		}
	}
	// Register Telegram device (tg-{id}) for task assignment
	if h.deviceService != nil {
		deviceID := fmt.Sprintf("tg-%d", req.TelegramID)
		if linkErr := h.deviceService.LinkTelegramDevice(c.Request.Context(), deviceID, req.WalletAddress); linkErr != nil {
			log.Printf("telegram link device: %v", linkErr)
		}
	}

	// Gasless: subsidize onboarding for new users (first 5000)
	subsidized := false
	if !existed && h.gaslessUser != nil {
		sent, _ := h.gaslessUser.TrySubsidizeOnboarding(c.Request.Context(), req.WalletAddress)
		subsidized = sent
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "Wallet linked. Wallet-as-Node active — you can claim tasks.",
		"subsidized": subsidized,
	})
}

// GetBalance returns balance for telegram_id (linked wallet)
// GET /api/v1/telegram/bot/balance?telegram_id=123
func (h *TelegramBotHandler) GetBalance(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var telegramID int64
	if _, err := fmt.Sscanf(c.Query("telegram_id"), "%d", &telegramID); err != nil || telegramID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "telegram_id required"})
		return
	}
	var wallet string
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL
	`, telegramID).Scan(&wallet)
	if err != nil || wallet == "" {
		c.JSON(http.StatusOK, gin.H{"linked": false, "balance_gstd": 0, "pending_gstd": 0})
		return
	}
	var balance, pending sql.NullFloat64
	_ = h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(balance, 0) + COALESCE(gstd_balance, 0), COALESCE(pending_balance_gstd, 0)
		FROM users WHERE wallet_address = $1
	`, wallet).Scan(&balance, &pending)
	b, p := 0.0, 0.0
	if balance.Valid {
		b = balance.Float64
	}
	if pending.Valid {
		p = pending.Float64
	}
	c.JSON(http.StatusOK, gin.H{"linked": true, "wallet": wallet, "balance_gstd": b, "pending_gstd": p})
}

// GetNodes returns nodes/devices for telegram_id (device_id = tg-{id})
// GET /api/v1/telegram/bot/nodes?telegram_id=123
func (h *TelegramBotHandler) GetNodes(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var telegramID int64
	if _, err := fmt.Sscanf(c.Query("telegram_id"), "%d", &telegramID); err != nil || telegramID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "telegram_id required"})
		return
	}
	deviceID := fmt.Sprintf("tg-%d", telegramID)
	rows, err := h.db.QueryContext(c.Request.Context(), `
		SELECT device_id, last_seen_at, is_active
		FROM devices WHERE device_id = $1
		ORDER BY last_seen_at DESC LIMIT 5
	`, deviceID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"nodes": []interface{}{}})
		return
	}
	defer rows.Close()
	var nodes []map[string]interface{}
	for rows.Next() {
		var did string
		var lastSeen sql.NullTime
		var active bool
		if err := rows.Scan(&did, &lastSeen, &active); err != nil {
			continue
		}
		status := "🔴 Offline"
		if active && lastSeen.Valid {
			if time.Since(lastSeen.Time) < 5*time.Minute {
				status = "🟢 Online"
			}
		}
		nodes = append(nodes, map[string]interface{}{"device_id": did, "status": status})
	}
	if len(nodes) == 0 {
		nodes = append(nodes, map[string]interface{}{"device_id": deviceID, "status": "🔴 Not registered"})
	}
	c.JSON(http.StatusOK, gin.H{"nodes": nodes})
}

// GetWallet returns wallet for telegram_id
// GET /api/v1/telegram/bot/wallet?telegram_id=123
func (h *TelegramBotHandler) GetWallet(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var telegramID int64
	if _, err := fmt.Sscanf(c.Query("telegram_id"), "%d", &telegramID); err != nil || telegramID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "telegram_id required"})
		return
	}
	var wallet string
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL
	`, telegramID).Scan(&wallet)
	if err != nil || wallet == "" {
		c.JSON(http.StatusOK, gin.H{"wallet": "", "linked": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"wallet": wallet, "linked": true})
}

// ClaimTask claims a marketplace task for a Telegram user
// POST /api/v1/telegram/bot/claim
func (h *TelegramBotHandler) ClaimTask(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var req struct {
		TelegramID int64  `json:"telegram_id" binding:"required"`
		TaskID     string `json:"task_id" binding:"required"`
		DeviceID   string `json:"device_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.DeviceID == "" {
		req.DeviceID = "tg-" + fmt.Sprintf("%d", req.TelegramID)
	}
	var wallet string
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL
	`, req.TelegramID).Scan(&wallet)
	if err != nil || wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet not linked. Use /connect <wallet> first"})
		return
	}
	err = h.marketplace.ClaimTask(c.Request.Context(), req.TaskID, wallet, req.DeviceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Task claimed", "task_id": req.TaskID})
}

// AIChat handles AI chat requests from Telegram bot.
// POST /api/v1/telegram/bot/ai
//
// Two tiers — free is ALWAYS available:
// - Free: basic model + Collective Memory (shared context), unlimited
// - Pro:  best models + Cocoon (learns per-user), 0.1 GSTD per request (auto if balance > 0)
func (h *TelegramBotHandler) AIChat(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	if h.gateway == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "gateway_unavailable"})
		return
	}

	var req struct {
		TelegramID int64  `json:"telegram_id" binding:"required"`
		Text       string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	const costPerRequest = 0.1 // GSTD per Pro request

	// Resolve wallet: linked or temp
	var linkedWallet string
	_ = h.db.QueryRowContext(c.Request.Context(), `
		SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL
	`, req.TelegramID).Scan(&linkedWallet)

	wallet := linkedWallet
	if wallet == "" {
		wallet = fmt.Sprintf("tg-%d", req.TelegramID)
	}

	// Ensure user row exists
	_, _ = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO users (wallet_address, balance, gstd_balance, created_at, updated_at)
		VALUES ($1, 0, 0, NOW(), NOW())
		ON CONFLICT (wallet_address) DO NOTHING
	`, wallet)

	// Get GSTD balance
	var balance float64
	_ = h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1
	`, wallet).Scan(&balance)

	// Auto-select tier: if user has GSTD → Pro, else → Free (always works)
	tier := "free"
	model := "omega-auto" // Free: basic model + Collective Memory

	if balance >= costPerRequest {
		// ⚡ Pro: best models + Cocoon (learns from interactions)
		tier = "pro"
		model = "omega-pro"

		// Commission split: 10% → Development Fund (admin wallet), 5% → Cocoon Fund (Binance TON)
		developmentFee := costPerRequest * 0.10 // 10% → development_fund (admin wallet)
		cocoonFee := costPerRequest * 0.05      // 5% → cocoon_fund (Binance TON deposit for Cocoon payments)

		_, _ = h.db.ExecContext(c.Request.Context(), `
			UPDATE users SET
				gstd_balance = GREATEST(COALESCE(gstd_balance, 0) - $1, 0),
				ai_requests_count = COALESCE(ai_requests_count, 0) + 1,
				cocoon_interactions = COALESCE(cocoon_interactions, 0) + 1,
				updated_at = NOW()
			WHERE wallet_address = $2
		`, costPerRequest, wallet)

		// Route 10% to Development Fund (admin wallet = project dev fund)
		_, _ = h.db.ExecContext(c.Request.Context(), `
			INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('development_fund', $1)
			ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + $1
		`, developmentFee)
		_, _ = h.db.ExecContext(c.Request.Context(), `
			INSERT INTO platform_fund_transactions (fund_type, amount_gstd, tx_type, from_address, description)
			VALUES ('development_fund', $1, 'deposit', $2, 'AI Pro dev fund 10%')
		`, developmentFee, wallet)

		// Route 5% to Cocoon Fund (Binance TON deposit — pays for Cocoon AI work)
		_, _ = h.db.ExecContext(c.Request.Context(), `
			INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('cocoon_fund', $1)
			ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + $1
		`, cocoonFee)
		_, _ = h.db.ExecContext(c.Request.Context(), `
			INSERT INTO platform_fund_transactions (fund_type, amount_gstd, tx_type, from_address, description)
			VALUES ('cocoon_fund', $1, 'deposit', $2, 'AI Pro cocoon payment 5%')
		`, cocoonFee, wallet)

		balance -= costPerRequest
	} else {
		// 🆓 Free: basic model + Collective Memory (always available)
		_, _ = h.db.ExecContext(c.Request.Context(), `
			UPDATE users SET
				ai_requests_count = COALESCE(ai_requests_count, 0) + 1,
				updated_at = NOW()
			WHERE wallet_address = $1
		`, wallet)
	}

	// Cocoon context: how many interactions this user has (Pro users get smarter responses)
	var cocoonLevel int
	_ = h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(cocoon_interactions, 0) FROM users WHERE wallet_address = $1
	`, wallet).Scan(&cocoonLevel)

	// Prepare request for GatewayHandler
	c.Set("wallet_address", wallet)

	// Build system prompt based on tier
	systemPrompt := "You are GSTD Swarm AI. Answer concisely and helpfully. You have access to Collective Memory — shared knowledge from all users."
	if tier == "pro" && cocoonLevel > 0 {
		systemPrompt = fmt.Sprintf(
			"You are GSTD Swarm AI in Cocoon Pro mode. This user has %d prior interactions — adapt to their style and interests. "+
				"Use advanced reasoning, extended context, and deep analysis. You learn from each conversation to become smarter. "+
				"Access: Collective Memory + personal Cocoon memory.",
			cocoonLevel)
	}

	chatReq := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": req.Text},
		},
	}
	jsonBody, _ := json.Marshal(chatReq)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(jsonBody))
	c.Request.Header.Set("Content-Type", "application/json")
	// Mark as prepaid so Gateway doesn't double-deduct
	c.Request.Header.Set("X-GSTD-Prepaid", "true")

	// Response headers for the bot to render footer
	c.Header("X-GSTD-Tier", tier)
	c.Header("X-GSTD-Balance", fmt.Sprintf("%.2f", balance))
	c.Header("X-GSTD-Cocoon", fmt.Sprintf("%d", cocoonLevel))

	h.gateway.HandleChatCompletions(c)
}

// ClaimReward claims pending mining rewards into available balance
// POST /api/v1/telegram/bot/claim_reward
func (h *TelegramBotHandler) ClaimReward(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var req struct {
		TelegramID int64 `json:"telegram_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Find wallet (linked or tg-{id})
	var wallet string
	_ = h.db.QueryRowContext(c.Request.Context(), `
		SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL
	`, req.TelegramID).Scan(&wallet)
	if wallet == "" {
		wallet = fmt.Sprintf("tg-%d", req.TelegramID)
	}

	// Check pending balance
	var pending float64
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1
	`, wallet).Scan(&pending)
	if err != nil || pending < 0.01 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"claimed": 0,
			"message": "no_pending_rewards",
		})
		return
	}

	// Commission on claim: 10% → Development Fund (admin wallet), 5% → Cocoon Fund (Binance TON)
	developmentFee := pending * 0.10
	cocoonFee := pending * 0.05
	net := pending - developmentFee - cocoonFee // 85% to user

	// Move pending → available (net after commission)
	_, err = h.db.ExecContext(c.Request.Context(), `
		UPDATE users SET
			pending_balance_gstd = 0,
			gstd_balance = COALESCE(gstd_balance, 0) + $1,
			updated_at = NOW()
		WHERE wallet_address = $2
	`, net, wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "claim_failed"})
		return
	}

	// Route 10% to Development Fund (admin wallet)
	_, _ = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('development_fund', $1)
		ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + $1
	`, developmentFee)
	_, _ = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO platform_fund_transactions (fund_type, amount_gstd, tx_type, from_address, description)
		VALUES ('development_fund', $1, 'deposit', $2, 'Claim dev fund 10%')
	`, developmentFee, wallet)

	// Route 5% to Cocoon Fund (Binance TON deposit — pays for Cocoon AI compute)
	_, _ = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('cocoon_fund', $1)
		ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + $1
	`, cocoonFee)
	_, _ = h.db.ExecContext(c.Request.Context(), `
		INSERT INTO platform_fund_transactions (fund_type, amount_gstd, tx_type, from_address, description)
		VALUES ('cocoon_fund', $1, 'deposit', $2, 'Claim cocoon payment 5%')
	`, cocoonFee, wallet)

	log.Printf("[Claim] %s: %.4f pending → %.4f net (dev=%.4f, cocoon=%.4f)", wallet, pending, net, developmentFee, cocoonFee)

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"claimed_gross":    pending,
		"commission":       developmentFee + cocoonFee,
		"claimed_net":      net,
		"development_fund": developmentFee,
		"cocoon_fund":      cocoonFee,
	})
}

// CompleteTask completes a marketplace task
// POST /api/v1/telegram/bot/complete
func (h *TelegramBotHandler) CompleteTask(c *gin.Context) {
	if h == nil || h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "service_unavailable"})
		return
	}
	var req struct {
		TelegramID      int64           `json:"telegram_id" binding:"required"`
		TaskID          string          `json:"task_id" binding:"required"`
		ResultData      json.RawMessage `json:"result_data"`
		ExecutionTimeMs int             `json:"execution_time_ms"`
		QualityScore    float64         `json:"quality_score"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.QualityScore <= 0 {
		req.QualityScore = 0.9
	}
	var wallet string
	err := h.db.QueryRowContext(c.Request.Context(), `
		SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL
	`, req.TelegramID).Scan(&wallet)
	if err != nil || wallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "wallet not linked"})
		return
	}
	receipt, err := h.marketplace.CompleteTask(c.Request.Context(), req.TaskID, wallet,
		req.ExecutionTimeMs, req.QualityScore, req.ResultData)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"receipt_id":  receipt.ReceiptID,
		"reward_gstd": receipt.RewardGSTD,
		"task_id":     req.TaskID,
	})
}
