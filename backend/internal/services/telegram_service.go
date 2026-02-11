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
	case strings.HasPrefix(msg.Text, "/chat"):
		query := strings.TrimPrefix(msg.Text, "/chat ")
		if query == "/chat" || query == "" {
			return s.sendToChat(ctx, msg.Chat.ID, "Usage: /chat <your question>\n\nExample: /chat Write a hello world in Python")
		}
		return s.handleChatCommand(ctx, msg.Chat.ID, msg.From.ID, query)
	case strings.HasPrefix(msg.Text, "/mining"):
		return s.sendMiningStats(ctx, msg.Chat.ID, msg.From.ID)
	case strings.HasPrefix(msg.Text, "/balance"):
		return s.sendBalanceDetails(ctx, msg.Chat.ID, msg.From.ID)
	case strings.HasPrefix(msg.Text, "/agents"):
		return s.sendAgentsList(ctx, msg.Chat.ID)
	case strings.HasPrefix(msg.Text, "/reserve"):
		return s.sendReserveStats(ctx, msg.Chat.ID)
	default:
		// If user sends plain text (not a command), treat as chat
		if !strings.HasPrefix(msg.Text, "/") && len(msg.Text) > 2 {
			return s.handleChatCommand(ctx, msg.Chat.ID, msg.From.ID, msg.Text)
		}
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
	case cb.Data == "show_mining":
		return s.sendMiningStats(ctx, cb.Message.Chat.ID, cb.From.ID)
	case cb.Data == "show_balance":
		return s.sendBalanceDetails(ctx, cb.Message.Chat.ID, cb.From.ID)
	case cb.Data == "show_agents":
		return s.sendAgentsList(ctx, cb.Message.Chat.ID)
	case cb.Data == "show_reserve":
		return s.sendReserveStats(ctx, cb.Message.Chat.ID)
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
	msg := "❓ <b>GSTD Platform — Commands</b>\n\n" +
		"<b>🧠 AI & Chat:</b>\n" +
		"/chat [query] — Ask Sovereign AI\n" +
		"<i>Or just type any question directly!</i>\n\n" +
		"<b>💰 Account:</b>\n" +
		"/me — My profile & stats\n" +
		"/balance — Detailed balance info\n" +
		"/mining — Mining & earnings dashboard\n\n" +
		"<b>🌐 Platform:</b>\n" +
		"/agents — AI Agent marketplace\n" +
		"/reserve — Golden Reserve stats\n" +
		"/help — Show this message"
	
	if isAdmin {
		msg += "\n\n<b>🛡 Admin Commands:</b>\n" +
			"/admin — Admin Dashboard\n" +
			"/stats — Network statistics\n" +
			"/withdrawals — Pending payouts\n" +
			"/approve [id] — Approve payout\n" +
			"/broadcast [msg] — Send announcement"
	}

	buttons := [][]map[string]interface{}{
		{
			{"text": "💬 Chat with AI", "callback_data": "chat_again"},
			{"text": "⛏ Mining", "callback_data": "show_mining"},
		},
		{
			{"text": "💰 Balance", "callback_data": "show_balance"},
			{"text": "🏛 Reserve", "callback_data": "show_reserve"},
		},
		{
			{"text": "🚀 Open Dashboard", "web_app": map[string]interface{}{"url": "https://app.gstdtoken.com"}},
		},
	}

	keyboard := map[string]interface{}{"inline_keyboard": buttons}
	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
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

// ============================================================================
// AI CHAT VIA TELEGRAM (Sovereign Intelligence Mobile Node)
// ============================================================================

// handleChatCommand processes AI chat queries through Telegram
func (s *TelegramService) handleChatCommand(ctx context.Context, chatID int64, telegramID int64, query string) error {
	// Send "typing" indicator
	s.sendChatAction(ctx, chatID, "typing")

	// Call local Ollama for inference
	ollamaURL := "http://ollama:11434"
	if url := strings.TrimSpace(fmt.Sprintf("%s", "http://gstd_ollama:11434")); url != "" {
		ollamaURL = url
	}

	reqBody := map[string]interface{}{
		"model": "qwen2.5-coder:7b",
		"messages": []map[string]string{
			{"role": "system", "content": "You are GSTD Sovereign AI, a helpful assistant running on a decentralized network. Be concise. Use Telegram-compatible HTML formatting (<b>, <i>, <code>)."},
			{"role": "user", "content": query},
		},
		"stream": false,
		"options": map[string]interface{}{
			"num_predict": 500,
			"temperature": 0.7,
		},
	}

	body, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", ollamaURL+"/api/chat", bytes.NewBuffer(body))
	if err != nil {
		return s.sendToChat(ctx, chatID, "⚠️ Failed to create AI request")
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return s.sendToChat(ctx, chatID, "⚠️ AI Engine is currently busy. Please try again in a moment.")
	}
	defer resp.Body.Close()

	var ollamaResp struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if json.NewDecoder(resp.Body).Decode(&ollamaResp) != nil || ollamaResp.Message.Content == "" {
		return s.sendToChat(ctx, chatID, "⚠️ Could not parse AI response")
	}

	// Truncate if too long for Telegram (max 4096 chars)
	content := ollamaResp.Message.Content
	if len(content) > 3800 {
		content = content[:3800] + "\n\n<i>... (truncated)</i>"
	}

	response := fmt.Sprintf("🧠 <b>Sovereign AI</b>\n\n%s\n\n<i>Model: qwen2.5-coder:7b • Decentralized</i>", content)

	// Send with quick action buttons
	buttons := [][]map[string]interface{}{
		{
			{"text": "💬 Ask Again", "callback_data": "chat_again"},
			{"text": "📊 My Stats", "callback_data": "refresh_me"},
		},
	}

	keyboard := map[string]interface{}{"inline_keyboard": buttons}
	return s.sendWithKeyboard(ctx, chatID, response, keyboard)
}

