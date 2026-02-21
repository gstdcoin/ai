package leviathan

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"time"
)

// TelegramNotifier sends insights to Architect's chat.
type TelegramNotifier struct {
	botToken string
	chatID   string
	client   *http.Client
	enabled  bool
}

// NewTelegramNotifier creates notifier. Disabled if token or chat empty.
func NewTelegramNotifier(botToken, chatID string) *TelegramNotifier {
	enabled := botToken != "" && chatID != ""
	if !enabled {
		log.Printf("[Leviathan] TelegramNotifier disabled (missing token or chat)")
	}
	return &TelegramNotifier{
		botToken: botToken,
		chatID:   chatID,
		client:   &http.Client{Timeout: 10 * time.Second},
		enabled:  enabled,
	}
}

// Send sends message to Architect. No-op if disabled.
func (t *TelegramNotifier) Send(ctx context.Context, text string) error {
	if !t.enabled {
		log.Printf("[Leviathan] (Telegram disabled) %s", truncate(text, 200))
		return nil
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", t.botToken)
	values := url.Values{}
	values.Set("chat_id", t.chatID)
	values.Set("text", text)
	values.Set("parse_mode", "HTML")
	req, err := http.NewRequestWithContext(ctx, "POST", apiURL+"?"+values.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := t.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram api: %d", resp.StatusCode)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
