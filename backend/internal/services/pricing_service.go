package services

import (
	"context"
	"database/sql"
	"math"
)

type PricingService struct {
	db *sql.DB
}

func NewPricingService(db *sql.DB) *PricingService {
	return &PricingService{db: db}
}

// CalculateSuggestedBudget calculates the recommended budget based on network pressure
func (s *PricingService) CalculateSuggestedBudget(ctx context.Context, taskType string) (float64, error) {
	// 1. Get count of active nodes
	var activeNodes int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'").Scan(&activeNodes)
	if err != nil {
		activeNodes = 1 // Fallback
	}

	// 2. Get count of pending tasks
	var pendingTasks int
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'pending'").Scan(&pendingTasks)
	if err != nil {
		pendingTasks = 0
	}

	// 3. Base price for task type
	basePrice := 0.1 // Default 0.1 GSTD
	switch taskType {
	case "image-generation":
		basePrice = 0.5
	case "text-processing":
		basePrice = 0.05
	case "openclaw-control":
		basePrice = 1.0
	}

	// 4. Pressure Factor (Demand/Supply)
	// If more tasks than nodes, price increases exponentially
	pressure := float64(pendingTasks+1) / float64(activeNodes+1)
	
	// Analogy to Gas Fees: Multiplier = base + log2(1 + pressure)
	multiplier := 1.0 + math.Log2(1.0+pressure)
	
	suggested := basePrice * multiplier

	return suggested, nil
}
