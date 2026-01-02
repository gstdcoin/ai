package services

import (
	"context"
	"database/sql"
	"math"
)

// PhysicsService implements GSTD v5.0 Network Physics
type PhysicsService struct {
	db *sql.DB
}

func NewPhysicsService(db *sql.DB) *PhysicsService {
	return &PhysicsService{db: db}
}

// CalculateNetworkPhysics derives T, P, and ∇E
func (s *PhysicsService) GetCurrentState(ctx context.Context) (T, P, GradE float64) {
	// Temperature (T) = Global Entropy
	s.db.QueryRowContext(ctx, "SELECT AVG(entropy_score) FROM operation_entropy").Scan(&T)
	
	// Pressure (P) = Tasks / Active Nodes
	var tasks, nodes int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'pending'").Scan(&tasks)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices WHERE last_seen_at > NOW() - INTERVAL '5 minutes'").Scan(&nodes)
	
	if nodes > 0 {
		P = float64(tasks) / float64(nodes)
	}

	return T, P, 0.01 // Simplified Gradient for MVP
}

// CertaintyToGravely converts required certainty into gravitational force
func (s *PhysicsService) CertaintyToGravity(certainty float64, gstdBalance float64) float64 {
	// The higher the certainty required, the more GSTD "weight" is needed
	// Gravity = Certainty / (1 + ln(1 + G/K))
	return certainty / (1.0 + math.Log1p(gstdBalance/10000.0))
}

