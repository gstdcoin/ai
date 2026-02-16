package leviathan

import (
	"math"
)

// SentimentScope: placeholder for political/sentiment analysis.
type SentimentScope struct {
	Config *Config
}

// Analyze returns a Leviathan prediction (0..1) and logic string.
func (s *SentimentScope) Analyze(market MarketPrice, marketContext string) (leviathanPct float64, logic string) {
	base := market.YesPct
	adj := 0.0
	if market.OneHourChange != 0 {
		adj = math.Copysign(0.05, -market.OneHourChange)
	}
	leviathanPct = base + adj
	if leviathanPct < 0 {
		leviathanPct = 0
	}
	if leviathanPct > 1 {
		leviathanPct = 1
	}
	if marketContext != "" {
		// Global Senses: Context must contain specific link to external factor
		logic = marketContext
	} else {
		logic = "Market baseline + sentiment adjustment. No external context yet."
	}
	return leviathanPct, logic
}
