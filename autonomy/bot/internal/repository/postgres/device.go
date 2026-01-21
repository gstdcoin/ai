package postgres

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/models"
	"time"
)

// DeviceRepository handles database operations for devices
type DeviceRepository struct {
	db *sql.DB
}

// NewDeviceRepository creates a new device repository
func NewDeviceRepository(db *sql.DB) *DeviceRepository {
	return &DeviceRepository{db: db}
}

// GetByID retrieves a device by its ID
func (r *DeviceRepository) GetByID(ctx context.Context, deviceID string) (*models.Device, error) {
	var device models.Device
	var lastSeenAt time.Time
	var cachedModels sql.NullString
	
	// Query all fields including last_seen_at and is_active
	err := r.db.QueryRowContext(ctx, `
		SELECT device_id, wallet_address, device_type, reputation,
		       total_tasks, successful_tasks, failed_tasks,
		       total_energy_consumed, average_response_time_ms,
		       cached_models, last_seen_at, is_active, slashing_count,
		       trust_score, region, latency_fingerprint,
		       accuracy_score, latency_score, stability_score, last_reputation_update
		FROM devices
		WHERE device_id = $1
	`, deviceID).Scan(
		&device.DeviceID,
		&device.WalletAddress,
		&device.DeviceType,
		&device.Reputation,
		&device.TotalTasks,
		&device.SuccessfulTasks,
		&device.FailedTasks,
		&device.TotalEnergyConsumed,
		&device.AverageResponseTimeMs,
		&cachedModels,
		&lastSeenAt,
		&device.IsActive,
		&device.SlashingCount,
		&device.TrustScore,
		&device.Region,
		&device.LatencyFingerprint,
		&device.AccuracyScore,
		&device.LatencyScore,
		&device.StabilityScore,
		&device.LastReputationUpdate,
	)
	
	if err != nil {
		return nil, err
	}
	
	device.LastSeenAt = lastSeenAt
	
	// Parse cached_models array if present
	if cachedModels.Valid && cachedModels.String != "" {
		// Simple parsing - in production, use proper array parsing
		// For now, we'll leave it as empty slice
		device.CachedModels = []string{}
	}
	
	return &device, nil
}

// GetByWalletAddress retrieves all devices for a wallet address
func (r *DeviceRepository) GetByWalletAddress(ctx context.Context, walletAddress string) ([]*models.Device, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT device_id, wallet_address, device_type, reputation,
		       total_tasks, successful_tasks, failed_tasks,
		       total_energy_consumed, average_response_time_ms,
		       cached_models, last_seen_at, is_active, slashing_count,
		       trust_score, region, latency_fingerprint,
		       accuracy_score, latency_score, stability_score, last_reputation_update
		FROM devices
		WHERE wallet_address = $1 AND is_active = true
		ORDER BY last_seen_at DESC
	`, walletAddress)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var devices []*models.Device
	for rows.Next() {
		var device models.Device
		var lastSeenAt time.Time
		var cachedModels sql.NullString
		
		err := rows.Scan(
			&device.DeviceID,
			&device.WalletAddress,
			&device.DeviceType,
			&device.Reputation,
			&device.TotalTasks,
			&device.SuccessfulTasks,
			&device.FailedTasks,
			&device.TotalEnergyConsumed,
			&device.AverageResponseTimeMs,
			&cachedModels,
			&lastSeenAt,
			&device.IsActive,
			&device.SlashingCount,
			&device.TrustScore,
			&device.Region,
			&device.LatencyFingerprint,
			&device.AccuracyScore,
			&device.LatencyScore,
			&device.StabilityScore,
			&device.LastReputationUpdate,
		)
		if err != nil {
			continue
		}
		
		device.LastSeenAt = lastSeenAt
		if cachedModels.Valid && cachedModels.String != "" {
			device.CachedModels = []string{}
		}
		
		devices = append(devices, &device)
	}
	
	return devices, nil
}

// GetAllActive retrieves all active devices
func (r *DeviceRepository) GetAllActive(ctx context.Context, limit int) ([]*models.Device, error) {
	if limit <= 0 {
		limit = 100
	}
	
	rows, err := r.db.QueryContext(ctx, `
		SELECT device_id, wallet_address, device_type, reputation,
		       total_tasks, successful_tasks, failed_tasks,
		       total_energy_consumed, average_response_time_ms,
		       cached_models, last_seen_at, is_active, slashing_count,
		       trust_score, region, latency_fingerprint,
		       accuracy_score, latency_score, stability_score, last_reputation_update
		FROM devices
		WHERE is_active = true
		ORDER BY reputation DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var devices []*models.Device
	for rows.Next() {
		var device models.Device
		var lastSeenAt time.Time
		var cachedModels sql.NullString
		
		err := rows.Scan(
			&device.DeviceID,
			&device.WalletAddress,
			&device.DeviceType,
			&device.Reputation,
			&device.TotalTasks,
			&device.SuccessfulTasks,
			&device.FailedTasks,
			&device.TotalEnergyConsumed,
			&device.AverageResponseTimeMs,
			&cachedModels,
			&lastSeenAt,
			&device.IsActive,
			&device.SlashingCount,
			&device.TrustScore,
			&device.Region,
			&device.LatencyFingerprint,
			&device.AccuracyScore,
			&device.LatencyScore,
			&device.StabilityScore,
			&device.LastReputationUpdate,
		)
		if err != nil {
			continue
		}
		
		device.LastSeenAt = lastSeenAt
		if cachedModels.Valid && cachedModels.String != "" {
			device.CachedModels = []string{}
		}
		
		devices = append(devices, &device)
	}
	
	return devices, nil
}

// UpdateLastSeen updates the last_seen_at timestamp and sets is_active to true
func (r *DeviceRepository) UpdateLastSeen(ctx context.Context, deviceID string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE devices 
		SET last_seen_at = NOW(), is_active = true
		WHERE device_id = $1
	`, deviceID)
	return err
}

// CreateOrUpdate creates a new device or updates an existing one
func (r *DeviceRepository) CreateOrUpdate(ctx context.Context, device *models.Device) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO devices (
			device_id, wallet_address, device_type, 
			reputation, total_tasks, successful_tasks, 
			failed_tasks, last_seen_at, is_active
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
		ON CONFLICT (device_id) 
		DO UPDATE SET 
			wallet_address = $2,
			device_type = $3,
			reputation = $4,
			total_tasks = $5,
			successful_tasks = $6,
			failed_tasks = $7,
			last_seen_at = NOW(),
			is_active = $8
	`, device.DeviceID, device.WalletAddress, device.DeviceType,
		device.Reputation, device.TotalTasks, device.SuccessfulTasks,
		device.FailedTasks, device.IsActive)
	return err
}

// CountActiveDevices counts devices that are active and seen within the specified interval
// intervalMinutes defaults to 5 minutes if not specified
func (r *DeviceRepository) CountActiveDevices(ctx context.Context, intervalMinutes int) (int, error) {
	if intervalMinutes <= 0 {
		intervalMinutes = 5 // Default to 5 minutes
	}
	
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0) 
		FROM devices 
		WHERE last_seen_at > NOW() - INTERVAL '1 minute' * $1 
		  AND is_active = true
	`, intervalMinutes).Scan(&count)
	
	if err != nil {
		return 0, err
	}
	
	return count, nil
}
