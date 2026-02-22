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
	"regexp"
	"strconv"
	"strings"
	"time"
)

// TelegramService provides lightweight integration with a Telegram bot
// for admin notifications and user interactions.
// GSTDPriceProvider returns current GSTD price in USD (for Stars→GSTD conversion)
type GSTDPriceProvider interface {
	GetGSTDPriceUSD(ctx context.Context) (float64, error)
}

type TelegramService struct {
	botToken     string
	chatID       string
	db           *sql.DB
	client       *http.Client
	enabled      bool
	apiBaseURL   string
	starsBuyback *StarsBuybackService
	gstdPrice    GSTDPriceProvider
}

// NewTelegramService initializes the Telegram service.
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

// SendMessage sends an HTML‑formatted message to the configured admin chat.
func (s *TelegramService) SendMessage(ctx context.Context, message string) error {
	if !s.enabled {
		log.Printf("TelegramService (disabled): %s", message)
		return nil
	}
	return s.SendMessageToChat(ctx, s.chatID, message)
}

// SendMessageToChat sends a message to a specific chat.
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

// NotifyAdmin sends a message to the admin chat.
func (s *TelegramService) NotifyAdmin(ctx context.Context, message string) error {
	return s.SendMessage(ctx, message)
}

// callBotAPI relays /connect, /take, /complete, balance, nodes to internal bot API (for webhook mode).
// Returns (response, nil) on success, ("", err) on error, ("", nil) when not a bot command.
func (s *TelegramService) callBotAPI(ctx context.Context, text, senderIDStr, username, firstName, chatID string) (string, error) {
	base := strings.TrimSuffix(s.apiBaseURL, "/")
	token := s.botToken
	if token == "" {
		return "", nil
	}
	telegramID, _ := strconv.ParseInt(senderIDStr, 10, 64)
	if telegramID == 0 {
		return "", nil
	}

	// /connect <wallet>
	if strings.HasPrefix(text, "/connect ") {
		wallet := strings.TrimSpace(strings.TrimPrefix(text, "/connect "))
		if len(wallet) < 40 {
			return "❌ Invalid wallet address (too short)", nil
		}
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id":    telegramID,
			"wallet_address": wallet,
			"username":       username,
			"first_name":     firstName,
		})
		req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/link", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Error   string `json:"error"`
			Success bool   `json:"success"`
		}
		json.NewDecoder(resp.Body).Decode(&r)
		if resp.StatusCode != 200 || r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		return "✅ Wallet linked! Wallet-as-Node active — you can claim tasks.", nil
	}

	// /take <task_id>
	if strings.HasPrefix(text, "/take ") {
		taskID := strings.TrimSpace(strings.TrimPrefix(text, "/take "))
		if taskID == "" {
			return "Usage: /take <task_id>", nil
		}
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id": telegramID,
			"task_id":     taskID,
			"device_id":   "tg-" + senderIDStr,
		})
		req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/claim", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Error   string `json:"error"`
			Success bool   `json:"success"`
		}
		json.NewDecoder(resp.Body).Decode(&r)
		if resp.StatusCode != 200 || r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		return fmt.Sprintf("✅ Task `%s` claimed! Complete with: /complete %s", taskID, taskID), nil
	}

	// /complete <task_id> [yes|no] [confidence] [reasoning]
	if strings.HasPrefix(text, "/complete ") {
		args := strings.Fields(strings.TrimPrefix(text, "/complete "))
		if len(args) == 0 {
			return "Usage: /complete <task_id> [yes|no] [confidence] [reasoning]", nil
		}
		taskID := args[0]
		var resultData []byte
		if len(args) >= 2 {
			pred := strings.ToLower(strings.TrimSpace(args[1]))
			conf := 0.8
			reason := ""
			if len(args) >= 3 {
				fmt.Sscanf(args[2], "%f", &conf)
			}
			if len(args) >= 4 {
				reason = strings.Join(args[3:], " ")
			}
			if pred != "yes" && pred != "no" {
				return "❌ Prediction must be 'yes' or 'no'", nil
			}
			resultData, _ = json.Marshal(map[string]interface{}{
				"prediction": pred,
				"confidence": conf,
				"reasoning":  reason,
			})
		} else {
			resultData = []byte(`{"completed":true}`)
		}
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id":       telegramID,
			"task_id":           taskID,
			"result_data":       json.RawMessage(resultData),
			"execution_time_ms": 5000,
			"quality_score":     0.9,
		})
		req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/complete", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Error      string  `json:"error"`
			Success    bool    `json:"success"`
			RewardGSTD float64 `json:"reward_gstd"`
		}
		json.NewDecoder(resp.Body).Decode(&r)
		if resp.StatusCode != 200 || r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		return fmt.Sprintf("✅ Task completed! Reward: %.4f GSTD", r.RewardGSTD), nil
	}

	// 💎 My Balance or /balance (user)
	if text == "💎 My Balance" || (text == "/balance" && s.chatID != "" && senderIDStr != s.chatID) {
		req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/telegram/bot/balance?telegram_id=%d", base, telegramID), nil)
		req.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Linked      bool    `json:"linked"`
			BalanceGSTD float64 `json:"balance_gstd"`
			PendingGSTD float64 `json:"pending_gstd"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
			return "", err
		}
		if !r.Linked {
			return "💎 **My Balance**\n\n⚠️ Wallet not linked.\n\nUse /connect <wallet_address> to link your TON wallet.", nil
		}
		usd := (r.BalanceGSTD + r.PendingGSTD) * 0.015
		return fmt.Sprintf("💎 **My Balance**\n\n**%.4f GSTD** (available)\n**%.4f GSTD** (pending)\n\n≈ $%.2f USD", r.BalanceGSTD, r.PendingGSTD, usd), nil
	}

	// 🚀 My Nodes
	if text == "🚀 My Nodes" {
		req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/telegram/bot/nodes?telegram_id=%d", base, telegramID), nil)
		req.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Nodes []struct {
				DeviceID string `json:"device_id"`
				Status   string `json:"status"`
			} `json:"nodes"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
			return "", err
		}
		var sb strings.Builder
		sb.WriteString("🚀 **My Nodes**\n\n")
		for _, n := range r.Nodes {
			sb.WriteString(fmt.Sprintf("• %s — %s\n", n.DeviceID, n.Status))
		}
		sb.WriteString("\n_Device ID = tg-{your_telegram_id} when mining from bot_")
		return sb.String(), nil
	}

	return "", nil
}

