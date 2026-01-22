package services

import (
	"context"
	"database/sql"
)

type DeviceService struct {
	db *sql.DB
}

func NewDeviceService(db *sql.DB) *DeviceService {
	return &DeviceService{db: db}
}

// RegisterDevice registers a new device or updates existing device
type RegisterDeviceRequest struct {
	DeviceID      string `json:"device_id"`      // Unique device fingerprint
	WalletAddress string `json:"wallet_address"`  // Wallet address (can be same for multiple devices)
	DeviceType    string `json:"device_type"`    // android, ios, desktop
	DeviceInfo    string `json:"device_info"`     // Additional device info
}

func (s *DeviceService) RegisterDevice(ctx context.Context, req RegisterDeviceRequest) error {
	// Update is_active and LAST SEEN
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO devices (
			device_id, wallet_address, device_type, 
			reputation, total_tasks, successful_tasks, 
			failed_tasks, last_seen_at, is_active
		) VALUES ($1, $2, $3, 0.5, 0, 0, 0, NOW(), true)
		ON CONFLICT (device_id) 
		DO UPDATE SET 
			wallet_address = $2,
			device_type = $3,
			last_seen_at = NOW(),
			is_active = true
	`, req.DeviceID, req.WalletAddress, req.DeviceType)
	return err
}

// GetDevicesByWallet returns all devices for a wallet address
func (s *DeviceService) GetDevicesByWallet(ctx context.Context, walletAddress string) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT device_id, wallet_address, device_type, reputation,
		       total_tasks, successful_tasks, average_response_time_ms, last_seen_at
		FROM devices
		WHERE wallet_address = $1 AND is_active = true
		ORDER BY last_seen_at DESC
	`, walletAddress)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []map[string]interface{}
	for rows.Next() {
		var deviceID, walletAddr, deviceType string
		var reputation float64
		var totalTasks, successfulTasks, avgTime int
		var lastSeen interface{}

		err := rows.Scan(&deviceID, &walletAddr, &deviceType, &reputation,
			&totalTasks, &successfulTasks, &avgTime, &lastSeen)
		if err != nil {
			continue
		}

		devices = append(devices, map[string]interface{}{
			"device_id":              deviceID,
			"wallet_address":         walletAddr,
			"device_type":            deviceType,
			"reputation":             reputation,
			"total_tasks":            totalTasks,
			"successful_tasks":       successfulTasks,
			"average_response_time_ms": avgTime,
			"last_seen_at":           lastSeen,
		})
	}

	return devices, nil
}

func (s *DeviceService) GetDevices(ctx context.Context) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT device_id, wallet_address, device_type, reputation,
		       total_tasks, successful_tasks, average_response_time_ms, last_seen_at
		FROM devices
		WHERE is_active = true
		ORDER BY reputation DESC
		LIMIT 100
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []map[string]interface{}
	for rows.Next() {
		var deviceID, walletAddress, deviceType string
		var reputation float64
		var totalTasks, successfulTasks, avgTime int
		var lastSeen interface{}

		err := rows.Scan(&deviceID, &walletAddress, &deviceType, &reputation,
			&totalTasks, &successfulTasks, &avgTime, &lastSeen)
		if err != nil {
			continue
		}

		devices = append(devices, map[string]interface{}{
			"device_id":              deviceID,
			"wallet_address":          walletAddress,
			"device_type":            deviceType,
			"reputation":              reputation,
			"total_tasks":            totalTasks,
			"successful_tasks":       successfulTasks,
			"average_response_time_ms": avgTime,
			"last_seen_at":           lastSeen,
		})
	}

	return devices, nil
}

// UpdateDeviceLastSeen updates last_seen_at for device
func (s *DeviceService) UpdateDeviceLastSeen(ctx context.Context, deviceID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE devices 
		SET last_seen_at = NOW(), is_active = true
		WHERE device_id = $1
	`, deviceID)
	return err
}

// GetDeviceTrust retrieves trust score for a device
func (s *DeviceService) GetDeviceTrust(ctx context.Context, deviceID string, trustScore *float64) error {
	var reputation float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(reputation, 0.1) FROM devices WHERE device_id = $1
	`, deviceID).Scan(&reputation)
	if err != nil {
		*trustScore = 0.1 // Default for new devices
		return err
	}
	*trustScore = reputation
	return nil
}