// sendMiningStats shows mining/worker statistics for a user
func (s *TelegramService) sendMiningStats(ctx context.Context, chatID int64, telegramID int64) error {
	if s.db == nil {
		return s.sendToChat(ctx, chatID, "⚠️ Database not available")
	}

	// Find wallet by telegram ID
	var walletAddress string
	err := s.db.QueryRowContext(ctx, "SELECT wallet_address FROM users WHERE telegram_id = $1", telegramID).Scan(&walletAddress)
	if err != nil {
		return s.sendToChat(ctx, chatID, "⚠️ Wallet not linked.\n\nPlease connect your TON wallet on the dashboard first: https://app.gstdtoken.com")
	}

	// Fetch mining stats
	var totalTasks, completedTasks int
	var totalEarned float64
	var activeDevices int

	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE requester_address = $1", walletAddress).Scan(&totalTasks)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE requester_address = $1 AND status = 'completed'", walletAddress).Scan(&completedTasks)
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(labor_compensation_gstd), 0) FROM tasks WHERE requester_address = $1 AND status = 'completed'", walletAddress).Scan(&totalEarned)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices WHERE wallet_address = $1 AND is_active = true", walletAddress).Scan(&activeDevices)

	// Pending balance
	var pendingBalance float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1", walletAddress).Scan(&pendingBalance)

	msg := fmt.Sprintf(
		"⛏️ <b>MINING DASHBOARD</b>\n\n"+
			"🖥 <b>Active Nodes:</b> %d\n"+
			"📋 <b>Tasks Completed:</b> %d / %d\n"+
			"💰 <b>Total Earned:</b> %.4f GSTD\n"+
			"⏳ <b>Pending Balance:</b> %.4f GSTD\n\n"+
			"💡 <i>Keep your nodes online to maximize earnings!</i>",
		activeDevices, completedTasks, totalTasks, totalEarned, pendingBalance,
	)

	buttons := [][]map[string]interface{}{
		{
			{"text": "💰 Balance Details", "callback_data": "show_balance"},
			{"text": "🔄 Refresh", "callback_data": "show_mining"},
		},
		{
			{"text": "🚀 Open Dashboard", "web_app": map[string]interface{}{"url": "https://app.gstdtoken.com/dashboard"}},
		},
	}

	keyboard := map[string]interface{}{"inline_keyboard": buttons}
	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
}

// sendBalanceDetails shows detailed balance breakdown
func (s *TelegramService) sendBalanceDetails(ctx context.Context, chatID int64, telegramID int64) error {
	if s.db == nil {
		return s.sendToChat(ctx, chatID, "⚠️ Database not available")
	}

	var walletAddress string
	err := s.db.QueryRowContext(ctx, "SELECT wallet_address FROM users WHERE telegram_id = $1", telegramID).Scan(&walletAddress)
	if err != nil {
		return s.sendToChat(ctx, chatID, "⚠️ Wallet not linked. Connect at https://app.gstdtoken.com")
	}

	var pendingBalance float64
	var referralCode sql.NullString
	s.db.QueryRowContext(ctx, "SELECT COALESCE(pending_balance_gstd, 0), referral_code FROM users WHERE wallet_address = $1", walletAddress).Scan(&pendingBalance, &referralCode)

	// API key count
	var apiKeyCount int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM user_api_keys WHERE user_wallet = $1", walletAddress).Scan(&apiKeyCount)

	// API usage stats
	var totalQueries int
	var totalSpent float64
	s.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(SUM(cost_gstd), 0) FROM api_usage_log WHERE wallet_address = $1", walletAddress).Scan(&totalQueries, &totalSpent)

	msg := fmt.Sprintf(
		"💰 <b>BALANCE DETAILS</b>\n\n"+
			"🔗 <b>Wallet:</b> <code>%s...%s</code>\n\n"+
			"⏳ <b>Pending (Off-chain):</b> %.4f GSTD\n"+
			"🔑 <b>API Keys:</b> %d active\n"+
			"🤖 <b>AI Queries:</b> %d\n"+
			"💸 <b>AI Spend:</b> %.4f GSTD\n",
		walletAddress[:8], walletAddress[len(walletAddress)-4:],
		pendingBalance, apiKeyCount, totalQueries, totalSpent,
	)

	if referralCode.Valid && referralCode.String != "" {
		msg += fmt.Sprintf("\n🤝 <b>Referral Code:</b> <code>%s</code>\n", referralCode.String)
	}

	msg += "\n<i>On-chain balance is checked via TON blockchain.</i>"

	buttons := [][]map[string]interface{}{
		{
			{"text": "⛏ Mining Stats", "callback_data": "show_mining"},
			{"text": "🏛 Gold Reserve", "callback_data": "show_reserve"},
		},
		{
			{"text": "🚀 Open Dashboard", "web_app": map[string]interface{}{"url": "https://app.gstdtoken.com/dashboard"}},
		},
	}

	keyboard := map[string]interface{}{"inline_keyboard": buttons}
	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
}