// NotifyTaskCompleted sends a concise summary for a completed task.
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

// NotifyNewTask sends a brief notification about a newly created task.
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

// IsEnabled returns true if Telegram is configured.
func (s *TelegramService) IsEnabled() bool {
	return s.enabled
}

// SetStarsBuyback wires the Stars-to-GSTD buyback service.
func (s *TelegramService) SetStarsBuyback(sb *StarsBuybackService) {
	s.starsBuyback = sb
}

// SetGSTDPriceProvider wires the price oracle for real GSTD rate (Stars→GSTD).
func (s *TelegramService) SetGSTDPriceProvider(p GSTDPriceProvider) {
	s.gstdPrice = p
}

// answerPreCheckout approves the payment (required within 10s)
func (s *TelegramService) answerPreCheckout(ctx context.Context, q *preCheckoutQuery) error {
	if s.botToken == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/answerPreCheckoutQuery", s.botToken)
	body := map[string]interface{}{"pre_checkout_query_id": q.ID, "ok": true}
	jsonBody, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(string(jsonBody)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("answerPreCheckout: %d", resp.StatusCode)
	}
	return nil
}

// creditStarsPurchase credits user's gstd_balance. Creates tg-{id} wallet if no wallet linked. Returns gstd credited.
func (s *TelegramService) creditStarsPurchase(ctx context.Context, telegramID int64, chargeID string, starsAmount int) float64 {
	if s.db == nil {
		return 0
	}
	// Real rate: Stars (USD) → GSTD. 1 Star ≈ $0.013 (Telegram/Fragment). GSTD price from oracle.
	starsToUSD := 0.013
	if r := os.Getenv("STARS_TO_USD"); r != "" {
		if v, e := strconv.ParseFloat(r, 64); e == nil && v > 0 {
			starsToUSD = v
		}
	}
	gstdPriceUSD := 0.02
	if s.gstdPrice != nil {
		if p, err := s.gstdPrice.GetGSTDPriceUSD(ctx); err == nil && p > 0 {
			gstdPriceUSD = p
		}
	}
	gstdCredited := (float64(starsAmount) * starsToUSD) / gstdPriceUSD
	if gstdCredited < 0.001 {
		return 0
	}

	// Avoid double-credit
	var exists int
	if s.db.QueryRowContext(ctx, "SELECT 1 FROM stars_purchases WHERE telegram_payment_charge_id = $1", chargeID).Scan(&exists) == nil {
		return 0
	}

	// Resolve wallet: linked wallet or tg-{telegram_id}
	var wallet string
	s.db.QueryRowContext(ctx, "SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL", telegramID).Scan(&wallet)
	if wallet == "" {
		wallet = fmt.Sprintf("tg-%d", telegramID)
		// Ensure telegram_users exists
		s.db.ExecContext(ctx, `
			INSERT INTO telegram_users (telegram_id, wallet_address, last_activity_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (telegram_id) DO UPDATE SET
				wallet_address = COALESCE(telegram_users.wallet_address, EXCLUDED.wallet_address),
				last_activity_at = NOW()
		`, telegramID, wallet)
		// Ensure user exists
		s.db.ExecContext(ctx, `
			INSERT INTO users (wallet_address, created_at, updated_at)
			VALUES ($1, NOW(), NOW())
			ON CONFLICT (wallet_address) DO NOTHING
		`, wallet)
	}

	// Credit gstd_balance
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1 WHERE wallet_address = $2
	`, gstdCredited, wallet)
	if err != nil {
		log.Printf("creditStarsPurchase: %v", err)
		return 0
	}

	// Record to prevent double-credit
	s.db.ExecContext(ctx, `
		INSERT INTO stars_purchases (telegram_payment_charge_id, telegram_id, stars_amount, gstd_credited, wallet_address)
		VALUES ($1, $2, $3, $4, $5)
	`, chargeID, telegramID, starsAmount, gstdCredited, wallet)

	trunc := wallet
	if len(wallet) > 12 {
		trunc = wallet[:12]
	}
	log.Printf("Stars: +%.4f GSTD to %s (tg:%d, %d Stars)", gstdCredited, trunc, telegramID, starsAmount)
	return gstdCredited
}

// SendStarsInvoice sends a Telegram Stars invoice for GSTD purchase
func (s *TelegramService) SendStarsInvoice(ctx context.Context, chatID string, starsAmount int, lang string) error {
	if s.botToken == "" || starsAmount < 1 {
		return fmt.Errorf("invalid config or amount")
	}
	// Approximate GSTD for description (real rate applied at payment)
	starsToUSD := 0.013
	if r := os.Getenv("STARS_TO_USD"); r != "" {
		if v, e := strconv.ParseFloat(r, 64); e == nil && v > 0 {
			starsToUSD = v
		}
	}
	gstdPriceUSD := 0.02
	if s.gstdPrice != nil {
		if p, err := s.gstdPrice.GetGSTDPriceUSD(ctx); err == nil && p > 0 {
			gstdPriceUSD = p
		}
	}
	approxGSTD := (float64(starsAmount) * starsToUSD) / gstdPriceUSD
	title := "GSTD Tokens"
	desc := fmt.Sprintf("Buy ~%.2f GSTD. Use for AI, tasks, mining.", approxGSTD)
	if lang == "ru" {
		title = "Токены GSTD"
		desc = fmt.Sprintf("Купить ~%.2f GSTD. Для ИИ, задач, майнинга.", approxGSTD)
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendInvoice", s.botToken)
	payload := fmt.Sprintf("gstd_%d_%d", time.Now().Unix(), starsAmount)
	prices := fmt.Sprintf(`[{"label":"%d Stars","amount":%d}]`, starsAmount, starsAmount)
	values := url.Values{}
	values.Set("chat_id", chatID)
	values.Set("title", title)
	values.Set("description", desc)
	values.Set("payload", payload)
	values.Set("provider_token", "")
	values.Set("currency", "XTR")
	values.Set("prices", prices)

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
		return fmt.Errorf("sendInvoice: %d", resp.StatusCode)
	}
	return nil
}

// PreCheckoutQuery for Stars payments
type preCheckoutQuery struct {
	ID               string `json:"id"`
	From             *struct { ID int64 `json:"id"` } `json:"from"`
	Currency         string `json:"currency"`
	TotalAmount      int    `json:"total_amount"`
	InvoicePayload   string `json:"invoice_payload"`
}

// Telegram Update structure
type telegramUpdate struct {
	UpdateID        int64             `json:"update_id"`
	PreCheckoutQuery *preCheckoutQuery `json:"pre_checkout_query"`
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
		Text              string `json:"text"`
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

func botLang(langCode string) string {
	if strings.HasPrefix(strings.ToLower(langCode), "ru") {
		return "ru"
	}
	return "en"
}

// --- Messages Configuration ---

var msgStart = map[string]string{
	"en": `👑 <b>GSTD — Sovereign Intelligence</b>

The world's first Gold-Backed DePIN Network.
Connect your wallet to access sovereign AI or earn by providing compute.

<b>Choose an action:</b>`,
	"ru": `👑 <b>GSTD — Суверенный интеллект</b>

Первая в мире DePIN сеть, обеспеченная золотом.
Подключите кошелёк для доступа к суверенному ИИ или заработка на вычислительной мощности.

<b>Выберите действие:</b>`,
}

var msgWalletAsNode = map[string]string{
	"en": `⛏ <b>Wallet-as-Node — Start Mining</b>

Your TON wallet becomes a compute node. No app install needed.

<b>1.</b> Tap <b>Start Mining</b> below
<b>2.</b> Connect your TON wallet in the Web App
<b>3.</b> Claim tasks and earn GSTD

<i>Lightweight tasks run when charging + WiFi. Your phone, your earnings.</i>`,
	"ru": `⛏ <b>Wallet-as-Node — Начать майнинг</b>

Ваш TON-кошелёк становится вычислительной нодой. Установка не нужна.

<b>1.</b> Нажмите <b>Начать майнинг</b> ниже
<b>2.</b> Подключите TON-кошелёк в Web App
<b>3.</b> Берите задачи и зарабатывайте GSTD

<i>Лёгкие задачи — при зарядке и WiFi. Ваш телефон, ваш доход.</i>`,
}

var msgHelp = map[string]string{
	"en": `📖 <b>User Guide</b>

• <b>Open App</b>: Main dashboard. Connect wallet here.
• <b>Mining</b>: Earn GSTD by running AI inferences.
• <b>AI Chat</b>: Uncensored, private AI models.
• <b>Stats</b>: Real-time network capacity and Gold Reserve proof.

<b>GSTD Token</b> is the fuel. Backed by XAUt (Tether Gold).`,
	"ru": `📖 <b>Руководство пользователя</b>

• <b>Открыть</b>: Главный дашборд. Подключите кошелёк здесь.
• <b>Майнинг</b>: Зарабатывайте GSTD на вычислениях ИИ.
• <b>AI Чат</b>: Приватный ИИ без цензуры.
• <b>Статистика</b>: Мощность сети и доказательство золотого резерва.

<b>Токен GSTD</b> — это топливо. Обеспечен золотом XAUt.`,
}

var msgAdminOnly = map[string]string{
	"en": "⛔ Admin access only.",
	"ru": "⛔ Доступ только для администратора.",
}

var msgAdminPanel = map[string]string{
	"en": `🛠 <b>Admin Panel</b>`,
	"ru": `🛠 <b>Панель администратора</b>`,
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
func (s *TelegramService) ProcessWebhook(ctx context.Context, body []byte) error {
	if s.botToken == "" {
		return nil
	}
	var upd telegramUpdate
	if err := json.Unmarshal(body, &upd); err != nil {
		return nil
	}

	// Pre-checkout: must answer within 10s or payment is cancelled
	if upd.PreCheckoutQuery != nil {
		return s.answerPreCheckout(ctx, upd.PreCheckoutQuery)
	}

	// Handle callback_query (inline button clicks)
	if upd.CallbackQuery != nil {
		return s.handleCallbackQuery(ctx, &upd)
	}

	if upd.Message == nil {
		return nil
	}

	chatID := strconv.FormatInt(upd.Message.Chat.ID, 10)

	// Successful Stars payment: credit user + platform buyback
	if upd.Message.SuccessfulPayment != nil {
		sp := upd.Message.SuccessfulPayment
		if sp.Currency == "XTR" && sp.TotalAmount > 0 {
			var gstdCredited float64
			if upd.Message.From != nil {
				gstdCredited = s.creditStarsPurchase(ctx, upd.Message.From.ID, sp.TelegramPaymentChargeID, sp.TotalAmount)
			}
			if s.starsBuyback != nil {
				_ = s.starsBuyback.RecordStarsPayment(ctx, sp.TelegramPaymentChargeID, sp.TotalAmount)
			}
			if gstdCredited > 0 {
				lang := "en"
				if upd.Message.From != nil {
					lang = botLang(upd.Message.From.LanguageCode)
				}
				msg := fmt.Sprintf("✅ +%.2f GSTD credited! Use for AI, tasks, mining.", gstdCredited)
				if lang == "ru" {
					msg = fmt.Sprintf("✅ +%.2f GSTD зачислено! Используйте для ИИ, задач, майнинга.", gstdCredited)
				}
				_ = s.SendMessageToChat(ctx, chatID, msg)
			}
		}
	}
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

	// /start
	if text == "/start" || strings.HasPrefix(text, "/start ") {
		parts := strings.Fields(text)
		payload := ""
		if len(parts) > 1 {
			payload = strings.ToLower(parts[1])
		}

		// Wallet-as-Node Flow
		if payload == "mining" || payload == "node" {
			msg := msgWalletAsNode[lang]
			if msg == "" {
				msg = msgWalletAsNode["en"]
			}

			btnMine := "⛏ Start Mining"
			btnShare := "📤 Share"
			if lang == "ru" {
				btnMine = "⛏ Начать майнинг"
				btnShare = "📤 Поделиться"
			}

			miningWebAppURL := webAppURL + "/?source=telegram&mode=mining"
			botUsername := os.Getenv("TELEGRAM_BOT_USERNAME")
			if botUsername == "" {
				botUsername = "GSTD_Main_Bot"
			}
			promoLink := "https://t.me/" + botUsername + "?start=mining"
			shareLink := "https://t.me/share/url?url=" + url.QueryEscape(promoLink) + "&text=" + url.QueryEscape("⛏ Join GSTD - Gold Backed DePIN Mining")

			markup := fmt.Sprintf(`{"inline_keyboard":[[{"text":"%s","web_app":{"url":"%s"}}],[{"text":"%s","url":"%s"}]]}`,
				btnMine, miningWebAppURL, btnShare, shareLink)
			return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
		}

		// Standard Start Menu
		msg := msgStart[lang]
		if msg == "" {
			msg = msgStart["en"]
		}

		appURL := webAppURL
		miningURL := webAppURL + "/?source=telegram&mode=mining"
		stonFiURL := "https://app.ston.fi/swap?ft=TON&tt=GSTD"

		lblOpen := "📱 Open App"
		lblMine := "⛏ Mining"
		lblAbout := "ℹ️ About"
		lblStats := "📊 Stats"
		lblBuy := "💰 Buy GSTD"

		if lang == "ru" {
			lblOpen = "📱 Открыть приложение"
			lblMine = "⛏ Майнинг"
			lblAbout = "ℹ️ О проекте"
			lblStats = "📊 Статистика"
			lblBuy = "💰 Купить GSTD"
		}

		lblStars := "⭐ 10 Stars"
		if lang == "ru" {
			lblStars = "⭐ 10 Stars"
		}
		markup := fmt.Sprintf(`{"inline_keyboard":[
			[{"text":"%s","web_app":{"url":"%s"}}],
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","callback_data":"buy_stars_10"}],
			[{"text":"%s","url":"%s"}],
			[{"text":"%s","callback_data":"public_about"},{"text":"%s","callback_data":"public_stats"}]
		]}`, lblOpen, appURL, lblMine, miningURL, lblStars, lblBuy, stonFiURL, lblAbout, lblStats)

		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// /help
	if text == "/help" {
		msg := msgHelp[lang]
		if msg == "" {
			msg = msgHelp["en"]
		}
		return s.SendMessage(ctx, msg)
	}

	// /network
	if text == "/network" {
		return s.sendNetworkStats(ctx, chatID, lang)
	}

	// /buy — Purchase GSTD with Telegram Stars (no wallet needed)
	if text == "/buy" || strings.HasPrefix(text, "/buy ") {
		stars := 10
		if parts := strings.Fields(text); len(parts) > 1 {
			fmt.Sscanf(parts[1], "%d", &stars)
		}
		if stars < 1 {
			stars = 10
		}
		if stars > 1000 {
			stars = 1000
		}
		if err := s.SendStarsInvoice(ctx, chatID, stars, lang); err != nil {
			return s.SendMessageToChat(ctx, chatID, "❌ "+err.Error())
		}
		msg := "💫 Invoice sent! Pay with Telegram Stars. GSTD will be credited instantly."
		if lang == "ru" {
			msg = "💫 Счёт отправлен! Оплатите Stars. GSTD зачислится мгновенно."
		}
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	// Bot API commands (relay to internal /telegram/bot/* for full task flow when webhook is active)
	if s.botToken != "" {
		username, firstName := "", ""
		if senderID != nil {
			username, firstName = senderID.Username, senderID.FirstName
		}
		if res, err := s.callBotAPI(ctx, text, senderIDStr, username, firstName, chatID); res != "" || err != nil {
			if err != nil {
				return s.SendMessageToChat(ctx, chatID, "❌ "+err.Error())
			}
			if res != "" {
				return s.SendMessageToChat(ctx, chatID, markdownToHTML(res))
			}
		}
	}

	// Admin Commands
	if text == "/status" || text == "/balance" || text == "/admin" {
		if s.chatID == "" || senderIDStr != s.chatID {
			_ = s.SendMessageToChat(ctx, chatID, msgAdminOnly[lang])
			return nil
		}
	}

	if text == "/status" {
		return s.handleAdminStatus(ctx, chatID, lang)
	}

	if text == "/admin" {
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

	if text == "/balance" {
		return s.handleAdminBalance(ctx, chatID, lang)
	}

	return nil
}

var mdBoldRe = regexp.MustCompile(`\*\*(.*?)\*\*`)

func markdownToHTML(s string) string {
	return mdBoldRe.ReplaceAllString(s, "<b>$1</b>")
}

// answerCallbackQuery acknowledges a callback query.
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

// handleCallbackQuery processes inline button clicks.
func (s *TelegramService) handleCallbackQuery(ctx context.Context, upd *telegramUpdate) error {
	cq := upd.CallbackQuery
	if cq == nil || cq.From == nil {
		return nil
	}
	chatID := strconv.FormatInt(cq.Message.Chat.ID, 10)
	lang := botLang(cq.From.LanguageCode)
	senderIDStr := strconv.FormatInt(cq.From.ID, 10)

	data := cq.Data

	// 0. Buy Stars (any user)
	if strings.HasPrefix(data, "buy_stars_") {
		var stars int
		fmt.Sscanf(data, "buy_stars_%d", &stars)
		if stars < 1 {
			stars = 10
		}
		if stars > 1000 {
			stars = 1000
		}
		_ = s.answerCallbackQuery(ctx, cq.ID, "")
		if err := s.SendStarsInvoice(ctx, chatID, stars, lang); err != nil {
			return s.SendMessageToChat(ctx, chatID, "❌ "+err.Error())
		}
		msg := "💫 Invoice sent! Pay with Telegram Stars. GSTD credited instantly."
		if lang == "ru" {
			msg = "💫 Счёт отправлен! Оплатите Stars. GSTD зачислится мгновенно."
		}
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	// 1. Public Callbacks
	if strings.HasPrefix(data, "public_") {
		_ = s.answerCallbackQuery(ctx, cq.ID, "")

		switch data {
		case "public_about":
			msg := `👑 <b>About GSTD</b>

<b>Gold Backing:</b>
Every transaction burns tokens and buys <b>XAUt (Tether Gold)</b>. 
The reserves are audited nightly on-chain.

<b>DePIN Power:</b>
GSTD runs on thousands of distributed nodes (phones, PCs). 
No central server. Pure swarm intelligence.

<b>Tokenomics:</b>
• 70% Revenue → Gold
• 5% Revenue → Burn
• Supply: 1,000,000,000 (Deflationary)

<i>Sovereignty backed by physics.</i>`

			if lang == "ru" {
				msg = `👑 <b>О GSTD</b>

<b>Золотое обеспечение:</b>
Каждая транзакция сжигает токены и покупает <b>XAUt (Tether Gold)</b>. 
Резервы проходят аудит каждую ночь.

<b>Мощь DePIN:</b>
GSTD работает на тысячах узлов (телефоны, ПК). 
Никаких центральных серверов. Чистый рой.

<b>Токеномика:</b>
• 70% Выручки → Золото
• 5% Выручки → Сжигание
• Эмиссия: 1,000,000,000 (Дефляционная)

<i>Суверенитет, обеспеченный физикой.</i>`
			}
			return s.SendMessageToChat(ctx, chatID, msg)

		case "public_stats":
			return s.sendNetworkStats(ctx, chatID, lang)
		}
		return nil
	}

	// 2. Admin Callbacks
	if s.chatID == "" || senderIDStr != s.chatID {
		_ = s.answerCallbackQuery(ctx, cq.ID, msgAdminOnly[lang])
		return nil
	}

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
		return s.handleAdminStatus(ctx, chatID, lang)
	case "admin_balance":
		return s.handleAdminBalance(ctx, chatID, lang)
	case "admin_pending":
		return s.handleAdminPending(ctx, chatID, lang)
	}

	return nil
}

// --- Helper Handlers ---

func (s *TelegramService) sendNetworkStats(ctx context.Context, chatID string, lang string) error {
	stats, err := s.fetchPublicStats(ctx)
	if err != nil {
		_ = s.SendMessageToChat(ctx, chatID, msgError[lang]+err.Error())
		return nil
	}
	processing, _ := stats["processing_tasks"].(float64)
	queued, _ := stats["queued_tasks"].(float64)
	completed, _ := stats["completed_tasks"].(float64)
	devices, _ := stats["active_devices_count"].(float64)
	// Some defaults if fields missing

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

<i>GSTD swarm — real-time power</i>`, loadBar, loadPct, processing, queued, completed, devices)

	msgRu := fmt.Sprintf(`📊 <b>Загрузка сети</b>

%s <b>%.0f%%</b>

<b>В работе:</b> %.0f
<b>В очереди:</b> %.0f
<b>Выполнено:</b> %.0f
<b>Активных нод:</b> %.0f

<i>Рой GSTD — мощность в реальном времени</i>`, loadBar, loadPct, processing, queued, completed, devices)

	netMsg := msgEn
	if lang == "ru" {
		netMsg = msgRu
	}
	return s.SendMessageToChat(ctx, chatID, netMsg)
}

func (s *TelegramService) handleAdminStatus(ctx context.Context, chatID string, lang string) error {
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
	title := msgStatusTitle[lang]
	if title == "" {
		title = msgStatusTitle["en"]
	}
	msg := fmt.Sprintf(`%s

<b>Database:</b> %s
<b>Contract:</b> %s (%s)
<b>Sovereign AI:</b> %s`, title, dbStatus, contractStatus, contractTON, aiStatus)
	return s.SendMessageToChat(ctx, chatID, msg)
}

func (s *TelegramService) handleAdminBalance(ctx context.Context, chatID string, lang string) error {
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
	webAppURL := os.Getenv("APP_PUBLIC_URL")
	if webAppURL == "" {
		webAppURL = "https://app.gstdtoken.com"
	}
	msg := fmt.Sprintf(`%s

<b>Contract:</b> %s
<b>%s:</b> %d
`, title, contractTON, usersLabel, totalUsers)
	return s.SendMessageToChat(ctx, chatID, msg)
}

func (s *TelegramService) handleAdminPending(ctx context.Context, chatID string, lang string) error {
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
	req, err := http.NewRequestWithContext(ctx, "GET", s.apiBaseURL+"/api/v1/network/stats", nil)
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
