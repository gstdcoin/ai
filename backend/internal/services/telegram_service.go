package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// TelegramService provides lightweight integration with a Telegram bot
// for admin notifications. If BOT_TOKEN or CHAT_ID are not configured,
// it degrades gracefully to no‑op logging.
type TelegramService struct {
	botToken   string
	chatID     string
	db         *sql.DB
	client     *http.Client
	enabled    bool
	apiBaseURL string
}

// NewTelegramService initializes the Telegram service.
// If botToken or chatID are empty, the service is disabled but
// the type is still valid (methods become no‑ops).
func NewTelegramService(botToken, chatID string, db *sql.DB) *TelegramService {
	enabled := botToken != "" && chatID != ""
	if !enabled {
		log.Printf("ℹ️  TelegramService disabled (missing BOT_TOKEN or CHAT_ID)")
	}
	apiBaseURL := os.Getenv("API_PUBLIC_URL")
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8080"
	}
	return &TelegramService{
		botToken:   botToken,
		chatID:     chatID,
		db:         db,
		enabled:    enabled,
		apiBaseURL: apiBaseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SendMessage sends an HTML‑formatted message to the configured chat.
func (s *TelegramService) SendMessage(ctx context.Context, message string) error {
	if !s.enabled {
		// Silent no‑op to avoid breaking flows when Telegram is not configured.
		log.Printf("TelegramService (disabled): %s", message)
		return nil
	}

	return s.SendMessageToChat(ctx, s.chatID, message)
}

// SendMessageToChat sends a message to a specific chat (for webhook replies).
func (s *TelegramService) SendMessageToChat(ctx context.Context, chatID string, message string) error {
	return s.SendMessageToChatWithMarkup(ctx, chatID, message, "")
}

// SendMessageToChatWithMarkup sends a message with optional reply_markup (JSON string).
func (s *TelegramService) SendMessageToChatWithMarkup(ctx context.Context, chatID string, message string, replyMarkupJSON string) error {
	if s.botToken == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.botToken)
	values := url.Values{}
	values.Set("chat_id", chatID)
	values.Set("text", message)
	values.Set("parse_mode", "HTML")
	if replyMarkupJSON != "" {
		values.Set("reply_markup", replyMarkupJSON)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(values.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("TelegramService: non‑OK response %d when sending message", resp.StatusCode)
	}

	return nil
}

// NotifyAdmin sends a message to the admin chat (CHAT_ID). Safe no-op if not configured.
func (s *TelegramService) NotifyAdmin(ctx context.Context, message string) error {
	return s.SendMessage(ctx, message)
}

// NotifyTaskCompleted sends a concise summary for a completed task.
// Used by ResultService; safe no‑op if TelegramService is disabled.
func (s *TelegramService) NotifyTaskCompleted(
	ctx context.Context,
	taskID string,
	taskType string,
	executorWallet string,
	executorReward float64,
) error {
	msg := fmt.Sprintf(
		"✅ <b>Task Completed</b>\n\nID: <code>%s</code>\nType: <b>%s</b>\nExecutor: <code>%s</code>\nReward: <b>%.4f GSTD</b>",
		taskID,
		taskType,
		executorWallet,
		executorReward,
	)
	return s.SendMessage(ctx, msg)
}

// IsEnabled returns true if Telegram is configured (bot token and chat ID set).
func (s *TelegramService) IsEnabled() bool {
	return s.enabled
}

// Telegram Update structure for webhook parsing
type telegramUpdate struct {
	UpdateID int64 `json:"update_id"`
	Message  *struct {
		MessageID int64 `json:"message_id"`
		From      *struct {
			ID           int64  `json:"id"`
			FirstName    string `json:"first_name"`
			Username     string `json:"username"`
			LanguageCode string `json:"language_code"`
		} `json:"from"`
		Chat struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
	CallbackQuery *struct {
		ID   string `json:"id"`
		From *struct {
			ID           int64  `json:"id"`
			LanguageCode string `json:"language_code"`
		} `json:"from"`
		Message *struct {
			Chat struct {
				ID int64 `json:"id"`
			} `json:"chat"`
			MessageID int64 `json:"message_id"`
		} `json:"message"`
		Data string `json:"data"`
	} `json:"callback_query"`
}

// botLang returns "ru" if language_code starts with "ru", else "en"
func botLang(langCode string) string {
	if strings.HasPrefix(strings.ToLower(langCode), "ru") {
		return "ru"
	}
	return "en"
}

// Bot messages EN/RU
var msgStart = map[string]string{
	"en": `👋 <b>GSTD Sovereign Grid</b>

Thin client — full functionality, wallet auth.

<b>Commands:</b>
/start — this message
/help — help
/status — status (admin only)
/balance — balance (admin only)
/admin — control panel (admin only)`,
	"ru": `👋 <b>GSTD Sovereign Grid</b>

Тонкий клиент — полный функционал, авторизация через кошелёк.

<b>Команды:</b>
/start — это сообщение
/help — справка
/status — статус (только админ)
/balance — баланс (только админ)
/admin — панель управления (только админ)`,
}

var msgHelp = map[string]string{
	"en": `📖 <b>GSTD Help</b>

Tap the button below to open the full dashboard in Telegram:
• Connect wallet (TonConnect)
• Chat with Sovereign AI
• Mining, tasks, statistics
• Everything works without a separate app`,
	"ru": `📖 <b>Справка GSTD</b>

Нажмите кнопку ниже, чтобы открыть полный дашборд в Telegram:
• Подключите кошелёк (TonConnect)
• Чат с Sovereign AI
• Майнинг, задачи, статистика
• Всё работает без отдельного приложения`,
}

var msgAdminOnly = map[string]string{
	"en": "⛔ Admin access only.",
	"ru": "⛔ Доступ только для администратора.",
}

var msgAdminPanel = map[string]string{
	"en": `🛠 <b>Admin Panel</b>

Choose an action:`,
	"ru": `🛠 <b>Панель администратора</b>

Выберите действие:`,
}

var btnOpenApp = map[string]string{
	"en": "📱 Open App",
	"ru": "📱 Открыть приложение",
}

var msgProcessing = map[string]string{
	"en": "Processing...",
	"ru": "Обработка...",
}

var msgStatusTitle = map[string]string{
	"en": "📊 <b>Status</b>",
	"ru": "📊 <b>Статус</b>",
}

var msgBalanceTitle = map[string]string{
	"en": "💰 <b>Balance</b>",
	"ru": "💰 <b>Баланс</b>",
}

var msgPendingTitle = map[string]string{
	"en": "📋 <b>Pending Withdrawals</b>",
	"ru": "📋 <b>Ожидающие выплаты</b>",
}

var msgNoPending = map[string]string{
	"en": "\n\nNo pending withdrawals.",
	"ru": "\n\nНет ожидающих выплат.",
}

var msgUsers = map[string]string{
	"en": "Users",
	"ru": "Пользователей",
}

var msgApproveVia = map[string]string{
	"en": "Approve via API: POST /admin/withdrawals/:id/approve",
	"ru": "Approve через API: POST /admin/withdrawals/:id/approve",
}

var msgError = map[string]string{
	"en": "❌ Error: ",
	"ru": "❌ Ошибка: ",
}

var msgTotal = map[string]string{
	"en": "Total",
	"ru": "Всего",
}

// ProcessWebhook handles incoming Telegram webhook payloads.
// Commands: /start (public), /status, /balance, /admin (admin only).
func (s *TelegramService) ProcessWebhook(ctx context.Context, body []byte) error {
	if s.botToken == "" {
		return nil
	}
	var upd telegramUpdate
	if err := json.Unmarshal(body, &upd); err != nil {
		return nil
	}

	// Handle callback_query (inline button clicks)
	if upd.CallbackQuery != nil {
		return s.handleCallbackQuery(ctx, &upd)
	}

	if upd.Message == nil {
		return nil
	}
	chatID := strconv.FormatInt(upd.Message.Chat.ID, 10)
	text := strings.TrimSpace(upd.Message.Text)
	senderID := upd.Message.From
	var senderIDStr string
	lang := "en"
	if senderID != nil {
		senderIDStr = strconv.FormatInt(senderID.ID, 10)
		lang = botLang(senderID.LanguageCode)
	}

	webAppURL := os.Getenv("APP_PUBLIC_URL")
	if webAppURL == "" {
		webAppURL = "https://app.gstdtoken.com"
	}

	// /start — public welcome with Web App button
	if text == "/start" {
		msg := msgStart[lang]
		if msg == "" {
			msg = msgStart["en"]
		}
		btnText := btnOpenApp[lang]
		if btnText == "" {
			btnText = btnOpenApp["en"]
		}
		markup := fmt.Sprintf(`{"inline_keyboard":[[{"text":"%s","web_app":{"url":"%s"}}]]}`, btnText, webAppURL)
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// /help
	if text == "/help" {
		msg := msgHelp[lang]
		if msg == "" {
			msg = msgHelp["en"]
		}
		btnText := btnOpenApp[lang]
		if btnText == "" {
			btnText = btnOpenApp["en"]
		}
		markup := fmt.Sprintf(`{"inline_keyboard":[[{"text":"%s","web_app":{"url":"%s"}}]]}`, btnText, webAppURL)
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// /status и /balance — только для админа
	if text == "/status" || text == "/balance" {
		if s.chatID == "" || senderIDStr != s.chatID {
			_ = s.SendMessageToChat(ctx, chatID, msgAdminOnly[lang])
			return nil
		}
	}

	// /status — данные из /api/v1/health
	if text == "/status" {
		health, err := s.fetchHealth(ctx)
		if err != nil {
			return s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
		}
		dbStatus := "❌"
		if ds, ok := health["database"].(map[string]interface{}); ok {
			if st, _ := ds["status"].(string); st == "connected" {
				dbStatus = "✅"
			}
		}
		contractStatus := "❌"
		contractTON := "—"
		if c, ok := health["contract"].(map[string]interface{}); ok {
			if st, _ := c["status"].(string); st == "reachable" {
				contractStatus = "✅"
			}
			if b, ok := c["balance_ton"].(float64); ok {
				contractTON = fmt.Sprintf("%.4f TON", b)
			}
		}
		aiStatus := "—"
		if ai, ok := health["sovereign_ai"].(map[string]interface{}); ok {
			if st, _ := ai["status"].(string); st == "active" {
				aiStatus = "✅ active"
			}
		}
		msg := fmt.Sprintf(`📊 <b>GSTD Status</b>

<b>Database:</b> %s
<b>Contract:</b> %s (%s)
<b>Sovereign AI:</b> %s`,
			dbStatus, contractStatus, contractTON, aiStatus)
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	// /admin — admin panel with inline buttons (admin only)
	if text == "/admin" {
		if s.chatID == "" || senderIDStr != s.chatID {
			_ = s.SendMessageToChat(ctx, chatID, msgAdminOnly[lang])
			return nil
		}
		msg := msgAdminPanel[lang]
		if msg == "" {
			msg = msgAdminPanel["en"]
		}
		markup := `{"inline_keyboard":[
			[{"text":"📊 Status","callback_data":"admin_status"},{"text":"💰 Balance","callback_data":"admin_balance"}],
			[{"text":"📋 Pending Withdrawals","callback_data":"admin_pending"}]
		]}`
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// /balance — баланс и пользователи
	if text == "/balance" {
		health, err := s.fetchHealth(ctx)
		if err != nil {
			return s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
		}
		var totalUsers int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&totalUsers)
		contractTON := "—"
		if c, ok := health["contract"].(map[string]interface{}); ok {
			if b, ok := c["balance_ton"].(float64); ok {
				contractTON = fmt.Sprintf("%.4f TON", b)
			}
		}
		title := msgBalanceTitle[lang]
		usersLabel := msgUsers[lang]
		if title == "" {
			title = msgBalanceTitle["en"]
		}
		if usersLabel == "" {
			usersLabel = msgUsers["en"]
		}
		msg := fmt.Sprintf(`%s

<b>Contract (Escrow):</b> %s
<b>%s:</b> %d

📱 <a href="%s">Dashboard</a>`,
			title, contractTON, usersLabel, totalUsers, webAppURL)
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	return nil
}

// answerCallbackQuery acknowledges a callback query (removes loading state).
func (s *TelegramService) answerCallbackQuery(ctx context.Context, callbackQueryID string, text string) error {
	if s.botToken == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", s.botToken)
	values := url.Values{}
	values.Set("callback_query_id", callbackQueryID)
	if text != "" {
		values.Set("text", text)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(values.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// handleCallbackQuery processes inline button clicks (admin actions).
func (s *TelegramService) handleCallbackQuery(ctx context.Context, upd *telegramUpdate) error {
	cq := upd.CallbackQuery
	if cq == nil || cq.From == nil {
		return nil
	}
	senderIDStr := strconv.FormatInt(cq.From.ID, 10)
	chatID := strconv.FormatInt(cq.Message.Chat.ID, 10)

	lang := botLang(cq.From.LanguageCode)

	// Admin only
	if s.chatID == "" || senderIDStr != s.chatID {
		_ = s.answerCallbackQuery(ctx, cq.ID, msgAdminOnly[lang])
		return nil
	}

	data := cq.Data
	if !strings.HasPrefix(data, "admin_") {
		_ = s.answerCallbackQuery(ctx, cq.ID, "")
		return nil
	}

	procMsg := msgProcessing[lang]
	if procMsg == "" {
		procMsg = msgProcessing["en"]
	}
	_ = s.answerCallbackQuery(ctx, cq.ID, procMsg)

	switch data {
	case "admin_status":
		health, err := s.fetchHealth(ctx)
		if err != nil {
			_ = s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
			return nil
		}
		dbStatus := "❌"
		if ds, ok := health["database"].(map[string]interface{}); ok {
			if st, _ := ds["status"].(string); st == "connected" {
				dbStatus = "✅"
			}
		}
		contractStatus := "❌"
		contractTON := "—"
		if c, ok := health["contract"].(map[string]interface{}); ok {
			if st, _ := c["status"].(string); st == "reachable" {
				contractStatus = "✅"
			}
			if b, ok := c["balance_ton"].(float64); ok {
				contractTON = fmt.Sprintf("%.4f TON", b)
			}
		}
		aiStatus := "—"
		if ai, ok := health["sovereign_ai"].(map[string]interface{}); ok {
			if st, _ := ai["status"].(string); st == "active" {
				aiStatus = "✅ active"
			}
		}
		title := msgStatusTitle[lang]
		if title == "" {
			title = msgStatusTitle["en"]
		}
		msg := fmt.Sprintf(`%s

<b>Database:</b> %s
<b>Contract:</b> %s (%s)
<b>Sovereign AI:</b> %s`, title, dbStatus, contractStatus, contractTON, aiStatus)
		return s.SendMessageToChat(ctx, chatID, msg)

	case "admin_balance":
		health, err := s.fetchHealth(ctx)
		if err != nil {
			_ = s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
			return nil
		}
		var totalUsers int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&totalUsers)
		contractTON := "—"
		if c, ok := health["contract"].(map[string]interface{}); ok {
			if b, ok := c["balance_ton"].(float64); ok {
				contractTON = fmt.Sprintf("%.4f TON", b)
			}
		}
		title := msgBalanceTitle[lang]
		usersLabel := msgUsers[lang]
		if title == "" {
			title = msgBalanceTitle["en"]
		}
		if usersLabel == "" {
			usersLabel = msgUsers["en"]
		}
		msg := fmt.Sprintf(`%s

<b>Contract:</b> %s
<b>%s:</b> %d`, title, contractTON, usersLabel, totalUsers)
		return s.SendMessageToChat(ctx, chatID, msg)

	case "admin_pending":
		var count int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM withdrawal_locks WHERE status = 'pending_approval'`).Scan(&count)
		if count == 0 {
			title := msgPendingTitle[lang]
			noPending := msgNoPending[lang]
			if title == "" {
				title = msgPendingTitle["en"]
			}
			if noPending == "" {
				noPending = msgNoPending["en"]
			}
			return s.SendMessageToChat(ctx, chatID, title+noPending)
		}
		rows, err := s.db.QueryContext(ctx, `
			SELECT id, task_id, worker_wallet, amount_gstd
			FROM withdrawal_locks
			WHERE status = 'pending_approval'
			ORDER BY created_at DESC
			LIMIT 10
		`)
		if err != nil {
			return s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
		}
		defer rows.Close()
		title := msgPendingTitle[lang]
		approveVia := msgApproveVia[lang]
		if title == "" {
			title = msgPendingTitle["en"]
		}
		if approveVia == "" {
			approveVia = msgApproveVia["en"]
		}
		var sb strings.Builder
		sb.WriteString(title + "\n\n")
		for rows.Next() {
			var id int
			var taskID, workerWallet string
			var amountGSTD float64
			if err := rows.Scan(&id, &taskID, &workerWallet, &amountGSTD); err != nil {
				continue
			}
			shortWallet := workerWallet
			if len(shortWallet) > 12 {
				shortWallet = shortWallet[:6] + "…" + shortWallet[len(shortWallet)-6:]
			}
			sb.WriteString(fmt.Sprintf("• ID %d: %s → %.4f GSTD\n", id, shortWallet, amountGSTD))
		}
		totalLabel := msgTotal[lang]
		if totalLabel == "" {
			totalLabel = msgTotal["en"]
		}
		sb.WriteString(fmt.Sprintf("\n%s: %d. %s", totalLabel, count, approveVia))
		return s.SendMessageToChat(ctx, chatID, sb.String())
	}

	return nil
}

func (s *TelegramService) fetchHealth(ctx context.Context) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", s.apiBaseURL+"/api/v1/health", nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// NotifyNewTask sends a brief notification about a newly created task.
// This is used by TaskService; safe no‑op if TelegramService is disabled.
func (s *TelegramService) NotifyNewTask(
	ctx context.Context,
	taskID string,
	taskType string,
	requesterWallet string,
	rewardGSTD float64,
) error {
	msg := fmt.Sprintf(
		"🆕 <b>New Task</b>\n\nID: <code>%s</code>\nType: <b>%s</b>\nRequester: <code>%s</code>\nReward: <b>%.4f GSTD</b>",
		taskID,
		taskType,
		requesterWallet,
		rewardGSTD,
	)
	return s.SendMessage(ctx, msg)
}

