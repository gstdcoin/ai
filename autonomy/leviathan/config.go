package leviathan

import (
	"os"
)

// Config holds Leviathan module configuration. All optional — module is disabled if LEVIATHAN_ENABLED != "true".
type Config struct {
	Enabled            bool
	DeltaTriggerPct    float64 // Wake analytics if price change > this % (default 3)
	AlphaThresholdPct   float64 // Log shadow bet if divergence > this % (default 15)
	TelegramBotToken   string
	TelegramChatID     string // Architect's chat for insights
	ShadowDBPath       string // SQLite path (default: ./leviathan_shadow.db)
	GammaAPIBase       string
	GammaWSURL         string
	PollIntervalSec    int
	SourceWeightNews   float64 // Official news (default 0.4)
	SourceWeightTG     float64 // Insider TG channels (default 0.8)
	SourceWeightWhale  float64 // Market whales (default 1.0)
}

// LoadConfig loads config from environment.
func LoadConfig() *Config {
	enabled := os.Getenv("LEVIATHAN_ENABLED") == "true"
	cfg := &Config{
		Enabled:          enabled,
		DeltaTriggerPct:  3.0,
		AlphaThresholdPct: 15.0,
		ShadowDBPath:     getEnv("LEVIATHAN_SHADOW_DB", "./leviathan_shadow.db"),
		GammaAPIBase:     getEnv("LEVIATHAN_GAMMA_API", "https://gamma-api.polymarket.com"),
		GammaWSURL:      getEnv("LEVIATHAN_GAMMA_WS", "wss://gamma-api.polymarket.com/ws/"),
		PollIntervalSec:  300, // 5 min batch, delta-trigger wakes earlier
		SourceWeightNews: 0.4,
		SourceWeightTG:   0.8,
		SourceWeightWhale: 1.0,
	}
	if t := os.Getenv("LEVIATHAN_TELEGRAM_BOT_TOKEN"); t != "" {
		cfg.TelegramBotToken = t
	}
	if c := os.Getenv("LEVIATHAN_TELEGRAM_CHAT_ID"); c != "" {
		cfg.TelegramChatID = c
	}
	if d := os.Getenv("LEVIATHAN_DELTA_TRIGGER_PCT"); d != "" {
		if v, err := parseFloat(d); err == nil && v > 0 {
			cfg.DeltaTriggerPct = v
		}
	}
	if a := os.Getenv("LEVIATHAN_ALPHA_THRESHOLD_PCT"); a != "" {
		if v, err := parseFloat(a); err == nil && v > 0 {
			cfg.AlphaThresholdPct = v
		}
	}
	return cfg
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
