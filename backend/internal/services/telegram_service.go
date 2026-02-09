package services

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// TelegramService handles sending notifications via Telegram Bot API
type TelegramService struct {
	botToken  string
	chatID    string
	apiURL    string
	httpClient *http.Client
	enabled   bool
	db        *sql.DB
}

// NewTelegramService creates a new Telegram service
// If botToken or chatID is empty, the service will be disabled (no errors, just silent)
// NewTelegramService creates a new Telegram service
// If botToken or chatID is empty, the service will be disabled (no errors, just silent)
func NewTelegramService(botToken, chatID string, db *sql.DB) *TelegramService {
	enabled := botToken != "" && chatID != ""
	if !enabled {
		log.Println("⚠️  Telegram notifications disabled (missing bot token or chat ID)")
	}

	svc := &TelegramService{
		botToken: botToken,
		chatID:   chatID,
		apiURL:   "https://api.telegram.org/bot",
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		enabled: enabled,
		db:      db,
	}

    // Ensure DB schema for user linking
    if enabled && db != nil {
        svc.EnsureSchema()
    }
    
    return svc
}

// SendMessage sends a text message to the configured Telegram chat
func (s *TelegramService) SendMessage(ctx context.Context, text string) error {
	if !s.enabled {
		return nil // Silently skip if disabled
	}

	url := fmt.Sprintf("%s%s/sendMessage", s.apiURL, s.botToken)
	
	payload := map[string]interface{}{
		"chat_id":    s.chatID,
		"text":       text,
		"parse_mode": "HTML",
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal telegram payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create telegram request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send telegram message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned status %d", resp.StatusCode)
	}

	log.Printf("✅ Telegram message sent to chat %s", s.chatID)
	return nil
}

