package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// TelemetryService handles Genesis Task telemetry storage with resilience
type TelemetryService struct {
	db             *sql.DB
	redisClient    *redis.Client
	maxRequests    int
	windowSize     time.Duration
}

// TelemetryData represents the telemetry payload from Genesis Task
type TelemetryData struct {
	TaskID        string            `json:"task_id"`
	DeviceID      string            `json:"device_id"`
	WalletAddress string            `json:"wallet_address"`
	Timestamp     string            `json:"timestamp"`
	GPS           *GPSData          `json:"gps,omitempty"`
	Connection    *ConnectionData   `json:"connection,omitempty"`
	Device        *DeviceData       `json:"device,omitempty"`
	UserAgent     string            `json:"userAgent"`
}

type GPSData struct {
	Lat      float64  `json:"lat"`
	Lng      float64  `json:"lng"`
	Accuracy float64  `json:"accuracy"`
	Altitude *float64 `json:"altitude"`
	Speed    *float64 `json:"speed"`
}

type ConnectionData struct {
	EffectiveType string  `json:"effectiveType"`
	RTT           int     `json:"rtt"`
	Downlink      float64 `json:"downlink"`
	SaveData      bool    `json:"saveData"`
	Type          string  `json:"type"`
}

type DeviceData struct {
	Platform string   `json:"platform"`
	Vendor   string   `json:"vendor"`
	Cores    int      `json:"cores"`
	Memory   *float64 `json:"memory"`
}

func NewTelemetryService(db *sql.DB, redisClient *redis.Client) *TelemetryService {
	return &TelemetryService{
		db:          db,
		redisClient: redisClient,
		maxRequests: 60,              // 60 requests per window
		windowSize:  5 * time.Minute, // 5 minute window
	}
}

// CheckRateLimit returns true if the wallet is rate limited
func (s *TelemetryService) CheckRateLimit(ctx context.Context, walletAddress string) (bool, error) {
	// Try Redis first for performance
	if s.redisClient != nil {
		key := fmt.Sprintf("telemetry_rate:%s", walletAddress)
		count, err := s.redisClient.Incr(ctx, key).Result()
		if err == nil {
			// Set expiry on first request
			if count == 1 {
				s.redisClient.Expire(ctx, key, s.windowSize)
			}
			return count > int64(s.maxRequests), nil
		}
		// Redis failed, fallback to DB
		log.Printf("⚠️  Redis rate limit check failed, falling back to DB: %v", err)
	}
	
	// Fallback to database
	var requestCount int
	var windowStart time.Time
	
	err := s.db.QueryRowContext(ctx, `
		SELECT request_count, window_start
		FROM telemetry_rate_limits
		WHERE wallet_address = $1
	`, walletAddress).Scan(&requestCount, &windowStart)
	
	if err == sql.ErrNoRows {
		// First request from this wallet
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO telemetry_rate_limits (wallet_address, request_count, window_start, last_request)
			VALUES ($1, 1, NOW(), NOW())
			ON CONFLICT (wallet_address) DO UPDATE
			SET request_count = 1, window_start = NOW(), last_request = NOW()
		`, walletAddress)
		return false, err
	}
	
	if err != nil {
		return false, err
	}
	
	// Check if window has expired
	if time.Since(windowStart) > s.windowSize {
		// Reset window
		_, err = s.db.ExecContext(ctx, `
			UPDATE telemetry_rate_limits
			SET request_count = 1, window_start = NOW(), last_request = NOW()
			WHERE wallet_address = $1
		`, walletAddress)
		return false, err
	}
	
	// Increment counter
	_, err = s.db.ExecContext(ctx, `
		UPDATE telemetry_rate_limits
		SET request_count = request_count + 1, last_request = NOW()
		WHERE wallet_address = $1
	`, walletAddress)
	
	return requestCount >= s.maxRequests, err
}

// StoreTelemetry stores telemetry data with Redis fallback
func (s *TelemetryService) StoreTelemetry(ctx context.Context, data *TelemetryData) error {
	// Try to store in PostgreSQL first
	err := s.storeInPostgres(ctx, data)
	if err != nil {
		log.Printf("⚠️  Failed to store telemetry in Postgres, queuing to Redis: %v", err)
		// Fallback to Redis queue
		return s.queueToRedis(ctx, data)
	}
	return nil
}

func (s *TelemetryService) storeInPostgres(ctx context.Context, data *TelemetryData) error {
	// Parse client timestamp
	var clientTimestamp *time.Time
	if data.Timestamp != "" {
		if t, err := time.Parse(time.RFC3339, data.Timestamp); err == nil {
			clientTimestamp = &t
		}
	}
	
	// Calculate H3 indexes (simplified - in production use h3-go library)
	var h3R7, h3R9 *string
	var lat, lng, accuracy, altitude, speed *float64
	if data.GPS != nil {
		// Placeholder - in production, use: h3.LatLngToCell(data.GPS.Lat, data.GPS.Lng, 7)
		r7 := fmt.Sprintf("h3_r7_%.4f_%.4f", data.GPS.Lat, data.GPS.Lng)
		r9 := fmt.Sprintf("h3_r9_%.4f_%.4f", data.GPS.Lat, data.GPS.Lng)
		h3R7 = &r7
		h3R9 = &r9
		lat = &data.GPS.Lat
		lng = &data.GPS.Lng
		accuracy = &data.GPS.Accuracy
		altitude = data.GPS.Altitude
		speed = data.GPS.Speed
	}
	
	var connType, effectiveType *string
	var downlink *float64
	var rtt *int
	var saveData bool
	if data.Connection != nil {
		connType = &data.Connection.Type
		effectiveType = &data.Connection.EffectiveType
		downlink = &data.Connection.Downlink
		rtt = &data.Connection.RTT
		saveData = data.Connection.SaveData
	}
	
	var platform, vendor *string
	var cores *int
	var memory *float64
	if data.Device != nil {
		platform = &data.Device.Platform
		vendor = &data.Device.Vendor
		cores = &data.Device.Cores
		memory = data.Device.Memory
	}
	
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO topology_metrics (
			task_id, device_id, wallet_address, client_timestamp,
			latitude, longitude, gps_accuracy, altitude, speed,
			h3_index_r7, h3_index_r9,
			connection_type, effective_type, downlink_mbps, rtt_ms, save_data,
			platform, vendor, cpu_cores, memory_gb, user_agent
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7, $8, $9,
			$10, $11,
			$12, $13, $14, $15, $16,
			$17, $18, $19, $20, $21
		)
	`,
		data.TaskID, data.DeviceID, data.WalletAddress, clientTimestamp,
		lat, lng, accuracy, altitude, speed,
		h3R7, h3R9,
		connType, effectiveType, downlink, rtt, saveData,
		platform, vendor, cores, memory,
		data.UserAgent,
	)
	
	return err
}

