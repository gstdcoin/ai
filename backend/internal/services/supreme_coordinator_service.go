package services

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"sync"
	"time"
)

// Supreme Coordinator Protocol:
// 1. Performance-Based Pruning: predictive models with no requests in 48h → lower rank, free mobile shards
// 2. Golden Incentive Alignment: top capability_score in category → +10% compute_units
// 3. Integrity Cross-Check: LoRA compatibility with Predictive models (in FederatedEngine)

const (
	pruningIdleThreshold = 48 * time.Hour
	pruningInterval      = 1 * time.Hour
	goldenBonusPct       = 0.10 // +10% compute_units for top models
)

// SupremeCoordinatorService orchestrates Performance-Based Pruning and Golden Incentive
type SupremeCoordinatorService struct {
	db *sql.DB
	mu sync.RWMutex
}

// NewSupremeCoordinatorService creates the coordinator
func NewSupremeCoordinatorService(db *sql.DB) *SupremeCoordinatorService {
	s := &SupremeCoordinatorService{db: db}
	s.ensureSchema()
	return s
}

func (s *SupremeCoordinatorService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, _ = s.db.Exec(`
		ALTER TABLE universal_mesh_routing ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMP;
		ALTER TABLE universal_mesh_routing ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual';
	`)
}

// RecordModelRequest updates last_request_at when a model is used for inference
func (s *SupremeCoordinatorService) RecordModelRequest(ctx context.Context, modelID string) {
	if s.db == nil {
		return
	}
	norm := strings.ToLower(strings.TrimSpace(modelID))
	_, _ = s.db.ExecContext(ctx, `
		UPDATE universal_mesh_routing SET last_request_at = NOW(), updated_at = NOW() WHERE model_id = $1
	`, norm)
}

// RunPruningLoop: Performance-Based Pruning — lower rank, free mobile shards for idle predictive models
func (s *SupremeCoordinatorService) RunPruningLoop(ctx context.Context) {
	if s.db == nil {
		return
	}
	log.Printf("[Supreme Coordinator] Performance-Based Pruning ACTIVE (48h idle threshold)")
	ticker := time.NewTicker(pruningInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.pruneIdlePredictiveModels(ctx)
		}
	}
}

func (s *SupremeCoordinatorService) pruneIdlePredictiveModels(ctx context.Context) {
	cutoff := time.Now().Add(-pruningIdleThreshold)
	res, err := s.db.ExecContext(ctx, `
		UPDATE universal_mesh_routing
		SET rank = rank + 100, platform_preference = 'server', updated_at = NOW()
		WHERE source = 'predictive'
		  AND (last_request_at IS NULL OR last_request_at < $1)
		  AND platform_preference != 'server'
	`, cutoff)
	if err != nil {
		log.Printf("[Supreme Coordinator] Pruning error: %v", err)
		return
	}
	rows, _ := res.RowsAffected()
	if rows > 0 {
		log.Printf("[Supreme Coordinator] Pruned %d idle predictive models (rank+100, mobile→server)", rows)
	}
}

// IsGoldenModel returns true if model has highest capability_score in its platform category
// Golden Incentive Alignment: +10% compute_units for workers
func (s *SupremeCoordinatorService) IsGoldenModel(ctx context.Context, modelID string) bool {
	if s.db == nil {
		return false
	}
	norm := strings.ToLower(strings.TrimSpace(modelID))
	var platform string
	var score float64
	err := s.db.QueryRowContext(ctx, `
		SELECT platform_preference, capability_score FROM universal_mesh_routing WHERE model_id = $1
	`, norm).Scan(&platform, &score)
	if err != nil {
		return false
	}
	// Check if this model has max score in its category
	var maxScore sql.NullFloat64
	err = s.db.QueryRowContext(ctx, `
		SELECT MAX(capability_score) FROM universal_mesh_routing WHERE platform_preference = $1
	`, platform).Scan(&maxScore)
	if err != nil || !maxScore.Valid {
		return false
	}
	return score >= maxScore.Float64-0.001 // float tolerance
}

// GoldenBonusMultiplier returns 1.10 for golden models, 1.0 otherwise
func (s *SupremeCoordinatorService) GoldenBonusMultiplier(ctx context.Context, modelID string) float64 {
	if s.IsGoldenModel(ctx, modelID) {
		return 1.0 + goldenBonusPct
	}
	return 1.0
}

// IsPredictiveModelCompatible checks if LoRA update targets a model in routing (Integrity Cross-Check)
// Reject updates for models not in universal_mesh_routing or federated_model_targets
func (s *SupremeCoordinatorService) IsPredictiveModelCompatible(ctx context.Context, modelName string) bool {
	if s.db == nil {
		return true
	}
	norm := strings.ToLower(strings.TrimSpace(modelName))
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM universal_mesh_routing WHERE model_id = $1`, norm).Scan(&n); err == nil {
		return true
	}
	if err := s.db.QueryRowContext(ctx, `SELECT 1 FROM federated_model_targets WHERE model_name = $1 AND status = 'active'`, modelName).Scan(&n); err == nil {
		return true
	}
	return false
}
