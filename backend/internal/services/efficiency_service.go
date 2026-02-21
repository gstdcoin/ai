package services

import (
	"math"
)

// EfficiencyService calculates GSTD efficiency factor
type EfficiencyService struct {
	alpha float64 // Lower bound (0.30)
	k     float64 // Normalizing coefficient (10,000 GSTD)
}

// NewEfficiencyService creates a new efficiency service with default parameters
func NewEfficiencyService() *EfficiencyService {
	return &EfficiencyService{
		alpha: 0.30,      // Lower bound: 30% minimum efficiency
		k:     10000.0,   // Normalizing coefficient: 10,000 GSTD
	}
}

// CalculateEfficiency calculates the efficiency factor based on GSTD balance
// Formula: E(G) = α + (1 - α) / (1 + ln(1 + G / K))
// Where:
//   G = GSTD balance
//   α = 0.30 (lower bound)
//   K = 10,000 (normalizing coefficient)
func (s *EfficiencyService) CalculateEfficiency(gstdBalance float64) float64 {
	if gstdBalance <= 0 {
		// No GSTD = 100% cost (no discount)
		return 1.0
	}

	// Calculate: ln(1 + G / K)
	logTerm := math.Log(1.0 + gstdBalance/s.k)

	// Calculate: (1 - α) / (1 + ln(1 + G / K))
	numerator := 1.0 - s.alpha
	denominator := 1.0 + logTerm
	fraction := numerator / denominator

	// Final: α + fraction
	efficiency := s.alpha + fraction

	// Ensure efficiency is between alpha and 1.0
	if efficiency < s.alpha {
		efficiency = s.alpha
	}
	if efficiency > 1.0 {
		efficiency = 1.0
	}

	return efficiency
}

// CalculateTaskCost calculates the final task cost in TON based on base cost and GSTD balance
// finalCost = baseCost * efficiency
func (s *EfficiencyService) CalculateTaskCost(baseCostTON float64, gstdBalance float64) float64 {
	efficiency := s.CalculateEfficiency(gstdBalance)
	return baseCostTON * efficiency
}

// CalculatePriority calculates priority score
// Higher score = faster processing
// priorityScore = taskValueTON / efficiency
func (s *EfficiencyService) CalculatePriority(taskValueTON float64, gstdBalance float64) float64 {
	efficiency := s.CalculateEfficiency(gstdBalance)
	if efficiency <= 0 {
		return taskValueTON // Fallback if efficiency is invalid
	}
	return taskValueTON / efficiency
}

// GetEfficiencyBreakdown returns detailed efficiency information
type EfficiencyBreakdown struct {
	GSTDBalance    float64 `json:"gstd_balance"`
	Efficiency     float64 `json:"efficiency"`
	CostReduction  float64 `json:"cost_reduction_percent"` // How much cheaper (0-70%)
	FinalCostMultiplier float64 `json:"final_cost_multiplier"` // What to multiply base cost by
}

func (s *EfficiencyService) GetEfficiencyBreakdown(gstdBalance float64) EfficiencyBreakdown {
	efficiency := s.CalculateEfficiency(gstdBalance)
	costReduction := (1.0 - efficiency) * 100.0 // Convert to percentage

	return EfficiencyBreakdown{
		GSTDBalance:        gstdBalance,
		Efficiency:         efficiency,
		CostReduction:      costReduction,
		FinalCostMultiplier: efficiency,
	}
}