func (s *TelemetryService) queueToRedis(ctx context.Context, data *TelemetryData) error {
	if s.redisClient == nil {
		// No Redis available, try to queue in DB
		return s.queueToDB(ctx, data)
	}
	
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	
	// Add to Redis list for later processing
	return s.redisClient.RPush(ctx, "telemetry_queue", payload).Err()
}

func (s *TelemetryService) queueToDB(ctx context.Context, data *TelemetryData) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO telemetry_queue (payload, status)
		VALUES ($1, 'pending')
	`, payload)
	
	return err
}

// ProcessQueue processes queued telemetry data (called periodically)
func (s *TelemetryService) ProcessQueue(ctx context.Context) error {
	// Process Redis queue
	if s.redisClient != nil {
		for {
			payload, err := s.redisClient.LPop(ctx, "telemetry_queue").Result()
			if err == redis.Nil {
				break // Queue empty
			}
			if err != nil {
				log.Printf("⚠️  Error reading from Redis queue: %v", err)
				break
			}
			
			var data TelemetryData
			if err := json.Unmarshal([]byte(payload), &data); err != nil {
				log.Printf("⚠️  Error parsing queued telemetry: %v", err)
				continue
			}
			
			if err := s.storeInPostgres(ctx, &data); err != nil {
				log.Printf("⚠️  Error storing queued telemetry: %v", err)
				// Re-queue for later
				s.redisClient.RPush(ctx, "telemetry_queue", payload)
			}
		}
	}
	
	// Process DB queue
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, payload
		FROM telemetry_queue
		WHERE status = 'pending'
		ORDER BY created_at
		LIMIT 100
	`)
	if err != nil {
		return err
	}
	defer rows.Close()
	
	for rows.Next() {
		var id int
		var payload []byte
		if err := rows.Scan(&id, &payload); err != nil {
			continue
		}
		
		var data TelemetryData
		if err := json.Unmarshal(payload, &data); err != nil {
			// Mark as failed
			s.db.ExecContext(ctx, `UPDATE telemetry_queue SET status = 'failed', last_error = $1 WHERE id = $2`, err.Error(), id)
			continue
		}
		
		if err := s.storeInPostgres(ctx, &data); err != nil {
			// Increment retry count
			s.db.ExecContext(ctx, `UPDATE telemetry_queue SET retry_count = retry_count + 1, last_error = $1 WHERE id = $2`, err.Error(), id)
		} else {
			// Mark as completed
			s.db.ExecContext(ctx, `UPDATE telemetry_queue SET status = 'completed', processed_at = NOW() WHERE id = $1`, id)
		}
	}
	
	return nil
}
