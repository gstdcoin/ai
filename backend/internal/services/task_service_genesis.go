package services

import (
	"context"
	"distributed-computing-platform/internal/models"
	"encoding/json"
	"log"
)

// EnsureGenesisTask ensures the GENESIS_MAP task exists
func (s *TaskService) EnsureGenesisTask(ctx context.Context) error {
	var exists bool
	err := s.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM tasks WHERE task_id = 'GENESIS_MAP')").Scan(&exists)
	if err != nil {
		return err
	}

	if exists {
		log.Println("✅ Genesis Task (GENESIS_MAP) already exists.")
		return nil
	}

	log.Println("🚀 Creating Genesis Task (GENESIS_MAP)...")

	// Create Genesis Task
	genesisTask := models.TaskDefinition{
		TaskID: "GENESIS_MAP",
		Name:   "Global Network Connectivity Map",
		Type:   "NETWORK_PROBING",
		Parameters: map[string]interface{}{
			"target": "global_probe",
			"metrics": []string{"latency", "packet_loss", "connection_type", "gps_coords"},
		},
		Reward: models.Reward{
			AmountGSTD: 0.1, // Small reward for ping
		},
	}

	payloadJSON, _ := json.Marshal(genesisTask.Parameters)
	
	// Insert directly - 14 columns with 14 placeholders
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO tasks (
			task_id, requester_address, task_type, operation, model,
			labor_compensation_gstd, priority_score, status, created_at,
			escrow_status, min_trust_score, is_private, confidence_depth, 
			redundancy_factor, is_spot_check, payload
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14, $15)
	`, 
		"GENESIS_MAP", 
		"GENESIS_SYSTEM", 
		"NETWORK_PROBING", 
		"GENESIS_MAP", 
		"network_probe_v1",
		0.1, 
		999.0,          // High priority
		"queued",       // status - Visible to workers
		"active",       // escrow_status
		0.0,            // min_trust_score
		false,          // is_private
		1,              // confidence_depth
		1000000,        // redundancy_factor - High redundancy -> infinite workers
		false,          // is_spot_check
		string(payloadJSON),
	)

	if err != nil {
		return err
	}
	
	// Create table for storing results if not exists
	_, err = s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS network_measurements (
			id SERIAL PRIMARY KEY,
			node_id VARCHAR(255) NOT NULL,
			latency_ms INTEGER,
			packet_loss FLOAT,
			connection_type VARCHAR(50),
			gps_lat FLOAT,
			gps_lng FLOAT,
			recorded_at TIMESTAMP DEFAULT NOW()
		);
	`)

	return err
}
