package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TelegramService provides lightweight integration with a Telegram bot
// for admin notifications. If BOT_TOKEN or CHAT_ID are not configured,
// it degrades gracefully to no‑op logging.
type TelegramService struct {
	botToken string
	chatID   string
	db       *sql.DB
	client   *http.Client
	enabled  bool
}

// NewTelegramService initializes the Telegram service.
// If botToken or chatID are empty, the service is disabled but
// the type is still valid (methods become no‑ops).
func NewTelegramService(botToken, chatID string, db *sql.DB) *TelegramService {
	enabled := botToken != "" && chatID != ""
	if !enabled {
		log.Printf("ℹ️  TelegramService disabled (missing BOT_TOKEN or CHAT_ID)")
	}

	return &TelegramService{
		botToken: botToken,
		chatID:   chatID,
		db:       db,
		enabled:  enabled,
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

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", s.botToken)
	values := url.Values{}
	values.Set("chat_id", s.chatID)
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

// ProcessWebhook handles incoming Telegram webhook payloads.
// For now it's a no-op; extend to parse commands and send responses.
func (s *TelegramService) ProcessWebhook(ctx context.Context, body []byte) error {
	if !s.enabled {
		return nil
	}
	// TODO: parse Update, handle /start, /status, etc.
	_ = body
	return nil
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

