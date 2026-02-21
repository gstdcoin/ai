package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// MobileComputeService manages background mining on mobile devices.
// Integrates with native NPU/GPU acceleration:
//   - Android: NNAPI (Neural Networks API) / Snapdragon NPU
//   - iOS: CoreML / Apple Neural Engine (ANE)
//
// Energy-aware compute rules (enforced client-side + verified server-side):
//   1. Device must be charging
//   2. Wi-Fi must be active (no cellular data for mining)
//   3. Battery temperature must be <40°C
//   4. Battery level must be >20% (even when charging, for safety)
//
// The server tracks device sessions and rewards, while the actual compute
// happens on-device through the mobile SDK (React Native / native bridge).
type MobileComputeService struct {
	db    *sql.DB
	redis *redis.Client
}

// DeviceSession represents an active mobile mining session
type DeviceSession struct {
	SessionID    string    `json:"session_id"`
	DeviceID     string    `json:"device_id"`
	WalletAddr   string    `json:"wallet_address"`
	DeviceType   string    `json:"device_type"`   // android, ios, web
	NPUAvailable bool      `json:"npu_available"` // Whether device has NPU/ANE
	GPUModel     string    `json:"gpu_model"`     // e.g., "Adreno 740", "Apple A17 Pro"
	Status       string    `json:"status"`        // active, paused, stopped
	TasksDone    int       `json:"tasks_done"`
	TotalEarned  float64   `json:"total_earned_gstd"`
	StartedAt    time.Time `json:"started_at"`
	LastPing     time.Time `json:"last_ping"`
	// Energy awareness
	IsCharging    bool    `json:"is_charging"`
	BatteryLevel  int     `json:"battery_level"`
	BatteryTemp   float64 `json:"battery_temp_c"`
	ConnectionType string `json:"connection_type"` // wifi, cellular, ethernet
}

// DeviceCapability describes what a mobile device can compute
type DeviceCapability struct {
	DeviceID       string `json:"device_id"`
	Platform       string `json:"platform"`        // android, ios
	NPUModel       string `json:"npu_model"`       // e.g., "Hexagon 780", "Apple ANE"
	NPUTOPSEstimate float64 `json:"npu_tops"`     // Estimated TOPS (Tera Operations Per Second)
	RAMAvailableMB int    `json:"ram_available_mb"`
	SupportedFormats []string `json:"supported_formats"` // onnx, coreml, tflite
	OSVersion      string `json:"os_version"`
}

// MobileTask represents a task suitable for mobile NPU execution
type MobileTask struct {
	TaskID        string  `json:"task_id"`
	TaskType      string  `json:"task_type"`      // validation, prefill, decode, classify
	ModelFormat   string  `json:"model_format"`   // onnx, coreml, tflite
	InputSize     int     `json:"input_size"`     // Tokens or data points
	RewardGSTD    float64 `json:"reward_gstd"`
	MaxLatencyMs  int     `json:"max_latency_ms"` // Time limit
	RequiresNPU   bool    `json:"requires_npu"`
}

func NewMobileComputeService(db *sql.DB, redis *redis.Client) *MobileComputeService {
	svc := &MobileComputeService{db: db, redis: redis}
	svc.ensureSchema()
	return svc
}