// sendAgentsList shows available agents on the marketplace
func (s *TelegramService) sendAgentsList(ctx context.Context, chatID int64) error {
	msg := "🤖 <b>AGENT MARKETPLACE</b>\n\n" +
		"Connect AI agents to the GSTD network:\n\n" +
		"📌 <b>A2A Protocol</b> — Agent-to-Agent communication\n" +
		"📌 <b>OpenAI Gateway</b> — Compatible with Cursor, VS Code\n" +
		"📌 <b>Python SDK</b> — Build autonomous agents\n" +
		"📌 <b>x402 Payments</b> — Auto-pay via TON blockchain\n\n" +
		"🔗 API: <code>https://api.gstdtoken.com/v1</code>\n\n" +
		"<i>Any tool that supports OpenAI API can use GSTD.</i>"

	buttons := [][]map[string]interface{}{
		{
			{"text": "📖 Documentation", "url": "https://app.gstdtoken.com/docs"},
			{"text": "💬 Ask AI", "callback_data": "chat_again"},
		},
	}

	keyboard := map[string]interface{}{"inline_keyboard": buttons}
	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
}

// sendReserveStats shows golden reserve statistics
func (s *TelegramService) sendReserveStats(ctx context.Context, chatID int64) error {
	if s.db == nil {
		return s.sendToChat(ctx, chatID, "⚠️ Database not available")
	}

	var totalBurned float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns").Scan(&totalBurned)

	var xautBalance float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(xaut_balance, 0) FROM golden_reserve_log ORDER BY created_at DESC LIMIT 1").Scan(&xautBalance)

	var gstdInPool float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(gstd_balance, 0) FROM golden_reserve_log ORDER BY created_at DESC LIMIT 1").Scan(&gstdInPool)

	currentSupply := 1_000_000_000.0 - totalBurned
	deflation := (totalBurned / 1_000_000_000.0) * 100
	goldValueUSD := xautBalance * 2750.0

	msg := fmt.Sprintf(
		"🏛 <b>GOLDEN RESERVE</b>\n\n"+
			"🥇 <b>XAUt Balance:</b> %.6f\n"+
			"💵 <b>USD Value:</b> $%.2f\n\n"+
			"📊 <b>GSTD in Pool:</b> %.2f\n"+
			"🔥 <b>Total Burned:</b> %.2f GSTD\n"+
			"📉 <b>Deflation:</b> %.4f%%\n"+
			"💎 <b>Current Supply:</b> %.0f / 1B\n\n"+
			"<i>2%% of every transaction → Gold Reserve\n"+
			"5%% of every transaction → Burn 🔥</i>",
		xautBalance, goldValueUSD, gstdInPool, totalBurned, deflation, currentSupply,
	)

	buttons := [][]map[string]interface{}{
		{
			{"text": "🔄 Refresh", "callback_data": "show_reserve"},
			{"text": "💰 My Balance", "callback_data": "show_balance"},
		},
	}

	keyboard := map[string]interface{}{"inline_keyboard": buttons}
	return s.sendWithKeyboard(ctx, chatID, msg, keyboard)
}

// sendChatAction sends a "typing" indicator to Telegram
func (s *TelegramService) sendChatAction(ctx context.Context, chatID int64, action string) {
	url := fmt.Sprintf("%s%s/sendChatAction", s.apiURL, s.botToken)
	payload := map[string]interface{}{"chat_id": chatID, "action": action}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if req != nil {
		req.Header.Set("Content-Type", "application/json")
		s.httpClient.Do(req) // fire and forget
	}
}

// Helper to send a simple text message to a specific chat
func (s *TelegramService) sendToChat(ctx context.Context, chatID int64, text string) error {
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}
	return s.sendPayload(ctx, payload)
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
