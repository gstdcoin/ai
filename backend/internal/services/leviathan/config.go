package leviathan

import (
	"os"
	"strconv"
)

// Config holds Leviathan module configuration. All optional — module is disabled if LEVIATHAN_ENABLED != "true".
type Config struct {
	Enabled           bool
	DeltaTriggerPct   float64
	AlphaThresholdPct float64
	TelegramBotToken  string
	TelegramChatID    string
	ShadowDBPath      string
	GammaAPIBase      string
	GammaWSURL        string
	PollIntervalSec   int
	SourceWeightNews  float64
	SourceWeightTG    float64
	SourceWeightWhale float64
	LowAlphaPruneMin  int    // Data Distillation: delete low-alpha cache after N min (default 5)
	TruthVerifyHours  int    // Truth Verification: Gamma API check every N hours (default 6)
	GNewsAPIKey       string // Global Senses: NewsCheck (required for verdict)
	CryptoPanicAPIKey string // Global Senses: SentimentCheck on crypto markets
}

// LoadConfig loads config from environment.
func LoadConfig() *Config {
	enabled := os.Getenv("LEVIATHAN_ENABLED") == "true"
	cfg := &Config{
		Enabled:           enabled,
		DeltaTriggerPct:   3.0,
		AlphaThresholdPct: 15.0,
		ShadowDBPath:      getEnv("LEVIATHAN_SHADOW_DB", "./leviathan_shadow.db"),
		GammaAPIBase:      getEnv("LEVIATHAN_GAMMA_API", "https://gamma-api.polymarket.com"),
		GammaWSURL:        getEnv("LEVIATHAN_GAMMA_WS", "wss://gamma-api.polymarket.com/ws/"),
		PollIntervalSec:   60,
		SourceWeightNews:  0.4,
		SourceWeightTG:    0.8,
		SourceWeightWhale: 1.0,
		LowAlphaPruneMin:  5,
		TruthVerifyHours:  6,
	}
	if t := os.Getenv("LEVIATHAN_TELEGRAM_BOT_TOKEN"); t != "" {
		cfg.TelegramBotToken = t
	} else if t := os.Getenv("TELEGRAM_BOT_TOKEN"); t != "" {
		cfg.TelegramBotToken = t // Fallback to platform token
	}
	if c := os.Getenv("LEVIATHAN_TELEGRAM_CHAT_ID"); c != "" {
		cfg.TelegramChatID = c
	} else if c := os.Getenv("TELEGRAM_CHAT_ID"); c != "" {
		cfg.TelegramChatID = c // Fallback to platform chat
	}
	if d := os.Getenv("LEVIATHAN_DELTA_TRIGGER_PCT"); d != "" {
		if v, err := strconv.ParseFloat(d, 64); err == nil && v > 0 {
			cfg.DeltaTriggerPct = v
		}
	}
	if a := os.Getenv("LEVIATHAN_ALPHA_THRESHOLD_PCT"); a != "" {
		if v, err := strconv.ParseFloat(a, 64); err == nil && v > 0 {
			cfg.AlphaThresholdPct = v
		}
	}
	if p := os.Getenv("LEVIATHAN_LOW_ALPHA_PRUNE_MIN"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 {
			cfg.LowAlphaPruneMin = v
		}
	}
	if h := os.Getenv("LEVIATHAN_TRUTH_VERIFY_HOURS"); h != "" {
		if v, err := strconv.Atoi(h); err == nil && v > 0 {
			cfg.TruthVerifyHours = v
		}
	}
	if p := os.Getenv("LEVIATHAN_POLL_INTERVAL_SEC"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v >= 30 {
			cfg.PollIntervalSec = v
		}
	}
	if k := os.Getenv("LEVIATHAN_GNEWS_API_KEY"); k != "" {
		cfg.GNewsAPIKey = k
	}
	if k := os.Getenv("LEVIATHAN_CRYPTOPANIC_API_KEY"); k != "" {
		cfg.CryptoPanicAPIKey = k
	}
	return cfg
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
