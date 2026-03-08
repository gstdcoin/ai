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
	botToken    string
	chatID      string
	db          *sql.DB
	client      *http.Client
	enabled     bool
	apiBaseURL  string
	gstdPrice   GSTDPriceProvider
	smartRouter *SmartRouter
}

// SetSmartRouter wires the Omega SmartRouter for inline query AI.
func (s *TelegramService) SetSmartRouter(r *SmartRouter) {
	s.smartRouter = r
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
func (s *TelegramService) callBotAPI(ctx context.Context, text, senderIDStr, username, firstName, chatID, lang string) (string, error) {
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
			if lang == "ru" {
				return "❌ Ошибка привязки кошелька. Проверьте адрес и попробуйте снова.", nil
			}
			return "❌ Failed to link wallet. Check the address and try again.", nil
		}
		shortW := wallet[:6] + "..." + wallet[len(wallet)-4:]
		if lang == "ru" {
			return fmt.Sprintf("✅ <b>Кошелёк привязан!</b>\n\n📋 %s\n<code>%s</code>\n\n💰 Все купленные GSTD будут зачисляться на этот кошелёк.", shortW, wallet), nil
		}
		return fmt.Sprintf("✅ <b>Wallet Linked!</b>\n\n📋 %s\n<code>%s</code>\n\n💰 All purchased GSTD will be credited to this wallet.", shortW, wallet), nil
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
		balReq, _ := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s/api/v1/telegram/bot/balance?telegram_id=%s", base, senderIDStr), nil)
		balReq.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(balReq)
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

		proReqs := int(r.BalanceGSTD / 0.1)
		gstdPriceUSD := 0.02
		if s.gstdPrice != nil {
			if p, err := s.gstdPrice.GetGSTDPriceUSD(ctx); err == nil && p > 0 {
				gstdPriceUSD = p
			}
		}
		usd := r.BalanceGSTD * gstdPriceUSD

		// Get cocoon level
		var cocoonLvl int
		if s.db != nil {
			tgWallet := fmt.Sprintf("tg-%s", senderIDStr)
			_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(cocoon_interactions, 0) FROM users WHERE wallet_address = $1`, tgWallet).Scan(&cocoonLvl)
		}

		var msg string
		if lang == "ru" {
			msg = fmt.Sprintf("💎 <b>Мой Баланс</b>\n\n"+
				"💰 <b>%.4f GSTD</b> ≈ $%.2f\n"+
				"⚡ Pro запросов: <b>%d</b>\n",
				r.BalanceGSTD, usd, proReqs)
			if cocoonLvl > 0 {
				msg += fmt.Sprintf("🧠 Cocoon уровень: <b>%d</b>\n", cocoonLvl)
			}
			if r.PendingGSTD > 0 {
				net := r.PendingGSTD * 0.85
				msg += fmt.Sprintf("\n⏳ <b>Награда за майнинг: %.4f GSTD</b>\n", r.PendingGSTD)
				msg += fmt.Sprintf("   └ После комиссии: <b>%.4f GSTD</b>\n", net)
				msg += "   └ 10% → Золотой Резерв, 5% → Сжигание\n"
			}
			msg += "\n<i>🆓 Бесплатная модель доступна всегда\n"
			msg += "⚡ Pro = 0.1 GSTD/запрос ($0.005)</i>"
		} else {
			msg = fmt.Sprintf("💎 <b>My Balance</b>\n\n"+
				"💰 <b>%.4f GSTD</b> ≈ $%.2f\n"+
				"⚡ Pro requests: <b>%d</b>\n",
				r.BalanceGSTD, usd, proReqs)
			if cocoonLvl > 0 {
				msg += fmt.Sprintf("🧠 Cocoon level: <b>%d</b>\n", cocoonLvl)
			}
			if r.PendingGSTD > 0 {
				net := r.PendingGSTD * 0.85
				msg += fmt.Sprintf("\n⏳ <b>Mining reward: %.4f GSTD</b>\n", r.PendingGSTD)
				msg += fmt.Sprintf("   └ After commission: <b>%.4f GSTD</b>\n", net)
				msg += "   └ 10% → Gold Reserve, 5% → Burn\n"
			}
			msg += "\n<i>🆓 Free model always available\n"
			msg += "⚡ Pro = 0.1 GSTD/request ($0.005)</i>"
		}

		// If pending > 0, show Claim button
		if r.PendingGSTD >= 0.01 {
			btnText := "🎁 Claim Reward"
			if lang == "ru" {
				btnText = "🎁 Забрать награду"
			}
			markup := fmt.Sprintf(`{"inline_keyboard":[[{"text":"%s","callback_data":"claim_reward"}]]}`, btnText)
			_ = s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
			return "", nil
		}

		return msg, nil
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

	// 🤖 AI Chat (fallback for non-command text) — always available
	if text != "" && !strings.HasPrefix(text, "/") {
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id": telegramID,
			"text":        text,
		})
		aiReq, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/ai", strings.NewReader(string(body)))
		aiReq.Header.Set("Content-Type", "application/json")
		aiReq.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(aiReq)
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
				aiResponse := r.Choices[0].Message.Content

				// Build tier footer
				tier := resp.Header.Get("X-GSTD-Tier")
				balanceStr := resp.Header.Get("X-GSTD-Balance")
				cocoonStr := resp.Header.Get("X-GSTD-Cocoon")

				footer := "\n\n━━━━━━━━━━━\n"
				if tier == "pro" {
					if lang == "ru" {
						footer += fmt.Sprintf("⚡ Cocoon Pro · Ур.%s · %s GSTD", cocoonStr, balanceStr)
					} else {
						footer += fmt.Sprintf("⚡ Cocoon Pro · Lvl %s · %s GSTD", cocoonStr, balanceStr)
					}
				} else {
					if lang == "ru" {
						footer += "🆓 Коллективная Память"
					} else {
						footer += "🆓 Collective Memory"
					}
				}

				aiResponse += footer

				// Every 10th free request — subtle Pro upgrade hint
				if tier == "free" {
					var totalReqs int
					if s.db != nil {
						tgWallet := fmt.Sprintf("tg-%s", senderIDStr)
						_ = s.db.QueryRowContext(ctx, `
							SELECT COALESCE(ai_requests_count, 0) FROM users WHERE wallet_address = $1
						`, tgWallet).Scan(&totalReqs)
					}
					if totalReqs > 0 && totalReqs%10 == 0 {
						webAppURL := os.Getenv("APP_PUBLIC_URL")
						if webAppURL == "" {
							webAppURL = "https://app.gstdtoken.com"
						}

						var hintMsg string
						if lang == "ru" {
							hintMsg = "\n\n💡 <i>Попробуй</i> <b>⚡ Pro</b> <i>— Cocoon учится и становится умнее с каждым запросом. 10⭐ = 100 Pro запросов.</i>"
						} else {
							hintMsg = "\n\n💡 <i>Try</i> <b>⚡ Pro</b> <i>— Cocoon learns and gets smarter with each request. 10⭐ = 100 Pro requests.</i>"
						}

						btnText := "⚡ Unlock Pro"
						if lang == "ru" {
							btnText = "⚡ Включить Pro"
						}

						markup := fmt.Sprintf(`{"inline_keyboard":[[{"text":"%s","callback_data":"public_buy_stars"}]]}`, btnText)
						_ = s.SendMessageToChatWithMarkup(ctx, chatID, aiResponse+hintMsg, markup)
						return "", nil
					}
				}

				return aiResponse, nil
			}
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
	InlineQuery *telegramInlineQuery `json:"inline_query"`
}

// telegramInlineQuery represents a Telegram inline query.
type telegramInlineQuery struct {
	ID   string `json:"id"`
	From *struct {
		ID           int64  `json:"id"`
		FirstName    string `json:"first_name"`
		Username     string `json:"username"`
		LanguageCode string `json:"language_code"`
	} `json:"from"`
	Query  string `json:"query"`
	Offset string `json:"offset"`
}

func botLang(langCode string) string {
	if strings.HasPrefix(strings.ToLower(langCode), "ru") {
		return "ru"
	}
	return "en"
}

// --- Messages Configuration ---

var msgStart = map[string]string{
	"en": `🤖 <b>GSTD — Sovereign AI in Telegram</b>

<b>Just write anything</b> — I answer right away. Always free.

🆓 <b>Free</b> — Collective Memory, basic model, unlimited
⚡ <b>Pro</b> — Cocoon (learns your style), best models, Swarm analysis

<b>How to unlock Pro:</b>
1. Tap <b>🔗 Link Wallet</b> — connect your TON wallet
2. Top up GSTD — via ⭐️ Stars or earn in the Swarm
3. Ask anything — Cocoon gets smarter with each request

💡 <b>10⭐ ($0.50) = 100 Pro requests</b>
ChatGPT = $20/mo. GSTD Pro = <b>40× cheaper</b>.

👇 <b>Type your question or tap a button!</b>`,
	"ru": `🤖 <b>GSTD — Суверенный ИИ в Telegram</b>

<b>Просто напиши что угодно</b> — я отвечу сразу. Всегда бесплатно.

🆓 <b>Бесплатно</b> — Коллективная Память, базовая модель, без лимитов
⚡ <b>Pro</b> — Cocoon (учится под тебя), лучшие модели, анализ через Рой

<b>Как открыть Pro:</b>
1. Нажми <b>🔗 Привязать кошелёк</b> — подключи TON
2. Пополни GSTD — через ⭐️ Stars или заработай в Рое
3. Спрашивай что угодно — Cocoon умнеет с каждым запросом

💡 <b>10⭐ ($0.50) = 100 Pro запросов</b>
ChatGPT = $20/мес. GSTD Pro = <b>в 40 раз дешевле</b>.

👇 <b>Пиши вопрос или нажми кнопку!</b>`,
}

var msgWalletAsNode = map[string]string{
	"en": `🧠 <b>Earn GSTD — Become a Neural Node</b>

Your phone becomes a node of the decentralized supercomputer.
You earn GSTD while the Swarm solves real global problems.

<b>How it works:</b>
1. Tap <b>🧠 Earn GSTD</b> below — opens the dashboard
2. Press <b>🔥 Ignite Node</b> — your phone starts computing
3. GSTD is credited automatically — spend it on Pro AI

💡 <b>No battery drain</b> — smart throttling protects your device
💡 <b>Earn even while sleeping</b> — Wake Lock keeps it running

<i>Every phone in the Swarm makes AI smarter for everyone.</i>`,
	"ru": `🧠 <b>Заработай GSTD — Стань Нейро-Узлом</b>

Твой телефон становится узлом децентрализованного суперкомпьютера.
Ты зарабатываешь GSTD, пока Рой решает глобальные задачи.

<b>Как это работает:</b>
1. Нажми <b>🧠 Заработать</b> ниже — откроется панель
2. Нажми <b>🔥 Включить Узел</b> — телефон начнёт считать
3. GSTD начисляется автоматически — трать на Pro ИИ

💡 <b>Батарея не садится</b> — умный троттлинг бережёт устройство
💡 <b>Зарабатывай даже во сне</b> — Wake Lock не даёт уснуть

<i>Каждый телефон в Рое делает ИИ умнее для всех.</i>`,
}

var msgHelp = map[string]string{
	"en": `📖 <b>How It Works</b>

<b>🆓 Free (always available):</b>
• Basic AI model + Collective Memory
• No limits, no wallet needed
• Just type and get answers

<b>⚡ Cocoon Pro (GSTD):</b>
• Best models — learn your style over time
• Swarm-powered analysis + extended context
• Cocoon gets smarter with each request
• 0.1 GSTD per request ($0.005)

<b>💰 How to get GSTD:</b>
• <b>⭐ Stars</b> — 10⭐ ($0.50) = 100 Pro requests
• <b>🧠 Swarm</b> — earn free GSTD by computing
• <b>💱 STON.fi</b> — buy on DEX for TON

<b>🔗 Wallet:</b>
Tap <b>🔗 Link Wallet</b> to connect TON.
Needed for: Pro tier, earning, withdrawals.

<b>📊 Economics:</b>
• 85% of payments → compute workers
• 10% → Gold Reserve (XAUt)
• 5% → Token burn (deflationary)

<i>GSTD — gold-backed AI fuel. Your phone = a supercomputer.</i>`,
	"ru": `📖 <b>Как это работает</b>

<b>🆓 Бесплатно (всегда доступно):</b>
• Базовая модель ИИ + Коллективная Память
• Без лимитов, кошелёк не нужен
• Просто пиши и получай ответы

<b>⚡ Cocoon Pro (GSTD):</b>
• Лучшие модели — учатся под твой стиль
• Анализ через Рой + расширенный контекст
• Cocoon умнеет с каждым запросом
• 0.1 GSTD за запрос ($0.005)

<b>💰 Как получить GSTD:</b>
• <b>⭐ Stars</b> — 10⭐ ($0.50) = 100 Pro запросов
• <b>🧠 Рой</b> — зарабатывай бесплатно вычислениями
• <b>💱 STON.fi</b> — купи на бирже за TON

<b>🔗 Кошелёк:</b>
Нажми <b>🔗 Привязать кошелёк</b> для подключения TON.
Нужен для: Pro режима, заработка, вывода.

<b>📊 Экономика:</b>
• 85% платежей → исполнителям задач
• 10% → Золотой Резерв (XAUt)
• 5% → Сжигание токенов (дефляция)

<i>GSTD — топливо ИИ, обеспеченное золотом. Твой телефон = суперкомпьютер.</i>`,
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

	// Handle inline_query (@GSTDBot <query> in any chat)
	if upd.InlineQuery != nil {
		return s.handleInlineQuery(ctx, upd.InlineQuery)
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

		// Simplified buttons — only buttons, no /commands
		btnBalance := "💎 Balance"
		btnStars := "⭐️ Top Up"
		btnWallet := "🔗 Link Wallet"
		btnMining := "🧠 Earn GSTD"
		btnApp := "📱 App"
		btnHelp := "📖 Help"

		if lang == "ru" {
			btnBalance = "💎 Баланс"
			btnStars = "⭐️ Пополнить"
			btnWallet = "🔗 Привязать кошелёк"
			btnMining = "🧠 Заработать"
			btnApp = "📱 Приложение"
			btnHelp = "📖 Помощь"
		}

		// Sponsor Signal Flow (deep link from Monitor)
		// Format: sponsor-SIGNALID-STARS (e.g. sponsor-nasa_eosdis-3500)
		// Uses dash separator because signal IDs contain underscores
		if strings.HasPrefix(payload, "sponsor-") {
			sponsorParts := strings.SplitN(payload, "-", 3)
			signalID := "unknown"
			starsAmount := 100
			if len(sponsorParts) >= 2 {
				signalID = sponsorParts[1]
			}
			if len(sponsorParts) >= 3 {
				fmt.Sscanf(sponsorParts[2], "%d", &starsAmount)
			}
			if starsAmount < 1 {
				starsAmount = 100
			}

			title := "Sponsor Signal Analysis"
			desc := fmt.Sprintf("Sponsor Swarm analysis for signal %s — %d ⭐️ → GSTD for workers + results stored in Collective Memory.", signalID, starsAmount)
			if lang == "ru" {
				title = "Спонсирование сигнала"
				desc = fmt.Sprintf("Спонсирование анализа сигнала %s — %d ⭐️ → GSTD работникам + результат сохраняется в Коллективной Памяти.", signalID, starsAmount)
			}

			invoicePayload := fmt.Sprintf("monitor_launch:%s:%s:%.2f", signalID, "tg-"+senderIDStr, float64(starsAmount)*0.8)
			return s.sendInvoiceWithStars(ctx, chatID, title, desc, invoicePayload, starsAmount)
		}

		// Wallet-as-Node Flow
		if payload == "mining" || payload == "node" {
			msg := msgWalletAsNode[lang]
			if msg == "" {
				msg = msgWalletAsNode["en"]
			}

			miningWebAppURL := webAppURL + "/?source=telegram&mode=mining"

			// Keyboard for mining flow
			replyKb := fmt.Sprintf(`{"keyboard":[
				[{"text":"%s"},{"text":"%s"}],
				[{"text":"%s","web_app":{"url":"%s"}}],
				[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s"}]
			],"resize_keyboard":true,"is_persistent":true,"one_time_keyboard":false}`,
				btnBalance, btnStars,
				btnMining, miningWebAppURL,
				btnWallet, webAppURL, btnHelp)
			return s.SendMessageToChatWithMarkup(ctx, chatID, msg, replyKb)
		}

		// Standard Start Menu
		msg := msgStart[lang]
		if msg == "" {
			msg = msgStart["en"]
		}

		// Auto-provision internal temporary wallet for free tier
		if s.db != nil && senderIDStr != "" {
			tgWallet := fmt.Sprintf("tg-%s", senderIDStr)
			_, _ = s.db.ExecContext(ctx, `
				INSERT INTO users (wallet_address, balance, gstd_balance, created_at, updated_at)
				VALUES ($1, 0, 0, NOW(), NOW())
				ON CONFLICT (wallet_address) DO NOTHING
			`, tgWallet)
		}

		miningURL := webAppURL + "/?source=telegram&mode=mining"
		walletURL := webAppURL + "/?source=telegram&action=connect"

		// Button-only keyboard: Balance/TopUp | Wallet/Earn (TWA) | App/Help
		replyKeyboard := fmt.Sprintf(`{"keyboard":[
			[{"text":"%s"},{"text":"%s"}],
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s","web_app":{"url":"%s"}}],
			[{"text":"%s","web_app":{"url":"%s"}},{"text":"%s"}]
		],"resize_keyboard":true,"is_persistent":true,"one_time_keyboard":false}`,
			btnBalance, btnStars,
			btnWallet, walletURL, btnMining, miningURL,
			btnApp, webAppURL, btnHelp)

		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, replyKeyboard)
	}

	// 💎 Balance (button)
	if text == "💎 Balance" || text == "💎 Баланс" {
		return s.handleBalanceButton(ctx, chatID, senderIDStr, lang)
	}

	// ⭐️ Top Up (button) — show tiers with Stars invoice
	if text == "⭐️ Top Up" || text == "⭐️ Пополнить" {
		return s.handleTopUpButton(ctx, chatID, senderIDStr, lang)
	}

	// 🧠 Earn (button)
	if text == "🧠 Earn" || text == "🧠 Заработать" {
		msg := "🧠 <b>Earn GSTD</b>\n\nBecome a Neural Node — your device computes for the Swarm and earns GSTD.\n\n📱 <a href=\"https://app.gstdtoken.com/?source=telegram&mode=mining\">Open Mining Dashboard</a>"
		if lang == "ru" {
			msg = "🧠 <b>Заработать GSTD</b>\n\nСтань Нейро-Узлом — твоё устройство вычисляет для Роя и зарабатывает GSTD.\n\n📱 <a href=\"https://app.gstdtoken.com/?source=telegram&mode=mining\">Открыть панель майнинга</a>"
		}
		return s.SendMessageToChat(ctx, chatID, msg)
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
	if text == "📊 Stats" || text == "📊 Статистика" || text == "/network" || text == "/stats" {
		return s.sendNetworkStats(ctx, chatID, lang)
	}

	// 🌍 Monitor (button)
	if text == "🌍 Monitor" || text == "🌍 Монитор" || text == "/monitor" {
		msg := "🌍 <b>Global Signal Monitor</b>\n\n16 planetary-scale problems awaiting Swarm analysis — from drug discovery to earthquake prediction.\n\n📡 <b>Sponsor a signal</b> with Telegram Stars to deploy the Swarm.\n\n👉 <a href=\"https://monitor.gstdtoken.com\">Open Monitor</a>"
		if lang == "ru" {
			msg = "🌍 <b>Монитор Глобальных Сигналов</b>\n\n16 планетарных проблем, ожидающих анализа Роя — от создания лекарств до предсказания землетрясений.\n\n📡 <b>Спонсируйте сигнал</b> через Telegram Stars для запуска Роя.\n\n👉 <a href=\"https://monitor.gstdtoken.com\">Открыть Монитор</a>"
		}
		markup := `{"inline_keyboard":[[{"text":"🌍 Open Live Monitor","url":"https://monitor.gstdtoken.com"}]]}`
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
	}

	// 🔗 Connect Wallet (button) — cover all variants from both webhook and grammY keyboards
	if text == "🔗 Connect Wallet" || text == "🔗 Кошелек" || text == "🔗 Кошелёк" ||
		text == "🔗 Wallet" || text == "🔗 Привязать кошелёк" || text == "🔗 Link Wallet" ||
		text == "/connect" {
		// Check if wallet is already linked
		if s.db != nil && senderIDStr != "" {
			var existingWallet string
			tgIDForWallet, _ := strconv.ParseInt(senderIDStr, 10, 64)
			if tgIDForWallet > 0 {
				_ = s.db.QueryRowContext(ctx,
					`SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL`,
					tgIDForWallet,
				).Scan(&existingWallet)
			}
			if existingWallet != "" && !strings.HasPrefix(existingWallet, "tg-") {
				shortW := existingWallet[:6] + "..." + existingWallet[len(existingWallet)-4:]
				if lang == "ru" {
					msg := fmt.Sprintf("🔗 <b>Ваш кошелёк</b>\n\n✅ Привязан: <code>%s</code>\n📋 %s\n\n💡 Чтобы сменить кошелёк, отправьте новый адрес TON-кошелька в чат.\n\nНапример: <code>EQDv...</code>", existingWallet, shortW)
					return s.SendMessageToChat(ctx, chatID, msg)
				}
				msg := fmt.Sprintf("🔗 <b>Your Wallet</b>\n\n✅ Linked: <code>%s</code>\n📋 %s\n\n💡 To change wallet, send a new TON wallet address in the chat.\n\nExample: <code>EQDv...</code>", existingWallet, shortW)
				return s.SendMessageToChat(ctx, chatID, msg)
			}
		}
		if lang == "ru" {
			msg := "🔗 <b>Привязка кошелька</b>\n\n⚠️ Кошелёк не привязан.\n\nОтправьте адрес вашего TON-кошелька прямо в чат.\n\nНапример: <code>EQDv...</code>\n\n❓ Нет кошелька?\n• <a href=\"https://tonkeeper.com\">Tonkeeper</a>\n• <a href=\"https://mytonwallet.io\">MyTonWallet</a>\n\n💡 <i>После привязки кошелька все купленные GSTD будут зачисляться на него.</i>"
			return s.SendMessageToChatWithMarkup(ctx, chatID, msg, "")
		}
		msg := "🔗 <b>Connect Wallet</b>\n\n⚠️ No wallet linked.\n\nSend your TON wallet address in the chat.\n\nExample: <code>EQDv...</code>\n\n❓ No wallet?\n• <a href=\"https://tonkeeper.com\">Tonkeeper</a>\n• <a href=\"https://mytonwallet.io\">MyTonWallet</a>\n\n💡 <i>After linking, all purchased GSTD will be credited to your wallet.</i>"
		return s.SendMessageToChatWithMarkup(ctx, chatID, msg, "")
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

	// ⭐️ Top Up / Buy Fuel (button)
	if text == "⭐️ Top Up" || text == "⭐️ Пополнить" || text == "⭐️ Buy Fuel" || text == "⭐️ Купить топливо" || text == "⭐️ Buy with Stars" || text == "⭐️ за Stars" || text == "/fuel" {
		title := "GSTD Tokens (via Stars)"
		desc := "Purchase 100 GSTD using Telegram Stars for computing and AI tasks."
		if lang == "ru" {
			title = "GSTD Токены (за Звёзды)"
			desc = "10 GSTD = 100 запросов к ИИ. Дешевле любой подписки!"
		}
		return s.sendInvoiceWithStars(ctx, chatID, title, desc, "gstd_fuel_10", 10)
	}

	// Bot API commands (relay to internal /telegram/bot/* for full task flow when webhook is active)
	if s.botToken != "" {
		username, firstName := "", ""
		if senderID != nil {
			username, firstName = senderID.Username, senderID.FirstName
		}
		if res, err := s.callBotAPI(ctx, text, senderIDStr, username, firstName, chatID, lang); res != "" || err != nil {
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

		case "public_buy_stars":
			title := "GSTD AI Fuel (100 requests)"
			desc := "Buy 10 GSTD = 100 AI requests in the bot."
			if lang == "ru" {
				title = "GSTD Топливо (100 запросов)"
				desc = "Купить 10 GSTD = 100 запросов к ИИ в боте."
			}
			return s.sendInvoiceWithStars(ctx, chatID, title, desc, "gstd_fuel_10", 10)
		}
		return nil
	}
	// 2. Claim Reward callback
	if data == "claim_reward" {
		_ = s.answerCallbackQuery(ctx, cq.ID, "")
		base := strings.TrimSuffix(s.apiBaseURL, "/")
		token := s.getBotAPIToken()

		body, _ := json.Marshal(map[string]interface{}{"telegram_id": cq.From.ID})
		claimReq, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/claim_reward", strings.NewReader(string(body)))
		claimReq.Header.Set("Content-Type", "application/json")
		claimReq.Header.Set("X-Bot-Token", token)
		resp, err := s.client.Do(claimReq)
		if err != nil {
			return s.SendMessageToChat(ctx, chatID, "❌ Error claiming reward")
		}
		defer resp.Body.Close()

		var result struct {
			Success     bool    `json:"success"`
			ClaimedNet  float64 `json:"claimed_net"`
			GoldReserve float64 `json:"gold_reserve"`
			Burned      float64 `json:"burned"`
		}
		json.NewDecoder(resp.Body).Decode(&result)

		if !result.Success {
			if lang == "ru" {
				return s.SendMessageToChat(ctx, chatID, "ℹ️ Нет наград для получения. Включи 🧠 Нейро-Узел чтобы начать зарабатывать!")
			}
			return s.SendMessageToChat(ctx, chatID, "ℹ️ No rewards to claim. Turn on 🧠 Neural Node to start earning!")
		}

		var msg string
		if lang == "ru" {
			msg = fmt.Sprintf("✅ <b>Награда получена!</b>\n\n"+
				"💰 Зачислено: <b>%.4f GSTD</b>\n"+
				"🏆 В Золотой Резерв: <b>%.4f GSTD</b> (10%%)\n"+
				"🔥 Сожжено: <b>%.4f GSTD</b> (5%%)\n\n"+
				"<i>GSTD добавлены к балансу. Используй для ⚡ Pro!</i>",
				result.ClaimedNet, result.GoldReserve, result.Burned)
		} else {
			msg = fmt.Sprintf("✅ <b>Reward Claimed!</b>\n\n"+
				"💰 Received: <b>%.4f GSTD</b>\n"+
				"🏆 Gold Reserve: <b>%.4f GSTD</b> (10%%)\n"+
				"🔥 Burned: <b>%.4f GSTD</b> (5%%)\n\n"+
				"<i>GSTD added to your balance. Use for ⚡ Pro!</i>",
				result.ClaimedNet, result.GoldReserve, result.Burned)
		}
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	// 3. Buy Stars callbacks: buy_stars_10, buy_stars_50, buy_stars_200
	if strings.HasPrefix(data, "buy_stars_") {
		_ = s.answerCallbackQuery(ctx, cq.ID, "")
		amountStr := strings.TrimPrefix(data, "buy_stars_")
		starsAmount := 10
		fmt.Sscanf(amountStr, "%d", &starsAmount)
		if starsAmount <= 0 {
			starsAmount = 10
		}

		const starUSD = 0.013
		var gstdPrice float64
		if s.db != nil {
			_ = s.db.QueryRow(`SELECT COALESCE(gstd_price_usd_at_set, 0) FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1`).Scan(&gstdPrice)
		}
		if gstdPrice <= 0 {
			gstdPrice = 0.00028
		}
		gstdPerStar := starUSD / gstdPrice
		gstdAmount := int(float64(starsAmount) * gstdPerStar)
		proReqs := gstdAmount / 3

		title := fmt.Sprintf("%d GSTD (%d Pro requests)", gstdAmount, proReqs)
		desc := fmt.Sprintf("%d⭐ = $%.2f = %d GSTD", starsAmount, float64(starsAmount)*starUSD, gstdAmount)
		if lang == "ru" {
			title = fmt.Sprintf("%d GSTD (%d Pro запросов)", gstdAmount, proReqs)
			desc = fmt.Sprintf("%d⭐ = $%.2f = %d GSTD", starsAmount, float64(starsAmount)*starUSD, gstdAmount)
		}

		payload := fmt.Sprintf("gstd_purchase_%s_%d", senderIDStr, time.Now().UnixMilli())
		return s.sendInvoiceWithStars(ctx, chatID, title, desc, payload, starsAmount)
	}

	// 4. Admin Callbacks
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
	lang := botLang(upd.Message.From.LanguageCode)

	// ── Calculate GSTD amount using real market price ──
	const starUSD = 0.013
	var gstdPrice float64
	if s.db != nil {
		_ = s.db.QueryRow(`SELECT COALESCE(gstd_price_usd_at_set, 0) FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1`).Scan(&gstdPrice)
	}
	if gstdPrice <= 0 {
		gstdPrice = 0.00028
	}
	gstdPerStar := starUSD / gstdPrice
	gstdCredited := float64(int(float64(sp.TotalAmount) * gstdPerStar))

	// ── Resolve wallet: linked TON wallet first, fallback to tg-{id} ──
	walletAddr := fmt.Sprintf("tg-%d", tgID)
	if s.db != nil {
		var linkedWallet string
		err := s.db.QueryRowContext(ctx,
			`SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL`,
			tgID,
		).Scan(&linkedWallet)
		if err == nil && linkedWallet != "" && !strings.HasPrefix(linkedWallet, "tg-") {
			walletAddr = linkedWallet
		}
	}

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

				// Notify the Global Channel
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
		_, _ = s.db.ExecContext(ctx, `INSERT INTO users (wallet_address, balance, gstd_balance, created_at, updated_at) VALUES ($1, 0, 0, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, walletAddr)

		// Insert purchase record & add balance
		tx, err := s.db.BeginTx(ctx, nil)
		if err == nil {
			var insertedID int64
			err = tx.QueryRowContext(ctx, `
				INSERT INTO stars_purchases (telegram_payment_charge_id, telegram_id, stars_amount, gstd_credited, wallet_address, created_at)
				VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (telegram_payment_charge_id) DO NOTHING RETURNING id
			`, sp.TelegramPaymentChargeID, tgID, sp.TotalAmount, gstdCredited, walletAddr).Scan(&insertedID)

			if err != sql.ErrNoRows && err == nil {
				_, _ = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1 WHERE wallet_address = $2`, gstdCredited, walletAddr)
			}
			_ = tx.Commit()
		}
	}

	// Build confirmation message
	shortWallet := walletAddr
	if len(walletAddr) > 12 {
		shortWallet = walletAddr[:6] + "..." + walletAddr[len(walletAddr)-4:]
	}

	var msg string
	if lang == "ru" {
		msg = fmt.Sprintf("✅ <b>Оплата успешна!</b>\n\n⭐ %d Stars → <b>%.0f GSTD</b> зачислено\n💼 Кошелёк: <code>%s</code>", sp.TotalAmount, gstdCredited, shortWallet)
		if strings.HasPrefix(walletAddr, "tg-") {
			msg += "\n\n⚠️ <i>Привяжите TON-кошелёк кнопкой 🔗 Кошелек для вывода GSTD.</i>"
		}
	} else {
		msg = fmt.Sprintf("✅ <b>Payment Successful!</b>\n\n⭐ %d Stars → <b>%.0f GSTD</b> credited\n💼 Wallet: <code>%s</code>", sp.TotalAmount, gstdCredited, shortWallet)
		if strings.HasPrefix(walletAddr, "tg-") {
			msg += "\n\n⚠️ <i>Link your TON wallet via 🔗 Wallet button to withdraw GSTD.</i>"
		}
	}
	if taskIDLaunched != "" {
		if lang == "ru" {
			msg += fmt.Sprintf("\n\n🚀 <b>Анализ сигнала %s успешно запущен!</b>", taskIDLaunched)
		} else {
			msg += fmt.Sprintf("\n\n🚀 <b>Signal task %s has been launched automatically!</b>", taskIDLaunched)
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

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE QUERY — Viral AI in any Telegram chat
//
// When a user types "@GSTDBot <query>" in ANY chat (group/private/channel comments),
// Telegram sends an inline_query. We route through L1 Cache / L2.7 Groq for
// instant response, then the user taps the result → message appears in chat
// with GSTD branding. Every message = free organic advertisement.
// ═══════════════════════════════════════════════════════════════════════════════

// handleInlineQuery processes inline queries from Telegram.
func (s *TelegramService) handleInlineQuery(ctx context.Context, iq *telegramInlineQuery) error {
	query := strings.TrimSpace(iq.Query)

	// Ignore short queries to prevent API spam
	if len(query) < 3 {
		// Show a helpful placeholder
		return s.answerInlineQuery(ctx, iq.ID, []map[string]interface{}{
			{
				"type":        "article",
				"id":          "hint",
				"title":       "✨ Напишите вопрос (от 3 символов)",
				"description": "Пример: @GSTDBot расскажи шутку про программистов",
				"input_message_content": map[string]interface{}{
					"message_text": "🧠 <b>GSTD Swarm AI</b> — Суверенный ИИ нового поколения\n\n⚡ Используй: <code>@GSTDBot твой вопрос</code> в любом чате\n\n🔗 Подключи Нейро-Узел: @GSTDBot",
					"parse_mode":   "HTML",
				},
				"thumbnail_url": "https://app.gstdtoken.com/icon-512x512.png",
			},
		}, 300)
	}

	lang := "en"
	if iq.From != nil {
		lang = botLang(iq.From.LanguageCode)
	}

	// ── Generate AI Response (Speed Priority: L1 Cache → L2.7 Groq → L2.5 HF) ──
	var aiResponse string
	var modelUsed string
	var tier int

	if s.smartRouter != nil {
		chatReq := &OmegaChatRequest{
			Model: "omega-auto", // SmartRouter will pick L1/L2.7/L2.5
			Messages: []map[string]interface{}{
				{
					"role":    "system",
					"content": "You are GSTD Swarm AI. Answer in the same language as the question. Be concise, witty, and accurate. Max 3-4 sentences. Add relevant emoji.",
				},
				{
					"role":    "user",
					"content": query,
				},
			},
			Temperature: 0.8,
			MaxTokens:   256, // Short for speed
			Stream:      false,
		}

		decision, err := s.smartRouter.Route(ctx, chatReq)
		if err == nil && decision != nil && decision.Response != "" {
			aiResponse = decision.Response
			modelUsed = decision.ActualModel
			tier = decision.Tier
		} else {
			log.Printf("[InlineQuery] SmartRouter error: %v", err)
		}
	}

	// Fallback if SmartRouter unavailable or failed
	if aiResponse == "" {
		// Try calling bot AI endpoint as fallback
		aiResponse = s.inlineQueryFallback(ctx, query)
		modelUsed = "fallback"
		tier = 0
	}

	if aiResponse == "" {
		aiResponse = "🤔 Рой обдумывает ваш запрос... Попробуйте через пару секунд!"
	}

	// ── Format the viral message ──
	// Truncate AI response for Telegram inline preview
	previewTitle := aiResponse
	if len(previewTitle) > 80 {
		// Find last space before 80 chars for clean truncation
		cut := 77
		for cut > 0 && previewTitle[cut] != ' ' {
			cut--
		}
		if cut == 0 {
			cut = 77
		}
		previewTitle = previewTitle[:cut] + "..."
	}

	// The message that will be sent to the chat when user taps the result
	tierEmoji := "🛡️"
	tierLabel := "Sovereign Swarm"
	switch tier {
	case 1:
		tierEmoji = "⚡"
		tierLabel = "Cache"
	case 2:
		tierEmoji = "🛡️"
		tierLabel = "Sovereign Swarm"
	case 3:
		tierEmoji = "🔐"
		tierLabel = "Cocoon TEE"
	case 4:
		tierEmoji = "☁️"
		tierLabel = "Cloud"
	}

	// ── Build the full message (viral format) ──
	var messageText string
	if lang == "ru" {
		messageText = fmt.Sprintf(
			"🤖 <b>Запрос:</b> %s\n\n"+
				"⚡ <b>Ответ GSTD AI:</b>\n%s\n\n"+
				"━━━━━━━━━━━━━━━━━━━\n"+
				"%s <i>%s</i> · <code>%s</code>\n"+
				"🧠 <b>Рой ИИ:</b> <a href=\"https://t.me/GstdAppBot\">@GstdAppBot</a> — Попробуй сам!",
			escapeHTML(query), escapeHTML(aiResponse), tierEmoji, tierLabel, modelUsed,
		)
	} else {
		messageText = fmt.Sprintf(
			"🤖 <b>Query:</b> %s\n\n"+
				"⚡ <b>GSTD AI:</b>\n%s\n\n"+
				"━━━━━━━━━━━━━━━━━━━\n"+
				"%s <i>%s</i> · <code>%s</code>\n"+
				"🧠 <b>AI Swarm:</b> <a href=\"https://t.me/GstdAppBot\">@GstdAppBot</a> — Try it yourself!",
			escapeHTML(query), escapeHTML(aiResponse), tierEmoji, tierLabel, modelUsed,
		)
	}

	descriptionText := aiResponse
	if len(descriptionText) > 150 {
		descriptionText = descriptionText[:147] + "..."
	}

	results := []map[string]interface{}{
		{
			"type":        "article",
			"id":          fmt.Sprintf("ai-%d", time.Now().UnixNano()),
			"title":       "⚡ " + previewTitle,
			"description": descriptionText,
			"input_message_content": map[string]interface{}{
				"message_text":             messageText,
				"parse_mode":               "HTML",
				"disable_web_page_preview": true,
			},
			"thumbnail_url": "https://app.gstdtoken.com/icon-512x512.png",
			"reply_markup": map[string]interface{}{
				"inline_keyboard": [][]map[string]interface{}{
					{
						{"text": "🧠 Открой AI-рой", "url": "https://t.me/GstdAppBot"},
						{"text": "🌍 Монитор", "url": "https://monitor.gstdtoken.com"},
					},
				},
			},
		},
	}

	log.Printf("[InlineQuery] user=%d query=%q model=%s tier=%d len=%d",
		iq.From.ID, query, modelUsed, tier, len(aiResponse))

	return s.answerInlineQuery(ctx, iq.ID, results, 30) // Cache for 30s
}

// inlineQueryFallback tries to get AI response via the bot API endpoint.
func (s *TelegramService) inlineQueryFallback(ctx context.Context, query string) string {
	base := s.apiBaseURL
	token := os.Getenv("BOT_API_TOKEN")
	if token == "" {
		token = s.botToken
	}

	body, _ := json.Marshal(map[string]interface{}{
		"telegram_id": "0",
		"text":        query,
	})
	req, _ := http.NewRequestWithContext(ctx, "POST", base+"/api/v1/telegram/bot/ai", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Bot-Token", token)

	resp, err := s.client.Do(req)
	if err != nil {
		return ""
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
			return r.Choices[0].Message.Content
		}
	}
	return ""
}

// answerInlineQuery sends results back to Telegram for an inline query.
func (s *TelegramService) answerInlineQuery(ctx context.Context, queryID string, results []map[string]interface{}, cacheTime int) error {
	if s.botToken == "" {
		return nil
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/answerInlineQuery", s.botToken)

	payload := map[string]interface{}{
		"inline_query_id": queryID,
		"results":         results,
		"cache_time":      cacheTime,
		"is_personal":     true,
	}

	bodyData, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(bodyData))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("[InlineQuery] answerInlineQuery error: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		var errResp struct {
			OK          bool   `json:"ok"`
			Description string `json:"description"`
		}
		json.NewDecoder(resp.Body).Decode(&errResp)
		log.Printf("[InlineQuery] Telegram API error: %d %s", resp.StatusCode, errResp.Description)
	}

	return nil
}

// escapeHTML escapes HTML special characters for Telegram HTML parse mode.
func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}

// handleBalanceButton shows user's GSTD balance
func (s *TelegramService) handleBalanceButton(ctx context.Context, chatID, senderIDStr, lang string) error {
	if s.db == nil {
		return s.SendMessageToChat(ctx, chatID, "❌ Service unavailable")
	}
	tgID, _ := strconv.ParseInt(senderIDStr, 10, 64)
	if tgID == 0 {
		return nil
	}

	// Find wallet
	var wallet string
	_ = s.db.QueryRowContext(ctx,
		`SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL`,
		tgID,
	).Scan(&wallet)
	if wallet == "" {
		wallet = fmt.Sprintf("tg-%d", tgID)
	}

	var balance, pending float64
	_ = s.db.QueryRowContext(ctx,
		`SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0), COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1`,
		wallet,
	).Scan(&balance, &pending)

	proReqs := int(balance / 3.4) // SmartMix standard cost

	var msg string
	if lang == "ru" {
		msg = fmt.Sprintf("💎 <b>Мой Баланс</b>\n\n💰 <b>%.4f GSTD</b>\n⚡ Pro запросов: <b>%d</b>", balance, proReqs)
		if pending > 0 {
			msg += fmt.Sprintf("\n\n⏳ <b>Награда: %.4f GSTD</b>", pending)
		}
		msg += "\n\n<i>🆓 Бесплатная модель всегда доступна\n⚡ Pro = 3.4 GSTD/запрос</i>"
	} else {
		msg = fmt.Sprintf("💎 <b>My Balance</b>\n\n💰 <b>%.4f GSTD</b>\n⚡ Pro requests: <b>%d</b>", balance, proReqs)
		if pending > 0 {
			msg += fmt.Sprintf("\n\n⏳ <b>Mining reward: %.4f GSTD</b>", pending)
		}
		msg += "\n\n<i>🆓 Free model always available\n⚡ Pro = 3.4 GSTD/request</i>"
	}

	markup := ""
	if pending >= 0.01 {
		btnText := "🎁 Claim Reward"
		if lang == "ru" {
			btnText = "🎁 Забрать награду"
		}
		markup = fmt.Sprintf(`{"inline_keyboard":[[{"text":"%s","callback_data":"claim_reward"}]]}`, btnText)
	}

	return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
}

// handleTopUpButton shows Stars purchase tiers with inline keyboard
func (s *TelegramService) handleTopUpButton(ctx context.Context, chatID, senderIDStr, lang string) error {
	const starUSD = 0.013
	var gstdPrice float64
	if s.db != nil {
		_ = s.db.QueryRow(`SELECT COALESCE(gstd_price_usd_at_set, 0) FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1`).Scan(&gstdPrice)
	}
	if gstdPrice <= 0 {
		gstdPrice = 0.00028
	}
	gstdPerStar := starUSD / gstdPrice

	// Check wallet
	tgID, _ := strconv.ParseInt(senderIDStr, 10, 64)
	var walletStatus, hasWalletIcon string
	hasWallet := false
	if s.db != nil && tgID > 0 {
		var w string
		_ = s.db.QueryRowContext(ctx,
			`SELECT wallet_address FROM telegram_users WHERE telegram_id = $1 AND wallet_address IS NOT NULL`,
			tgID,
		).Scan(&w)
		if w != "" && !strings.HasPrefix(w, "tg-") {
			hasWallet = true
			shortW := w[:6] + "..." + w[len(w)-4:]
			if lang == "ru" {
				walletStatus = fmt.Sprintf("💼 <b>Кошелёк:</b> %s ✅", shortW)
			} else {
				walletStatus = fmt.Sprintf("💼 <b>Wallet:</b> %s ✅", shortW)
			}
			hasWalletIcon = " ✅"
		}
	}
	if !hasWallet {
		if lang == "ru" {
			walletStatus = "💼 <b>Кошелёк:</b> не привязан\n⚠️ <i>Привяжите кошелёк кнопкой 🔗 Кошелек, чтобы получать GSTD</i>"
		} else {
			walletStatus = "💼 <b>Wallet:</b> not linked\n⚠️ <i>Link wallet via 🔗 Wallet button to receive GSTD</i>"
		}
	}
	_ = hasWalletIcon

	type tier struct {
		stars int
		label string
	}
	tiers := []tier{{10, "Starter"}, {50, "Pro"}, {200, "Ultra"}}

	var tierLines []string
	for _, t := range tiers {
		gstd := int(float64(t.stars) * gstdPerStar)
		proReqs := gstd / 3 // approximate
		usd := fmt.Sprintf("%.2f", float64(t.stars)*starUSD)
		tierLines = append(tierLines, fmt.Sprintf("%d⭐ = <b>%d GSTD</b> = %d Pro ($%s)", t.stars, gstd, proReqs, usd))
	}

	var msg string
	if lang == "ru" {
		msg = fmt.Sprintf("⭐️ <b>Пополнить GSTD через Stars</b>\n\n%s\n\n📊 <b>Курс:</b> 1⭐ = %.0f GSTD ($%.3f)\n\n%s",
			walletStatus, gstdPerStar, starUSD, strings.Join(tierLines, "\n"))
	} else {
		msg = fmt.Sprintf("⭐️ <b>Top Up GSTD via Stars</b>\n\n%s\n\n📊 <b>Rate:</b> 1⭐ = %.0f GSTD ($%.3f)\n\n%s",
			walletStatus, gstdPerStar, starUSD, strings.Join(tierLines, "\n"))
	}

	// Build inline keyboard with buy buttons
	var btns []string
	for _, t := range tiers {
		gstd := int(float64(t.stars) * gstdPerStar)
		btns = append(btns, fmt.Sprintf(`{"text":"%d⭐ → %d GSTD","callback_data":"buy_stars_%d"}`, t.stars, gstd, t.stars))
	}
	markup := `{"inline_keyboard":[[` + strings.Join(btns, ",") + `]]`
	if !hasWallet {
		linkText := "🔗 Link Wallet"
		if lang == "ru" {
			linkText = "🔗 Привязать кошелёк"
		}
		markup += fmt.Sprintf(`,[{"text":"%s","callback_data":"public_connect"}]`, linkText)
	}
	markup += `}`

	return s.SendMessageToChatWithMarkup(ctx, chatID, msg, markup)
}
