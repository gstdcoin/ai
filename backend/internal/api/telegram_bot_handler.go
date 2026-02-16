package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

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
	db               *sql.DB
	marketplace      *services.MarketplaceService
	nodeService      *services.NodeService
	deviceService    *services.DeviceService
	gaslessUser      *services.GaslessUserService
}

// NewTelegramBotHandler creates the handler
func NewTelegramBotHandler(db *sql.DB, marketplace *services.MarketplaceService, nodeService *services.NodeService, deviceService *services.DeviceService, gaslessUser *services.GaslessUserService) *TelegramBotHandler {
	return &TelegramBotHandler{
		db: db, marketplace: marketplace, nodeService: nodeService, deviceService: deviceService, gaslessUser: gaslessUser,
	}
}

// LinkWallet links telegram_id to wallet_address
// POST /api/v1/telegram/bot/link
func (h *TelegramBotHandler) LinkWallet(c *gin.Context) {
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
		"success":     true,
		"message":     "Wallet linked. Wallet-as-Node active — you can claim tasks.",
		"subsidized":  subsidized,
	})
}

// GetBalance returns balance for telegram_id (linked wallet)
// GET /api/v1/telegram/bot/balance?telegram_id=123
func (h *TelegramBotHandler) GetBalance(c *gin.Context) {
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

// CompleteTask completes a marketplace task
// POST /api/v1/telegram/bot/complete
func (h *TelegramBotHandler) CompleteTask(c *gin.Context) {
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