// NotifyNewTask sends a notification about a new task
func (s *TelegramService) NotifyNewTask(ctx context.Context, taskID, taskType, requester string, rewardGSTD float64) error {
	message := fmt.Sprintf(
		"🆕 <b>New Task Created</b>\n\n"+
			"📋 <b>Type:</b> %s\n"+
			"🆔 <b>ID:</b> <code>%s</code>\n"+
			"👤 <b>Requester:</b> <code>%s</code>\n"+
			"💰 <b>Reward:</b> %.6f GSTD\n"+
			"⏰ <b>Time:</b> %s",
		taskType,
		taskID,
		requester,
		rewardGSTD,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	return s.SendMessage(ctx, message)
}

// NotifyTaskCompleted sends a notification about a completed task
func (s *TelegramService) NotifyTaskCompleted(ctx context.Context, taskID, taskType, executor string, rewardGSTD float64) error {
	message := fmt.Sprintf(
		"✅ <b>Task Completed</b>\n\n"+
			"📋 <b>Type:</b> %s\n"+
			"🆔 <b>ID:</b> <code>%s</code>\n"+
			"👷 <b>Executor:</b> <code>%s</code>\n"+
			"💰 <b>Reward:</b> %.6f GSTD\n"+
			"⏰ <b>Time:</b> %s",
		taskType,
		taskID,
		executor,
		rewardGSTD,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	return s.SendMessage(ctx, message)
}

// IsEnabled returns whether the Telegram service is enabled
func (s *TelegramService) IsEnabled() bool {
	return s.enabled
}

// TelegramUpdate represents an incoming update from Telegram
type TelegramUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		MessageID int64 `json:"message_id"`
		From      struct {
			ID        int64  `json:"id"`
			FirstName string `json:"first_name"`
			Username  string `json:"username"`
		} `json:"from"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
	CallbackQuery *struct {
		ID      string `json:"id"`
		From    struct {
			ID        int64  `json:"id"`
			FirstName string `json:"first_name"`
		} `json:"from"`
		Message *struct {
			MessageID int64 `json:"message_id"`
			Chat      struct {
				ID int64 `json:"id"`
			} `json:"chat"`
		} `json:"message"`
		Data string `json:"data"`
	} `json:"callback_query"`
}

// ProcessWebhook handles an incoming webhook from Telegram
func (s *TelegramService) ProcessWebhook(ctx context.Context, body []byte) error {
	if !s.enabled {
		return nil
	}

	var update TelegramUpdate
	if err := json.Unmarshal(body, &update); err != nil {
		return fmt.Errorf("failed to parse update: %w", err)
	}

	// Handle Callbacks (Interactive Buttons)
	if update.CallbackQuery != nil {
		return s.handleCallback(ctx, update.CallbackQuery)
	}

	// Handle Messages
	if update.Message != nil {
		return s.handleMessage(ctx, update.Message)
	}

	return nil
}

func (s *TelegramService) handleMessage(ctx context.Context, msg *struct {
	MessageID int64 `json:"message_id"`
	From      struct {
		ID        int64  `json:"id"`
		FirstName string `json:"first_name"`
		Username  string `json:"username"`
	} `json:"from"`
	Chat struct {
		ID int64 `json:"id"`
	} `json:"chat"`
	Text string `json:"text"`
}) error {
	// Admin check
	isAdmin := fmt.Sprintf("%d", msg.Chat.ID) == s.chatID

	switch {
	case strings.HasPrefix(msg.Text, "/start"):
		return s.sendWelcomeBytes(ctx, msg.Chat.ID, msg.Text, msg.From.ID, isAdmin)
	case strings.HasPrefix(msg.Text, "/admin"):
		if isAdmin {
			return s.sendAdminDashboard(ctx, msg.Chat.ID)
		}
	case strings.HasPrefix(msg.Text, "/stats"):
		if isAdmin {
			return s.sendStats(ctx, msg.Chat.ID)
		}
	case strings.HasPrefix(msg.Text, "/withdrawals"):
		if isAdmin {
			return s.sendPendingWithdrawals(ctx, msg.Chat.ID)
		}
	case strings.HasPrefix(msg.Text, "/broadcast"):
		if isAdmin {
			text := strings.TrimPrefix(msg.Text, "/broadcast ")
			return s.broadcastMessage(ctx, text)
		}
	case strings.HasPrefix(msg.Text, "/approve"):
		if isAdmin {
			id := strings.TrimPrefix(msg.Text, "/approve ")
			return s.approveWithdrawal(ctx, id)
		}
	case strings.HasPrefix(msg.Text, "/me"):
		return s.sendUserStats(ctx, msg.Chat.ID, msg.From.ID)
	case strings.HasPrefix(msg.Text, "/help"):
		return s.sendHelp(ctx, msg.Chat.ID, isAdmin)
	}

	return nil
}

func (s *TelegramService) handleCallback(ctx context.Context, cb *struct {
	ID      string `json:"id"`
	From    struct {
		ID        int64  `json:"id"`
		FirstName string `json:"first_name"`
	} `json:"from"`
	Message *struct {
		MessageID int64 `json:"message_id"`
		Chat      struct {
			ID int64 `json:"id"`
		} `json:"chat"`
	} `json:"message"`
	Data string `json:"data"`
}) error {
	isAdmin := fmt.Sprintf("%d", cb.Message.Chat.ID) == s.chatID

	switch {
	case cb.Data == "refresh_admin":
		if isAdmin {
			return s.sendAdminDashboard(ctx, cb.Message.Chat.ID)
		}
	case strings.HasPrefix(cb.Data, "approve:"):
		if isAdmin {
			id := strings.TrimPrefix(cb.Data, "approve:")
			return s.approveWithdrawal(ctx, id)
		}
	case cb.Data == "refresh_me":
		return s.sendUserStats(ctx, cb.Message.Chat.ID, cb.From.ID)
	}
	return nil
}

func (s *TelegramService) sendWelcomeBytes(ctx context.Context, chatID int64, text string, telegramID int64, isAdmin bool) error {
	var welcomeExtras string
	
	// Check for referral code
	parts := strings.Split(text, " ")
	if len(parts) > 1 && parts[1] != "" {
		refCode := parts[1]
		if s.db != nil {
			_, err := s.db.ExecContext(ctx, `
				INSERT INTO pending_referrals (telegram_id, referral_code) 
				VALUES ($1, $2)
				ON CONFLICT (telegram_id) DO UPDATE SET referral_code = $2
			`, telegramID, refCode)
			
			if err == nil {
				welcomeExtras = fmt.Sprintf("\n\n🤝 <b>Referral Applied!</b>\nCode: <code>%s</code>", refCode)
			}
		}
	}

	message := "👋 <b>Welcome to GSTD Platform!</b>\n\n" +
		"Control your decentralized computing experience directly from Telegram.\n" +
		welcomeExtras + "\n" +
		"👇 <b>Choose an action:</b>"
	
	buttons := [][]map[string]interface{}{
		{
			{
				"text": "🚀 Open Dashboard",
				"web_app": map[string]interface{}{
					"url": "https://app.gstdtoken.com",
				},
			},
		},
		{
			{
				"text": "👤 My Stats",
				"callback_data": "refresh_me",
			},
		},
	}

	if isAdmin {
		buttons = append(buttons, []map[string]interface{}{
			{
				"text": "🛡️ Admin Panel",
				"callback_data": "refresh_admin",
			},
		})
	}

	keyboard := map[string]interface{}{
		"inline_keyboard": buttons,
	}

	return s.sendWithKeyboard(ctx, chatID, message, keyboard)
}

func (s *TelegramService) sendAdminDashboard(ctx context.Context, chatID int64) error {
	if s.db == nil {
		return s.SendMessage(ctx, "Error: DB not initialized")
	}

	// Fetch health stats
	var activeNodes, totalTasks int
	var pendingWithdrawals int
	var totalGSTD float64

	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices WHERE is_active = true").Scan(&activeNodes)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM withdrawal_locks WHERE status = 'pending_approval'").Scan(&pendingWithdrawals)
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(labor_compensation_gstd), 0) FROM tasks WHERE status = 'completed'").Scan(&totalGSTD)

	msg := fmt.Sprintf(
		"🛡️ <b>ADMIN CONTROL PANEL</b>\n\n"+
			"🟢 <b>Active Nodes:</b> %d\n"+
			"📋 <b>Total Tasks:</b> %d\n"+
			"💰 <b>Total Paid:</b> %.2f GSTD\n"+
			"⏳ <b>Pending Withdrawals:</b> %d\n\n"+
			"<i>Select an action below:</i>",
		activeNodes, totalTasks, totalGSTD, pendingWithdrawals,
	)

	keyboard := map[string]interface{}{
		"inline_keyboard": [][]map[string]interface{}{
			{
				{"text": "🔄 Refresh", "callback_data": "refresh_admin"}, 
			},
		},
	}
	
	// If there are pending withdrawals, list them as buttons
	if pendingWithdrawals > 0 {
		// List first 5 withdrawals
		rows, _ := s.db.QueryContext(ctx, "SELECT id, amount_gstd, worker_wallet FROM withdrawal_locks WHERE status = 'pending_approval' LIMIT 5")
		defer rows.Close()
		var wButtons []map[string]interface{}
		for rows.Next() {
			var id int
			var amount float64
			var wallet string
			rows.Scan(&id, &amount, &wallet)
			if len(wallet) > 8 {
				wallet = wallet[:4] + "..." + wallet[len(wallet)-4:]
			}
			wButtons = append(wButtons, map[string]interface{}{
				"text": fmt.Sprintf("Approve %.2f GSTD (%s)", amount, wallet),
				"callback_data": fmt.Sprintf("approve:%d", id),
			})
		}
		// Add withdrawal buttons individually
		for _, btn := range wButtons {
			keyboard["inline_keyboard"] = append(keyboard["inline_keyboard"].([][]map[string]interface{}), []map[string]interface{}{btn})
		}
	}

	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
}

func (s *TelegramService) sendStats(ctx context.Context, chatID int64) error {
	return s.sendAdminDashboard(ctx, chatID)
}

func (s *TelegramService) sendPendingWithdrawals(ctx context.Context, chatID int64) error {
	return s.sendAdminDashboard(ctx, chatID)
}

func (s *TelegramService) approveWithdrawal(ctx context.Context, idStr string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE withdrawal_locks 
		SET status = 'approved', approved_by = 'telegram_admin', approved_at = NOW() 
		WHERE id = $1 AND status = 'pending_approval'`, idStr)
	
	if err != nil {
		s.SendMessage(ctx, fmt.Sprintf("❌ Error approving withdrawal %s: %v", idStr, err))
		return err
	}
	
	s.SendMessage(ctx, fmt.Sprintf("✅ Withdrawal %s approved successfully.", idStr))
	return nil
}

