package leviathan

import (
	"math"
)

// SentimentScope: placeholder for political/sentiment analysis.
// In production: integrate X/Telegram APIs, NLP. For now: heuristic-based.
type SentimentScope struct {
	Config *Config
}

// Analyze returns a Leviathan prediction (0..1) and logic string.
// Source weighting: news 0.4, TG 0.8, whale 1.0.
func (s *SentimentScope) Analyze(market MarketPrice, marketContext string) (leviathanPct float64, logic string) {
	// Simplified: use market price as base, apply small divergence based on sentiment
	// Real impl: fetch X/TG sentiment, bridge flows, etc.
	base := market.YesPct
	// If oneHourChange is significant, we might disagree (e.g. sentiment shift)
	adj := 0.0
	if market.OneHourChange != 0 {
		adj = math.Copysign(0.05, -market.OneHourChange) // Slight contrarian
	}
	leviathanPct = base + adj
	if leviathanPct < 0 {
		leviathanPct = 0
	}
	if leviathanPct > 1 {
		leviathanPct = 1
	}
	logic = "Market baseline + sentiment adjustment. "
	if marketContext != "" {
		logic += "Context: " + marketContext
	} else {
		logic += "No external context yet."
	}
	return leviathanPct, logic
}
