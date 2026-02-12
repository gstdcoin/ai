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
	if s.botToken == "" {
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.botToken)
	values := url.Values{}
	values.Set("chat_id", chatID)
	values.Set("text", message)
	values.Set("parse_mode", "HTML")

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
	Message *struct {
		MessageID int64 `json:"message_id"`
		From      *struct {
			ID        int64  `json:"id"`
			FirstName string `json:"first_name"`
			Username  string `json:"username"`
		} `json:"from"`
		Chat struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}

// ProcessWebhook handles incoming Telegram webhook payloads.
// Commands: /start (public), /status, /balance (admin only, require TELEGRAM_CHAT_ID).
func (s *TelegramService) ProcessWebhook(ctx context.Context, body []byte) error {
	if s.botToken == "" {
		return nil
	}
	var upd telegramUpdate
	if err := json.Unmarshal(body, &upd); err != nil || upd.Message == nil {
		return nil
	}
	chatID := strconv.FormatInt(upd.Message.Chat.ID, 10)
	text := strings.TrimSpace(upd.Message.Text)
	senderID := upd.Message.From
	var senderIDStr string
	if senderID != nil {
		senderIDStr = strconv.FormatInt(senderID.ID, 10)
	}

	// /start — public welcome
	if text == "/start" {
		msg := `👋 <b>GSTD Sovereign Grid</b>

<b>Команды:</b>
/start — это сообщение
/status — статус сервера (только админ)
/balance — баланс и пользователи (только админ)

📱 <a href="https://app.gstdtoken.com">Открыть Dashboard</a>`
		return s.SendMessageToChat(ctx, chatID, msg)
	}

	// /status и /balance — только для админа
	if text == "/status" || text == "/balance" {
		if s.chatID == "" || senderIDStr != s.chatID {
			_ = s.SendMessageToChat(ctx, chatID, "⛔ Доступ только для администратора.")
			return nil
		}
	}

	// /status — данные из /api/v1/health
	if text == "/status" {
		health, err := s.fetchHealth(ctx)
		if err != nil {
			return s.SendMessageToChat(ctx, chatID, "❌ Ошибка: "+err.Error())
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

	// /balance — баланс и пользователи
	if text == "/balance" {
		health, err := s.fetchHealth(ctx)
		if err != nil {
			return s.SendMessageToChat(ctx, chatID, "❌ Ошибка: "+err.Error())
		}
		var totalUsers int
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&totalUsers)
		contractTON := "—"
		if c, ok := health["contract"].(map[string]interface{}); ok {
			if b, ok := c["balance_ton"].(float64); ok {
				contractTON = fmt.Sprintf("%.4f TON", b)
			}
		}
		msg := fmt.Sprintf(`💰 <b>GSTD Balance</b>

<b>Contract (Escrow):</b> %s
<b>Пользователей:</b> %d

📱 <a href="https://app.gstdtoken.com">Dashboard</a>`,
			contractTON, totalUsers)
		return s.SendMessageToChat(ctx, chatID, msg)
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

