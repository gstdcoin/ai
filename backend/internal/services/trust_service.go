package services

import (
	"context"
	"database/sql"
	"math"
)

// TrustService handles device reputation and adaptive redundancy
type TrustService struct {
	db *sql.DB
}

func NewTrustService(db *sql.DB) *TrustService {
	return &TrustService{db: db}
}

// CalculateRedundancy determines how many times a task should be executed
// Formula: P(v) = 1 - (Trust_device * Efficiency_requester)
func (s *TrustService) CalculateRedundancy(trustScore float64, efficiencyFactor float64) int {
	probValidation := 1.0 - (trustScore * efficiencyFactor)
	
	if probValidation < 0.2 { // Very high trust
		return 1
	} else if probValidation < 0.6 { // Medium trust
		return 2
	}
	return 3 // Low trust or critical task
}

// UpdateDeviceTrust updates device trust based on behavior
func (s *TrustService) UpdateDeviceTrust(ctx context.Context, deviceID string, success bool, latencyMs int) error {
	var currentTrust float64
	err := s.db.QueryRowContext(ctx, "SELECT trust_score FROM devices WHERE device_id = $1", deviceID).Scan(&currentTrust)
	if err != nil {
		return err
	}

	newTrust := currentTrust
	if success {
		// Linear growth, max 1.0
		newTrust = math.Min(1.0, currentTrust + 0.01)
	} else {
		// Aggressive penalty for failures
		newTrust = math.Max(0.0, currentTrust - 0.1)
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE devices 
		SET trust_score = $1, 
		    latency_fingerprint = $2,
		    last_seen_at = NOW() 
		WHERE device_id = $3
	`, newTrust, latencyMs, deviceID)
	
	return err
}

