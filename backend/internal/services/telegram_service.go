package services

import (
	"bytes"
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
	botToken   string
	chatID     string
	db         *sql.DB
	client     *http.Client
	enabled    bool
	apiBaseURL string
	gstdPrice  GSTDPriceProvider
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

// getBotAPIToken returns token for internal /telegram/bot/* calls. Matches RequireBotToken (BOT_API_KEY or TELEGRAM_BOT_TOKEN).
func (s *TelegramService) getBotAPIToken() string {
	if t := os.Getenv("BOT_API_KEY"); t != "" {
		return t
	}
	return s.botToken
}

// callBotAPI relays /connect, /take, /complete, balance, nodes to internal bot API (for webhook mode).
// Returns (response, nil) on success, ("", err) on error, ("", nil) when not a bot command.
func (s *TelegramService) callBotAPI(ctx context.Context, text, senderIDStr, username, firstName, chatID string) (string, error) {
	base := strings.TrimSuffix(s.apiBaseURL, "/")
	token := s.getBotAPIToken()
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

	// 💎 Balance (button or command)
	if text == "💎 Balance" || text == "💎 My Balance" || text == "💎 Баланс" || (text == "/balance" && s.chatID != "" && senderIDStr != s.chatID) {
		req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/telegram/bot/balance?telegram_id=%s", base, senderIDStr), nil)
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
		gstdPriceUSD := 0.02
		if s.gstdPrice != nil {
			if p, err := s.gstdPrice.GetGSTDPriceUSD(ctx); err == nil && p > 0 {
				gstdPriceUSD = p
			}
		}
		usd := (r.BalanceGSTD + r.PendingGSTD) * gstdPriceUSD
		return fmt.Sprintf("💎 **My Balance**\n\n**%.4f GSTD** (available)\n**%.4f GSTD** (pending)\n\n≈ $%.2f USD", r.BalanceGSTD, r.PendingGSTD, usd), nil
	}

	// 🚀 Nodes (button or command)
	if text == "🚀 Nodes" || text == "🚀 My Nodes" {
		req, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/telegram/bot/nodes?telegram_id=%s", base, senderIDStr), nil)
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

	// 🤖 AI Chat (fallback for non-command text)
	if text != "" && !strings.HasPrefix(text, "/") {
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id": telegramID,
			"text":        text,
		})
		req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/ai", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		if resp.StatusCode == 200 {
			var r struct {
				Choices []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				} `json:"choices"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&r); err == nil && len(r.Choices) > 0 {
				return r.Choices[0].Message.Content, nil
			}
		} else if resp.StatusCode == 402 {
			return "⚠️ **Insufficient GSTD**\n\nTop up your balance or run a worker to earn GSTD for expanded AI conversations.", nil
		}
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

// SetGSTDPriceProvider wires the price oracle for real GSTD rate (Stars→GSTD).
func (s *TelegramService) SetGSTDPriceProvider(p GSTDPriceProvider) {
	s.gstdPrice = p
}

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
	PreCheckoutQuery *struct {
		ID   string `json:"id"`
		From *struct {
			ID int64 `json:"id"`
		} `json:"from"`
		Currency       string `json:"currency"`
		TotalAmount    int    `json:"total_amount"`
		InvoicePayload string `json:"invoice_payload"`
	} `json:"pre_checkout_query"`
}

func botLang(langCode string) string {
	if strings.HasPrefix(strings.ToLower(langCode), "ru") {
		return "ru"
	}
	return "en"
}

// --- Messages Configuration ---

var msgStart = map[string]string{
	"en": `🌍 <b>GSTD — Sovereign Intelligence</b>

The world's first Gold-Backed Global Problem-Solving Swarm.
Connect your wallet to tap into the Hive Mind, or become a Neural Node to help humanity.

<b>Choose an action:</b>`,
	"ru": `🌍 <b>GSTD — Суверенный Интеллект</b>

Первый в мире коллективный разум, обеспеченный золотом и решающий глобальные проблемы.
Подключите кошелёк для доступа к Рою, или станьте Нейро-Узлом на благо человечества.

<b>Выберите действие:</b>`,
}

var msgWalletAsNode = map[string]string{
	"en": `🧠 <b>Become a Neural Node</b>

Your TON wallet and device unite to become a brain cell of the Sovereign Organism.

<b>1.</b> Tap <b>Neural Node</b> below
<b>2.</b> Connect your TON wallet in the Web App
<b>3.</b> Process real global datasets and earn GSTD

<i>Help cure disease, model climate, and map the stars. Your phone, humanity's future.</i>`,
	"ru": `🧠 <b>Стать Нейро-Узлом</b>

Ваш TON-кошелёк и устройство становятся нейроном Суверенного Организма.

<b>1.</b> Нажмите <b>Нейро-Узел</b> ниже
<b>2.</b> Подключите TON-кошелёк в Web App
<b>3.</b> Обрабатывайте глобальные данные и зарабатывайте GSTD

<i>Помогайте лечить болезни и моделировать климат. Ваш телефон — будущее человечества.</i>`,
}

var msgHelp = map[string]string{
	"en": `📖 <b>User Guide</b>

• <b>Global Dashboard</b>: Main hive interface. Connect wallet here.
• <b>Neural Node</b>: Earn GSTD by contributing to planetary computations.
• <b>Hive Mind</b>: Uncensored, collective intelligence chat.
• <b>Monitor</b>: Track real-time network capacity and Gold Reserve proof.

<b>GSTD</b> is the lifeblood of the network. Backed by XAUt (Tether Gold).`,
	"ru": `📖 <b>Руководство</b>

• <b>Главный пульт</b>: Интерфейс роя. Подключите кошелёк здесь.
• <b>Нейро-Узел</b>: Зарабатывайте GSTD на вычислениях планетарного масштаба.
• <b>Разум Роя</b>: Чат колективного интеллекта без цензуры.
• <b>Мониторинг</b>: Отслеживайте работу сети и доказательство золотого резерва.

<b>GSTD</b> — кровеносная система сети. Обеспечена золотом XAUt.`,
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

	// Handle callback_query (inline button clicks)
	if upd.CallbackQuery != nil {
		return s.handleCallbackQuery(ctx, &upd)
	}

	if upd.PreCheckoutQuery != nil {
		return s.handlePreCheckoutQuery(ctx, upd.PreCheckoutQuery)
	}

	if upd.Message == nil {
		return nil
	}

	if upd.Message.SuccessfulPayment != nil {
		return s.handleSuccessfulPayment(ctx, &upd)
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

	// /start
	if text == "/start" || strings.HasPrefix(text, "/start ") {
		parts := strings.Fields(text)
		payload := ""
		if len(parts) > 1 {
			payload = strings.ToLower(parts[1])
		}

		btnApp := "📱 Open App"
		btnMining := "🧠 Neural Node"
		btnBalance := "💰 Balance"
		btnBuy := "💰 Buy GSTD"
		btnStars := "⭐️ Buy with Stars"
		btnConnect := "🔗 Connect Wallet"
		btnStats := "📊 Stats"
		btnAbout := "ℹ️ About"

		if lang == "ru" {
			btnApp = "📱 Приложение"
			btnMining = "🧠 Нейро-Узел"
			btnBalance = "💎 Баланс"
			btnBuy = "💰 Купить GSTD"
			btnStars = "⭐️ за Stars"
			btnConnect = "🔗 Кошелек"
			btnStats = "📊 Статистика"
			btnAbout = "ℹ️ О проекте"
		}

		// Wallet-as-Node Flow
		if payload == "mining" || payload == "node" {
			msg := msgWalletAsNode[lang]
			if msg == "" {
				msg = msgWalletAsNode["en"]
			}

			miningWebAppURL := webAppURL + "/?source=telegram&mode=mining"

			// Persistent keyboard for mining flow too
			replyKb := fmt.Sprintf(`{"keyboard":[
				[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","web_app":{"url":"%s"}}],
				[{"text":"%s"},{"text":"%s"}],
				[{"text":"%s"},{"text":"%s"}],
				[{"text":"%s"},{"text":"%s"}]
			],"resize_keyboard":true,"is_persistent":true,"one_time_keyboard":false}`,
				btnApp, webAppURL, btnMining, miningWebAppURL,
				btnBalance, btnBuy,
				btnStars, btnConnect,
				btnStats, btnAbout)
			return s.SendMessageToChatWithMarkup(ctx, chatID, msg, replyKb)
		}

		// Standard Start Menu
		msg := msgStart[lang]
		if msg == "" {
			msg = msgStart["en"]
		}

		appURL := webAppURL
		miningURL := webAppURL + "/?source=telegram&mode=mining"

		// Persistent ReplyKeyboard — always visible, replaces commands
		replyKeyboard := fmt.Sprintf(`{"keyboard":[
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","web_app":{"url":"%s"}}],
			[{"text":"%s"},{"text":"%s"}],
			[{"text":"%s"},{"text":"%s"}],
			[{"text":"%s"},{"text":"%s"}]
		],"resize_keyboard":true,"is_persistent":true,"one_time_keyboard":false}`,
			btnApp, appURL, btnMining, miningURL,
			btnBalance, btnBuy,
			btnStars, btnConnect,
			btnStats, btnAbout)

		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, replyKeyboard)
	}

	// 📖 Help (button or command)
	if text == "📖 Help" || text == "📖 Помощь" || text == "/help" {
		msg := msgHelp[lang]
		if msg == "" {
			msg = msgHelp["en"]
		}
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	// 📊 Stats (button or command)
	if text == "📊 Stats" || text == "📊 Статистика" || text == "/network" {
		return s.sendNetworkStats(ctx, chatID, lang)
	}

	// 🔗 Connect Wallet (button)
	if text == "🔗 Connect Wallet" || text == "🔗 Кошелек" || text == "/connect" {
		msg := "🔗 **Connect Your TON Wallet**\n\nJust send me your TON wallet address in chat. (e.g. `EQDv...`)\n\nDon't have a wallet? Get one here:\n• [Tonkeeper](https://tonkeeper.com/)\n• [MyTonWallet](https://mytonwallet.io/)\n\nAlternatively, you can tap **📱 Open App** and connect via TON Connect."
		if lang == "ru" {
			msg = "🔗 **Привязка кошелька**\n\nПросто отправьте мне адрес вашего TON-кошелька в чат. (например, `EQDv...`)\n\nНет кошелька? Скачайте здесь:\n• [Tonkeeper](https://tonkeeper.com/)\n• [MyTonWallet](https://mytonwallet.io/)\n\nТакже вы можете нажать **📱 Open App** и привязать его через TON Connect."
		}
		return s.SendMessageToChat(ctx, chatID, markdownToHTML(msg))
	}

	// Just typing an address
	if len(text) > 40 && (strings.HasPrefix(text, "EQ") || strings.HasPrefix(text, "UQ")) && !strings.Contains(text, " ") {
		text = "/connect " + text
	}

	// ℹ️ About (button)
	if text == "ℹ️ About" || text == "ℹ️ О проекте" {
		return s.sendAboutMessage(ctx, chatID, lang)
	}

	// 💰 Buy GSTD (button or command)
	if text == "💰 Buy GSTD" || text == "💰 Купить GSTD" || text == "/buy" || strings.HasPrefix(text, "/buy ") {
		msg := "💎 **Buy / Exchange GSTD**\n\nGSTD is a real utility token on the TON blockchain used to purchase computing power and AI requests. Earning and holding GSTD provides tangible ecosystem value.\n\nTo purchase real GSTD, you must use an external DEX since your wallet is truly yours, directly on the blockchain.\n\n"
		msg += "1️⃣ **Link your Wallet**: Type `/connect [wallet_address]` or use the **📱 Open App** button below directly.\n"
		msg += "2️⃣ **Buy on STON.fi**: Direct on-chain exchange using TON. The tokens go immediately to your linked wallet."

		replyMarkup := `{"inline_keyboard":[
			[{"text":"💱 Buy Real GSTD (STON.fi)","url":"https://app.ston.fi/swap?chartVisible=false&ft=TON&tt=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"}],
			[{"text":"🔗 Wait, how to link wallet?","callback_data":"public_connect"}]
		]}`

		if lang == "ru" {
			msg = "💎 **Покупка / Обмен GSTD**\n\nGSTD — это настоящий утилитарный токен в сети TON, используемый для покупки вычислительной мощности и ИИ-запросов. Вы работаете с реальным блокчейном, а не с виртуальными баллами!\n\nДля покупки реального GSTD используйте децентрализованную биржу, чтобы токены сразу оказались на вашем кошельке.\n\n"
			msg += "1️⃣ **Привяжите кошелек**: Просто отправьте адрес в чат или привяжите через кнопку **📱 Open App**.\n"
			msg += "2️⃣ **Покупка на STON.fi**: Прямой ончейн обмен за TON. Токены мгновенно поступают на ваш кошелек."

			replyMarkup = `{"inline_keyboard":[
				[{"text":"💱 Реальная покупка (STON.fi)","url":"https://app.ston.fi/swap?chartVisible=false&ft=TON&tt=EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"}],
				[{"text":"🔗 А как привязать кошелек?","callback_data":"public_connect"}]
			]}`
		}
		return s.SendMessageToChatWithMarkup(ctx, chatID, markdownToHTML(msg), replyMarkup)
	}

	// ⭐️ Buy with Stars (button or command)
	if text == "⭐️ Buy with Stars" || text == "⭐️ за Stars" || text == "/buy_stars" {
		title := "GSTD Tokens (via Stars)"
		desc := "Purchase 100 GSTD using Telegram Stars for computing and AI tasks."
		if lang == "ru" {
			title = "GSTD Токены (за Звёзды)"
			desc = "Покупка 100 GSTD за Telegram Stars для вычислений и ИИ-задач."
		}
		// Assuming 1 Telegram Star = 1 GSTD point for simplicity, or 100 stars = 100 GSTD.
		// Set amount = 100 Stars
		return s.sendInvoiceWithStars(ctx, chatID, title, desc, "gstd_100_stars", 100)
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

	// 1. Public Callbacks
	if strings.HasPrefix(data, "public_") {
		_ = s.answerCallbackQuery(ctx, cq.ID, "")

		switch data {
		case "public_about":
			msg := `🌍 <b>The Global Brain (GSTD)</b>

<b>Gold Backing:</b>
Every planetary transaction burns tokens and buys <b>XAUt (Tether Gold)</b>. 
The reserves are audited nightly on-chain.

<b>Sovereign Organism:</b>
GSTD runs on millions of interconnected devices. 
No central server. Pure swarm intelligence solving humanity's massive problems.

<b>Tokenomics:</b>
• 70% Revenue → Gold Reserve
• 5% Revenue → Burn
• Supply: 1,000,000,000 (Deflationary)

<i>A thinking network powered by humanity.</i>`

			if lang == "ru" {
				msg = `🌍 <b>Глобальный Мозг (GSTD)</b>

<b>Золотое обеспечение:</b>
Каждая транзакция сжигает токены и покупает <b>XAUt (Tether Gold)</b>. 
Резервы проходят аудит каждую ночь.

<b>Суверенный Организм:</b>
GSTD работает на миллионах связанных устройств. 
Никаких центральных серверов. Чистый разум роя, решающий проблемы человечества.

<b>Токеномика:</b>
• 70% Выручки → Золотой резерв
• 5% Выручки → Сжигание
• Эмиссия: 1,000,000,000 (Дефляционная)

<i>Думающая сеть, созданная человечеством.</i>`
			}
			return s.SendMessageToChat(ctx, chatID, msg)

		case "public_connect":
			msg := "🔗 **Connect Your TON Wallet**\n\nTo link your wallet in the bot, send a message with the command `/connect` followed by your TON wallet address.\n\nExample:\n`/connect EQDv...`\n\nAlternatively, you can tap **📱 Open App** and connect it directly in the Web App interface."
			if lang == "ru" {
				msg = "🔗 **Привязка кошелька**\n\nЧтобы привязать кошелек прямо в боте, отправьте сообщение с командой `/connect` и адресом вашего TON-кошелька.\n\nПример:\n`/connect EQDv...`\n\nТакже вы можете нажать **📱 Open App** и привязать его напрямую через интерфейс приложения."
			}
			return s.SendMessageToChat(ctx, chatID, markdownToHTML(msg))

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

func (s *TelegramService) sendAboutMessage(ctx context.Context, chatID string, lang string) error {
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
}

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

func (s *TelegramService) handlePreCheckoutQuery(ctx context.Context, pcq *struct {
	ID   string `json:"id"`
	From *struct {
		ID int64 `json:"id"`
	} `json:"from"`
	Currency       string `json:"currency"`
	TotalAmount    int    `json:"total_amount"`
	InvoicePayload string `json:"invoice_payload"`
}) error {
	if s.botToken == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/answerPreCheckoutQuery", s.botToken)
	values := url.Values{}
	values.Set("pre_checkout_query_id", pcq.ID)
	values.Set("ok", "true")

	req, _ := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.client.Do(req)
	if err == nil {
		defer resp.Body.Close()
	}
	return err
}

func (s *TelegramService) sendInvoiceWithStars(ctx context.Context, chatID string, title string, desc string, payload string, starsAmount int) error {
	if s.botToken == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendInvoice", s.botToken)
	values := url.Values{}
	values.Set("chat_id", chatID)
	values.Set("title", title)
	values.Set("description", desc)
	values.Set("payload", payload)
	values.Set("provider_token", "") // Empty for Telegram Stars
	values.Set("currency", "XTR")
	values.Set("prices", fmt.Sprintf(`[{"label":"%s","amount":%d}]`, title, starsAmount))

	req, _ := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (s *TelegramService) handleSuccessfulPayment(ctx context.Context, upd *telegramUpdate) error {
	if upd.Message == nil || upd.Message.SuccessfulPayment == nil || upd.Message.From == nil {
		return nil
	}

	sp := upd.Message.SuccessfulPayment
	tgID := upd.Message.From.ID
	chatID := strconv.FormatInt(upd.Message.Chat.ID, 10)

	gstdCredited := float64(sp.TotalAmount) // e.g. 100 stars = 100 GSTD
	walletAddr := fmt.Sprintf("tg-%d", tgID)

	taskIDLaunched := ""

	// Parse custom invoice payload (e.g. monitor_launch:signal-xxx:wallet:reward)
	if strings.HasPrefix(sp.InvoicePayload, "monitor_launch:") {
		parts := strings.Split(sp.InvoicePayload, ":")
		if len(parts) >= 4 {
			taskIDLaunched = parts[1]
			sponsorWallet := parts[2]
			rewardStr := parts[3]
			rewardVal, _ := strconv.ParseFloat(rewardStr, 64)

			if sponsorWallet != "" && sponsorWallet != "platform_monitor" {
				walletAddr = sponsorWallet
			}

			// Launch the task automatically upon payment
			if s.db != nil {
				_, _ = s.db.ExecContext(ctx, `
					INSERT INTO tasks (
						task_id, requester_address, budget_gstd, reward_per_worker, 
						status, type, payload, created_at, updated_at
					) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
				`, taskIDLaunched, walletAddr, rewardVal, rewardVal, "queued", "signal_analysis", `{"signal_id": "`+taskIDLaunched+`"}`)

				// Notify the Global Channel/Monitor channel if needed
				msgAlert := fmt.Sprintf("🌍 <b>Global Signal Analysis Sponsored!</b>\n\n"+
					"<b>Signal:</b> %s\n"+
					"<b>Sponsorship:</b> %d ⭐️\n"+
					"<b>Swarm Reward:</b> %.2f GSTD\n\n"+
					"<i>The Swarm is now processing this anomaly. Insights will be injected into Collective Memory.</i>",
					taskIDLaunched, sp.TotalAmount, rewardVal)
				_ = s.SendMessage(ctx, msgAlert)
			}
		}
	}

	if s.db != nil {
		// Ensure user exists
		_, _ = s.db.ExecContext(ctx, `INSERT INTO users (wallet_address, balance, created_at, updated_at) VALUES ($1, 0, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, walletAddr)

		// Insert purchase record & add balance
		tx, err := s.db.BeginTx(ctx, nil)
		if err == nil {
			var insertedID int64
			err = tx.QueryRowContext(ctx, `
				INSERT INTO stars_purchases (telegram_payment_charge_id, telegram_id, stars_amount, gstd_credited, wallet_address, created_at)
				VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (telegram_payment_charge_id) DO NOTHING RETURNING id
			`, sp.TelegramPaymentChargeID, tgID, sp.TotalAmount, gstdCredited, walletAddr).Scan(&insertedID)

			if err != sql.ErrNoRows && err == nil {
				// Added the balance precisely only if not conflict.
				_, _ = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1 WHERE wallet_address = $2`, gstdCredited, walletAddr)
			}
			_ = tx.Commit()
		}
	}

	msg := fmt.Sprintf("✅ <b>Payment Successful!</b>\n\nYou have purchased <b>%.0f GSTD</b> with %d Telegram Stars.\n\nThe GSTD has been credited to your internal bot wallet <code>%s</code>.", gstdCredited, sp.TotalAmount, walletAddr)
	if taskIDLaunched != "" {
		msg += fmt.Sprintf("\n\n🚀 <b>Signal task %s has been launched automatically!</b>", taskIDLaunched)
	}

	if botLang(upd.Message.From.LanguageCode) == "ru" {
		msg = fmt.Sprintf("✅ <b>Оплата успешна!</b>\n\nВы успешно приобрели <b>%.0f GSTD</b> за %d Telegram Stars.\n\nGSTD были зачислены на ваш внутренний кошелёк <code>%s</code>.", gstdCredited, sp.TotalAmount, walletAddr)
		if taskIDLaunched != "" {
			msg += fmt.Sprintf("\n\n🚀 <b>Анализ сигнала %s успешно запущен!</b>", taskIDLaunched)
		}
	}

	return s.SendMessageToChat(ctx, chatID, msg)
}

func (s *TelegramService) CreateInvoiceLinkWithStars(ctx context.Context, title string, desc string, payload string, starsAmount int) (string, error) {
	if s.botToken == "" {
		return "", fmt.Errorf("bot token not configured")
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/createInvoiceLink", s.botToken)

	reqBody := map[string]interface{}{
		"title":          title,
		"description":    desc,
		"payload":        payload,
		"provider_token": "", // Empty for Stars
		"currency":       "XTR",
		"prices":         []map[string]interface{}{{"label": title, "amount": starsAmount}},
	}
	bodyData, _ := json.Marshal(reqBody)

	req, _ := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(bodyData))
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tgResp struct {
		Ok     bool   `json:"ok"`
		Result string `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tgResp); err != nil {
		return "", err
	}
	if !tgResp.Ok {
		return "", fmt.Errorf("failed to create invoice link (check telegram bot token or payload)")
	}
	return tgResp.Result, nil
}