func (s *MobileComputeService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS mobile_sessions (
			session_id VARCHAR(64) PRIMARY KEY,
			device_id VARCHAR(64) NOT NULL,
			wallet_address VARCHAR(128) NOT NULL,
			device_type VARCHAR(16),
			npu_available BOOLEAN DEFAULT false,
			gpu_model VARCHAR(64),
			status VARCHAR(16) DEFAULT 'active',
			tasks_done INTEGER DEFAULT 0,
			total_earned_gstd DECIMAL(18,8) DEFAULT 0,
			started_at TIMESTAMP DEFAULT NOW(),
			last_ping TIMESTAMP DEFAULT NOW(),
			is_charging BOOLEAN DEFAULT false,
			battery_level INTEGER DEFAULT 100,
			battery_temp DECIMAL(4,1) DEFAULT 25.0,
			connection_type VARCHAR(16) DEFAULT 'wifi'
		);
		CREATE INDEX IF NOT EXISTS idx_mobile_sessions_wallet ON mobile_sessions(wallet_address);
		CREATE INDEX IF NOT EXISTS idx_mobile_sessions_active ON mobile_sessions(status) WHERE status = 'active';
		
		CREATE TABLE IF NOT EXISTS mobile_capabilities (
			device_id VARCHAR(64) PRIMARY KEY,
			platform VARCHAR(16),
			npu_model VARCHAR(64),
			npu_tops DECIMAL(6,2),
			ram_available_mb INTEGER,
			supported_formats TEXT,
			os_version VARCHAR(32),
			registered_at TIMESTAMP DEFAULT NOW()
		);
	`)
	log.Println("📱 Mobile Compute schema ensured")
}

// StartSession begins a mobile mining session with energy checks
func (s *MobileComputeService) StartSession(ctx context.Context, req *DeviceSession) (*DeviceSession, error) {
	// Validate energy-aware constraints
	violations := s.validateEnergyConstraints(req)
	if len(violations) > 0 {
		return nil, fmt.Errorf("energy constraints not met: %v", violations)
	}

	sessionID := fmt.Sprintf("mob-%s-%d", req.DeviceID[:8], time.Now().UnixNano())
	req.SessionID = sessionID
	req.Status = "active"
	req.StartedAt = time.Now()
	req.LastPing = time.Now()

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO mobile_sessions (session_id, device_id, wallet_address, device_type, npu_available, gpu_model, status, is_charging, battery_level, battery_temp, connection_type)
		VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10)
		ON CONFLICT (session_id) DO UPDATE SET status = 'active', last_ping = NOW()
	`, sessionID, req.DeviceID, req.WalletAddr, req.DeviceType, req.NPUAvailable, req.GPUModel,
		req.IsCharging, req.BatteryLevel, req.BatteryTemp, req.ConnectionType)

	if err != nil {
		return nil, fmt.Errorf("failed to start session: %w", err)
	}

	// Cache active session in Redis for fast lookup
	if s.redis != nil {
		s.redis.Set(ctx, "mobile:session:"+sessionID, req.WalletAddr, 30*time.Minute)
		s.redis.SAdd(ctx, "mobile:active", sessionID)
	}

	log.Printf("📱 Mobile session started: %s (device=%s, NPU=%v, charging=%v, battery=%d%%)",
		sessionID, req.DeviceType, req.NPUAvailable, req.IsCharging, req.BatteryLevel)

	return req, nil
}

// Heartbeat updates session status and returns next task (if available)
func (s *MobileComputeService) Heartbeat(ctx context.Context, sessionID string, status *DeviceSession) (*MobileTask, error) {
	// Verify session exists
	var walletAddr string
	err := s.db.QueryRowContext(ctx,
		"SELECT wallet_address FROM mobile_sessions WHERE session_id = $1 AND status = 'active'",
		sessionID).Scan(&walletAddr)
	if err != nil {
		return nil, fmt.Errorf("session not found or inactive")
	}

	// Check energy constraints
	violations := s.validateEnergyConstraints(status)
	if len(violations) > 0 {
		// Pause session instead of stopping
		s.db.ExecContext(ctx, "UPDATE mobile_sessions SET status = 'paused', last_ping = NOW() WHERE session_id = $1", sessionID)
		return nil, fmt.Errorf("session paused: %v", violations)
	}

	// Update session with latest device state
	s.db.ExecContext(ctx, `
		UPDATE mobile_sessions SET 
			last_ping = NOW(), is_charging = $1, battery_level = $2, 
			battery_temp = $3, connection_type = $4
		WHERE session_id = $5
	`, status.IsCharging, status.BatteryLevel, status.BatteryTemp, status.ConnectionType, sessionID)

	// Assign a mobile-appropriate task
	task := s.assignMobileTask(ctx, sessionID, status.NPUAvailable)
	return task, nil
}