func (s *TelegramService) broadcastMessage(ctx context.Context, text string) error {
	return s.SendMessage(ctx, fmt.Sprintf("📢 <b>Broadcast Sent:</b>\n\n%s", text))
}

func (s *TelegramService) sendUserStats(ctx context.Context, chatID int64, telegramID int64) error {
	var wallet string
	var balance float64
	var activeNodes int
	
	// Query user info - Ensure telegram_id column exists (via EnsureSchema)
	query := `SELECT wallet_address, balance FROM users WHERE telegram_id = $1`
	
	// Check if column exists by trying query (simplified check)
	err := s.db.QueryRowContext(ctx, query, telegramID).Scan(&wallet, &balance)
	
	if err != nil {
		msg := "👤 <b>User Profile</b>\n\n" +
			"🚫 Wallet not linked.\n\n" +
			"Please open the <b>Dashboard</b> to connect your wallet."
		
		keyboard := map[string]interface{}{
			"inline_keyboard": [][]map[string]interface{}{
				{
					{
						"text": "🚀 Connect Wallet",
						"web_app": map[string]interface{}{
							"url": "https://app.gstdtoken.com",
						},
					},
				},
			},
		}
		return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
	}
	
	// Get active nodes
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices WHERE wallet_address = $1 AND is_active = true", wallet).Scan(&activeNodes)
	
	msg := fmt.Sprintf(
		"👤 <b>User Profile</b>\n\n"+
			"👛 <b>Wallet:</b> <code>%s...%s</code>\n"+
			"💰 <b>Balance:</b> %.2f GSTD\n"+
			"🖥️ <b>Active Nodes:</b> %d\n\n"+
			"<i>Use the dashboard for full control.</i>",
		wallet[:4], wallet[len(wallet)-4:], balance, activeNodes,
	)
	
	keyboard := map[string]interface{}{
		"inline_keyboard": [][]map[string]interface{}{
			{
				{"text": "🔄 Refresh", "callback_data": "refresh_me"},
				{"text": "📱 Dashboard", "web_app": map[string]interface{}{"url": "https://app.gstdtoken.com"}},
			},
		},
	}
	
	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
}

