package models

import (
	"time"
)

// Device represents a computing device (worker) in the system
type Device struct {
	DeviceID              string    `json:"device_id" db:"device_id"`
	WalletAddress         string    `json:"wallet_address" db:"wallet_address"`
	DeviceType            string    `json:"device_type" db:"device_type"`
	Reputation            float64   `json:"reputation" db:"reputation"`
	TotalTasks            int       `json:"total_tasks" db:"total_tasks"`
	SuccessfulTasks       int       `json:"successful_tasks" db:"successful_tasks"`
	FailedTasks           int       `json:"failed_tasks" db:"failed_tasks"`
	TotalEnergyConsumed   int       `json:"total_energy_consumed" db:"total_energy_consumed"`
	AverageResponseTimeMs int       `json:"average_response_time_ms" db:"average_response_time_ms"`
	CachedModels          []string  `json:"cached_models,omitempty" db:"cached_models"`
	LastSeenAt            time.Time `json:"last_seen_at" db:"last_seen_at"`
	IsActive              bool      `json:"is_active" db:"is_active"`
	SlashingCount         int       `json:"slashing_count" db:"slashing_count"`
	
	// Enterprise features (from v2_enterprise_updates migration)
	TrustScore            *float64  `json:"trust_score,omitempty" db:"trust_score"`
	Region                *string   `json:"region,omitempty" db:"region"`
	LatencyFingerprint    *int      `json:"latency_fingerprint,omitempty" db:"latency_fingerprint"`
	
	// Global layer features (from v3_global_layer migration)
	AccuracyScore         *float64  `json:"accuracy_score,omitempty" db:"accuracy_score"`
	LatencyScore          *float64  `json:"latency_score,omitempty" db:"latency_score"`
	StabilityScore        *float64  `json:"stability_score,omitempty" db:"stability_score"`
	LastReputationUpdate  *time.Time `json:"last_reputation_update,omitempty" db:"last_reputation_update"`
}
