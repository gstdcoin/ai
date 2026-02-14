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
	botToken    string
	chatID      string
	db          *sql.DB
	client      *http.Client
	enabled     bool
	apiBaseURL  string
	starsBuyback *StarsBuybackService
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

// SetStarsBuyback wires the Stars-to-GSTD buyback service for Telegram Stars payments.
func (s *TelegramService) SetStarsBuyback(sb *StarsBuybackService) {
	s.starsBuyback = sb
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
		Text             string `json:"text"`
		SuccessfulPayment *struct {
			Currency                string `json:"currency"`
			TotalAmount             int    `json:"total_amount"`
			TelegramPaymentChargeID string `json:"telegram_payment_charge_id"`
			ProviderPaymentChargeID string `json:"provider_payment_charge_id"`
			InvoicePayload          string `json:"invoice_payload"`
		} `json:"successful_payment"`
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

// Bot messages EN/RU — Ascension: Sovereign AI, confident tone
var msgStart = map[string]string{
	"en": `👑 <b>GSTD — Sovereign Intelligence</b>

Your sovereign AI assistant.
• <b>🤖 AI Standard</b> — fast responses, free tier
• <b>⚡ AI Ultra</b> — 70B models, Hive Memory. 1 GSTD/session
• <b>⛏ Miner</b> — earn GSTD by contributing compute
• <b>📡 Node</b> — join the swarm

<b>GSTD is the only fuel.</b> Buy via TON wallet → Ston.fi.

<b>Commands:</b>
/start • /help • /network — Network Load
/status • /balance • /admin — (admin)`,
	"ru": `👑 <b>GSTD — Суверенный интеллект</b>

Ваш суверенный AI-ассистент.
• <b>🤖 AI Standard</b> — быстрые ответы, бесплатный уровень
• <b>⚡ AI Ultra</b> — модели 70B, Hive Memory. 1 GSTD/сессия
• <b>⛏ Майнер</b> — зарабатывайте GSTD, отдавая мощность
• <b>📡 Нода</b> — присоединяйтесь к рою

<b>GSTD — единственное топливо.</b> Покупка через TON кошелёк → Ston.fi.

<b>Команды:</b>
/start • /help • /network — загрузка сети
/status • /balance • /admin — (админ)`,
}

var msgHelp = map[string]string{
	"en": `📖 <b>GSTD — Sovereign Intelligence</b>

<b>AI Standard</b> — Quick answers. No censorship.
<b>AI Ultra</b> — Maximum intelligence, deep analysis, Hive Memory. 1 GSTD.

<b>Top up GSTD</b> — Buy via TON wallet on Ston.fi. One tap.`,
	"ru": `📖 <b>GSTD — Суверенный интеллект</b>

<b>AI Standard</b> — Быстрые ответы. Без цензуры.
<b>AI Ultra</b> — Максимальный интеллект, глубокий анализ, Hive Memory. 1 GSTD.

<b>Пополнить GSTD</b> — Покупка через TON кошелёк на Ston.fi. Один тап.`,
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

var btnAIChat = map[string]string{
	"en": "🤖 AI Chat",
	"ru": "🤖 AI Чат",
}

var btnMining = map[string]string{
	"en": "⛏ Mining",
	"ru": "⛏ Майнинг",
}

var btnAgentNode = map[string]string{
	"en": "📡 Agent Node",
	"ru": "📡 Agent Node",
}

var btnBuyGSTD = map[string]string{
	"en": "💰 Top up GSTD",
	"ru": "💰 Пополнить GSTD",
}

var btnAIStandard = map[string]string{
	"en": "🤖 AI Standard",
	"ru": "🤖 AI Standard",
}

var btnAIUltra = map[string]string{
	"en": "⚡ AI Ultra (1 GSTD)",
	"ru": "⚡ AI Ultra (1 GSTD)",
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

	// Stars-to-GSTD Buyback: 20% of Telegram Stars -> Ston.fi -> Gold Reserve or burn
	if upd.Message.SuccessfulPayment != nil && s.starsBuyback != nil {
		sp := upd.Message.SuccessfulPayment
		if sp.Currency == "XTR" && sp.TotalAmount > 0 {
			_ = s.starsBuyback.RecordStarsPayment(ctx, sp.TelegramPaymentChargeID, sp.TotalAmount)
		}
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

	// /start — Ascension: AI Standard | AI Ultra | Miner | Node | Top up GSTD
	if text == "/start" {
		msg := msgStart[lang]
		if msg == "" {
			msg = msgStart["en"]
		}
		stdBtn := btnAIStandard[lang]
		if stdBtn == "" {
			stdBtn = btnAIStandard["en"]
		}
		ultraBtn := btnAIUltra[lang]
		if ultraBtn == "" {
			ultraBtn = btnAIUltra["en"]
		}
		miningBtn := btnMining[lang]
		if miningBtn == "" {
			miningBtn = btnMining["en"]
		}
		nodeBtn := btnAgentNode[lang]
		if nodeBtn == "" {
			nodeBtn = btnAgentNode["en"]
		}
		buyBtn := btnBuyGSTD[lang]
		if buyBtn == "" {
			buyBtn = btnBuyGSTD["en"]
		}
		stdURL := webAppURL + "/dashboard?tab=chat&mode=standard"
		ultraURL := webAppURL + "/dashboard?tab=chat&mode=ultra"
		miningURL := webAppURL + "/dashboard?tab=home"
		agentURL := webAppURL + "/agent"
		stonFiURL := "https://app.ston.fi/swap?ft=TON&tt=GSTD"
		markup := fmt.Sprintf(`{"inline_keyboard":[
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","web_app":{"url":"%s"}}],
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","web_app":{"url":"%s"}}],
			[{"text":"%s","url":"%s"}]
		]}`, stdBtn, stdURL, ultraBtn, ultraURL, miningBtn, miningURL, nodeBtn, agentURL, buyBtn, stonFiURL)
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// /help — same Ascension buttons
	if text == "/help" {
		msg := msgHelp[lang]
		if msg == "" {
			msg = msgHelp["en"]
		}
		stdBtn := btnAIStandard[lang]
		if stdBtn == "" {
			stdBtn = btnAIStandard["en"]
		}
		ultraBtn := btnAIUltra[lang]
		if ultraBtn == "" {
			ultraBtn = btnAIUltra["en"]
		}
		buyBtn := btnBuyGSTD[lang]
		if buyBtn == "" {
			buyBtn = btnBuyGSTD["en"]
		}
		stdURL := webAppURL + "/dashboard?tab=chat&mode=standard"
		ultraURL := webAppURL + "/dashboard?tab=chat&mode=ultra"
		stonFiURL := "https://app.ston.fi/swap?ft=TON&tt=GSTD"
		markup := fmt.Sprintf(`{"inline_keyboard":[
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","web_app":{"url":"%s"}}],
			[{"text":"%s","url":"%s"}]
		]}`, stdBtn, stdURL, ultraBtn, ultraURL, buyBtn, stonFiURL)
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// /network — Network Load from stats/public (Ascension: show swarm power)
	if text == "/network" {
		stats, err := s.fetchPublicStats(ctx)
		if err != nil {
			_ = s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
			return nil
		}
		processing, _ := stats["processing_tasks"].(float64)
		queued, _ := stats["queued_tasks"].(float64)
		completed, _ := stats["completed_tasks"].(float64)
		devices, _ := stats["active_devices_count"].(float64)
		tflops, _ := stats["total_tflops"].(float64)
		loadPct := 0.0
		if devices > 0 {
			loadPct = (processing + queued*0.5) / devices * 10
			if loadPct > 100 {
				loadPct = 100
			}
		}
		loadBar := "░░░░░░░░░░"
		if loadPct > 10 {
			loadBar = "█░░░░░░░░░"
		}
		if loadPct > 30 {
			loadBar = "███░░░░░░░"
		}
		if loadPct > 50 {
			loadBar = "█████░░░░░"
		}
		if loadPct > 70 {
			loadBar = "███████░░░"
		}
		if loadPct > 90 {
			loadBar = "██████████"
		}
		msgEn := fmt.Sprintf(`📊 <b>Network Load</b>

%s <b>%.0f%%</b>

<b>Processing:</b> %.0f
<b>Queued:</b> %.0f
<b>Completed:</b> %.0f
<b>Active nodes:</b> %.0f
<b>Compute:</b> %.1f TFLOPS

<i>GSTD swarm — real-time power</i>`, loadBar, loadPct, processing, queued, completed, devices, tflops)
		msgRu := fmt.Sprintf(`📊 <b>Загрузка сети</b>

%s <b>%.0f%%</b>

<b>В работе:</b> %.0f
<b>В очереди:</b> %.0f
<b>Выполнено:</b> %.0f
<b>Активных нод:</b> %.0f
<b>Мощность:</b> %.1f TFLOPS

<i>Рой GSTD — мощность в реальном времени</i>`, loadBar, loadPct, processing, queued, completed, devices, tflops)
		netMsg := msgEn
		if lang == "ru" {
			netMsg = msgRu
		}
		return s.SendMessageToChat(ctx, chatID, netMsg)
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
		webAppURL := os.Getenv("APP_PUBLIC_URL")
		if webAppURL == "" {
			webAppURL = "https://app.gstdtoken.com"
		}
		msg := fmt.Sprintf(`%s

<b>Contract:</b> %s
<b>%s:</b> %d

📱 <a href="%s">Dashboard</a>`, title, contractTON, usersLabel, totalUsers, webAppURL)
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

func (s *TelegramService) fetchPublicStats(ctx context.Context) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", s.apiBaseURL+"/api/v1/stats/public", nil)
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