func (s *TelegramService) sendHelp(ctx context.Context, chatID int64, isAdmin bool) error {
	msg := "❓ <b>Help & Commands</b>\n\n" +
		"/start - Open menu\n" +
		"/me - My stats\n" +
		"/help - Show this message"
	
	if isAdmin {
		msg += "\n\n<b>Admin Commands:</b>\n" +
			"/admin - Admin Dashboard\n" +
			"/withdrawals - Pending payouts\n" +
			"/approve [id] - Approve payout\n" +
			"/broadcast [msg] - Send announcement"
	}
	
	return s.SendMessage(ctx, msg)
}

// EnsureSchema checks and migrates DB schema for Telegram features
func (s *TelegramService) EnsureSchema() {
	if s.db == nil {
		return
	}
	// Add telegram_id to users if not exists
	_, err := s.db.Exec(`
		DO $$ 
		BEGIN 
			IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='telegram_id') THEN 
				ALTER TABLE users ADD COLUMN telegram_id BIGINT;
				CREATE INDEX idx_users_telegram_id ON users(telegram_id);
			END IF;
		END $$;
	`)
	if err != nil {
		// Fallback for simple query if DO block fails (some connectors)
		if strings.Contains(err.Error(), "syntax error") {
			s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT`)
			s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`)
		} else {
			log.Printf("⚠️  TelegramService Schema Migration Warning: %v", err)
		}
	} else {
		log.Printf("✅ TelegramService Schema Verified (telegram_id column)")
	}
}

// sendWithKeyboard sends a message with an inline keyboard to a specific chat
func (s *TelegramService) sendWithKeyboard(ctx context.Context, chatID int64, text string, replyMarkup interface{}) error {
	if !s.enabled {
		return nil
	}
	return s.sendPayload(ctx, map[string]interface{}{
		"chat_id":      chatID,
		"text":         text,
		"parse_mode":   "HTML",
		"reply_markup": replyMarkup,
	})
}

// Helper to send generic payload
func (s *TelegramService) sendPayload(ctx context.Context, payload map[string]interface{}) error {
	url := fmt.Sprintf("%s%s/sendMessage", s.apiURL, s.botToken)
	
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal telegram payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create telegram request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send telegram message: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned status %d", resp.StatusCode)
	}

	return nil
}