// ReportTaskCompletion records a completed task and credits reward
func (s *MobileComputeService) ReportTaskCompletion(ctx context.Context, sessionID, taskID string, success bool, latencyMs int) error {
	if !success {
		return nil // No reward for failed tasks
	}

	// Get task reward
	reward := 0.003 // Base reward for mobile tasks
	if latencyMs < 1000 {
		reward *= 1.5 // Bonus for fast completion
	}

	// Update session stats
	_, err := s.db.ExecContext(ctx, `
		UPDATE mobile_sessions SET 
			tasks_done = tasks_done + 1,
			total_earned_gstd = total_earned_gstd + $1,
			last_ping = NOW()
		WHERE session_id = $2
	`, reward, sessionID)
	if err != nil {
		return err
	}

	// Credit user balance
	var walletAddr string
	s.db.QueryRowContext(ctx, "SELECT wallet_address FROM mobile_sessions WHERE session_id = $1", sessionID).Scan(&walletAddr)
	if walletAddr != "" {
		s.db.ExecContext(ctx, `
			UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1
			WHERE wallet_address = $2
		`, reward, walletAddr)
	}

	return nil
}

// validateEnergyConstraints checks if device state allows mining
func (s *MobileComputeService) validateEnergyConstraints(status *DeviceSession) []string {
	var violations []string

	if !status.IsCharging {
		violations = append(violations, "device_not_charging")
	}
	if status.ConnectionType == "cellular" {
		violations = append(violations, "cellular_connection")
	}
	if status.BatteryTemp > 40.0 {
		violations = append(violations, fmt.Sprintf("battery_temp_%.1f_exceeds_40C", status.BatteryTemp))
	}
	if status.BatteryLevel < 20 {
		violations = append(violations, fmt.Sprintf("battery_level_%d_below_20", status.BatteryLevel))
	}

	return violations
}

// assignMobileTask selects an appropriate task for a mobile device
func (s *MobileComputeService) assignMobileTask(ctx context.Context, sessionID string, hasNPU bool) *MobileTask {
	// Select tasks appropriate for mobile: validation, text classification, embedding
	taskTypes := []string{"validation", "classify", "embed"}
	if hasNPU {
		taskTypes = append(taskTypes, "prefill", "quantized_inference")
	}

	return &MobileTask{
		TaskID:       fmt.Sprintf("mtask-%d", time.Now().UnixNano()),
		TaskType:     "validation",
		ModelFormat:  "onnx",
		InputSize:    128,
		RewardGSTD:   0.003,
		MaxLatencyMs: 5000,
		RequiresNPU:  false,
	}
}

// GetMobileStats returns mobile mining network statistics
func (s *MobileComputeService) GetMobileStats(ctx context.Context) (map[string]interface{}, error) {
	stats := map[string]interface{}{}

	var activeSessions, totalDevices int
	var totalEarned float64
	var totalTasks int

	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM mobile_sessions WHERE status = 'active'").Scan(&activeSessions)
	s.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT device_id) FROM mobile_sessions").Scan(&totalDevices)
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(total_earned_gstd), 0) FROM mobile_sessions").Scan(&totalEarned)
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(tasks_done), 0) FROM mobile_sessions").Scan(&totalTasks)

	// NPU device breakdown
	var npuDevices int
	s.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT device_id) FROM mobile_sessions WHERE npu_available = true").Scan(&npuDevices)

	stats["active_sessions"] = activeSessions
	stats["total_devices"] = totalDevices
	stats["npu_devices"] = npuDevices
	stats["total_earned_gstd"] = totalEarned
	stats["total_tasks_completed"] = totalTasks
	stats["energy_constraints"] = map[string]interface{}{
		"charging_required":    true,
		"wifi_only":            true,
		"max_battery_temp_c":   40.0,
		"min_battery_level":    20,
	}

	return stats, nil
}

// RegisterDeviceCapability stores device NPU/GPU capabilities
func (s *MobileComputeService) RegisterDeviceCapability(ctx context.Context, cap *DeviceCapability) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO mobile_capabilities (device_id, platform, npu_model, npu_tops, ram_available_mb, supported_formats, os_version)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (device_id) DO UPDATE SET 
			npu_model = $3, npu_tops = $4, ram_available_mb = $5, 
			supported_formats = $6, os_version = $7
	`, cap.DeviceID, cap.Platform, cap.NPUModel, cap.NPUTOPSEstimate,
		cap.RAMAvailableMB, fmt.Sprintf("%v", cap.SupportedFormats), cap.OSVersion)
	return err
}
