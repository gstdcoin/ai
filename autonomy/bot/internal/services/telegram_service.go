package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// TelegramService handles sending notifications via Telegram Bot API
type TelegramService struct {
	botToken  string
	chatID    string
	apiURL    string
	httpClient *http.Client
	enabled   bool
}

// NewTelegramService creates a new Telegram service
// If botToken or chatID is empty, the service will be disabled (no errors, just silent)
func NewTelegramService(botToken, chatID string) *TelegramService {
	enabled := botToken != "" && chatID != ""
	if !enabled {
		log.Println("⚠️  Telegram notifications disabled (missing bot token or chat ID)")
	}

	return &TelegramService{
		botToken: botToken,
		chatID:   chatID,
		apiURL:   "https://api.telegram.org/bot",
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		enabled: enabled,
	}
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

	return nil
}

// NotifyNewTask sends a notification about a new task
func (s *TelegramService) NotifyNewTask(ctx context.Context, taskID, taskType, requester string, rewardTON float64) error {
	message := fmt.Sprintf(
		"🆕 <b>Новая задача создана</b>\n\n"+
			"📋 <b>Тип:</b> %s\n"+
			"🆔 <b>ID:</b> <code>%s</code>\n"+
			"👤 <b>Создатель:</b> <code>%s</code>\n"+
			"💰 <b>Награда:</b> %.6f TON\n"+
			"⏰ <b>Время:</b> %s",
		taskType,
		taskID,
		requester,
		rewardTON,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	return s.SendMessage(ctx, message)
}

// NotifyTaskCompleted sends a notification about a completed task
func (s *TelegramService) NotifyTaskCompleted(ctx context.Context, taskID, taskType, executor string, rewardTON float64) error {
	message := fmt.Sprintf(
		"✅ <b>Задача выполнена</b>\n\n"+
			"📋 <b>Тип:</b> %s\n"+
			"🆔 <b>ID:</b> <code>%s</code>\n"+
			"👷 <b>Исполнитель:</b> <code>%s</code>\n"+
			"💰 <b>Награда:</b> %.6f TON\n"+
			"⏰ <b>Время:</b> %s",
		taskType,
		taskID,
		executor,
		rewardTON,
		time.Now().Format("2006-01-02 15:04:05"),
	)

	return s.SendMessage(ctx, message)
}

// NotifyPayoutReport sends a daily payout report to the admin
func (s *TelegramService) NotifyPayoutReport(ctx context.Context, workersCount int, totalAmount float64, manifestHash string, tonConnectURL string) error {
	message := fmt.Sprintf(
		"📊 <b>Отчет по выплатам готов</b>\n\n"+
			"👥 <b>Воркеров:</b> %d\n"+
			"💰 <b>Сумма:</b> %.2f GSTD\n"+
			"🔒 <b>Хэш отчета:</b> <code>%s</code>\n\n"+
			"Перейдите по ссылке ниже, чтобы подтвердить транзакцию через свой Admin Wallet.",
		workersCount,
		totalAmount,
		manifestHash,
	)

	// Create an inline keyboard with the TonConnect link
	payload := map[string]interface{}{
		"chat_id":    s.chatID,
		"text":       message,
		"parse_mode": "HTML",
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]interface{}{
				{
					{
						"text": "🔗 Подписать в TonConnect",
						"url":  tonConnectURL,
					},
				},
			},
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal telegram payload: %w", err)
	}

	url := fmt.Sprintf("%s%s/sendMessage", s.apiURL, s.botToken)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create telegram request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send telegram report: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned status %d", resp.StatusCode)
	}

	return nil
}

// IsEnabled returns whether the Telegram service is enabled
func (s *TelegramService) IsEnabled() bool {
	return s.enabled
}
