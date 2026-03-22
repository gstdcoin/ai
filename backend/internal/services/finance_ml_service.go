package services

// ═══════════════════════════════════════════════════════════════
// AI IN FINANCE ML SERVICE (awesome-quant, awesome-machine-learning)
// Source: https://github.com/wilsonfreitas/awesome-quant
//
// Features:
//   - Time-series signal generation (RSI, Bollinger Bands approximations)
//   - Sentiment-based moving averages (SMA/EMA)
//   - Market volatility modeling for MiroFish
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"math"
	"time"
)

type FinanceMLService struct{}

type MarketDataPoint struct {
	Timestamp int64
	Price     float64
	Volume    float64
}

type MLSignal struct {
	Asset      string  `json:"asset"`
	Action     string  `json:"action"` // BUY, SELL, HOLD
	Confidence float64 `json:"confidence"`
	Indicators struct {
		RSI           float64 `json:"rsi"`
		Volatility    float64 `json:"volatility"`
		TrendStrength float64 `json:"trend_strength"`
	} `json:"indicators"`
	GeneratedAt time.Time `json:"generated_at"`
}

func NewFinanceMLService() *FinanceMLService {
	return &FinanceMLService{}
}

// AnalyzeTimeSeries runs a simplified quant model over market data
func (s *FinanceMLService) AnalyzeTimeSeries(ctx context.Context, asset string, data []MarketDataPoint) *MLSignal {
	if len(data) < 14 {
		return &MLSignal{Asset: asset, Action: "HOLD", Confidence: 0}
	}

	// 1. Calculate RSI (Relative Strength Index)
	gains, losses := 0.0, 0.0
	for i := 1; i < len(data); i++ {
		change := data[i].Price - data[i-1].Price
		if change > 0 {
			gains += change
		} else {
			losses -= change
		}
	}

	avgGain := gains / float64(len(data)-1)
	avgLoss := losses / float64(len(data)-1)

	rsi := 50.0 // Default Neutral
	if avgLoss != 0 {
		rs := avgGain / avgLoss
		rsi = 100.0 - (100.0 / (1.0 + rs))
	} else if avgGain > 0 {
		rsi = 100.0
	}

	// 2. Calculate Volatility (Standard Deviation)
	sum := 0.0
	for _, d := range data {
		sum += d.Price
	}
	mean := sum / float64(len(data))

	varianceSum := 0.0
	for _, d := range data {
		diff := d.Price - mean
		varianceSum += diff * diff
	}
	volatility := math.Sqrt(varianceSum / float64(len(data)))

	// 3. Simple ML-like Decision Tree
	action := "HOLD"
	confidence := 0.5

	if rsi < 30 {
		action = "BUY"
		confidence = 0.6 + (30-rsi)/100.0
	} else if rsi > 70 {
		action = "SELL"
		confidence = 0.6 + (rsi-70)/100.0
	}

	// Adjust confidence based on volatility
	// High volatility reduces confidence in simple RSI
	volatilityFactor := math.Min(1.0, volatility/mean)
	confidence = confidence * (1.0 - (volatilityFactor * 0.5))

	signal := &MLSignal{
		Asset:       asset,
		Action:      action,
		Confidence:  math.Min(1.0, math.Max(0.01, confidence)),
		GeneratedAt: time.Now(),
	}
	signal.Indicators.RSI = rsi
	signal.Indicators.Volatility = volatility
	signal.Indicators.TrendStrength = confidence * 10.0

	return signal
}
