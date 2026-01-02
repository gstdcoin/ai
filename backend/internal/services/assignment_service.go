package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/models"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// AssignmentService handles task assignment to devices
type AssignmentService struct {
	db    *sql.DB
	queue *redis.Client
}

func NewAssignmentService(db *sql.DB, queue *redis.Client) *AssignmentService {
	return &AssignmentService{
		db:    db,
		queue: queue,
	}
}

// AssignTask assigns a task to a device
func (s *AssignmentService) AssignTask(ctx context.Context, taskID string, deviceID string) error {
	// Set timeout: task time limit + 2 minutes buffer
	var timeLimitSec int
	err := s.db.QueryRowContext(ctx, `
		SELECT constraints_time_limit_sec FROM tasks WHERE task_id = $1
	`, taskID).Scan(&timeLimitSec)
	if err != nil {
		return err
	}

	timeoutAt := time.Now().Add(time.Duration(timeLimitSec+120) * time.Second)

	_, err = s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'assigned',
		    assigned_device = $1,
		    assigned_at = NOW(),
		    timeout_at = $2
		WHERE task_id = $3 AND status = 'pending'
	`, deviceID, timeoutAt, taskID)
	if err != nil {
		return err
	}

	return nil
}

// GetAvailableTasks returns available tasks for a device
func (s *AssignmentService) GetAvailableTasks(ctx context.Context, deviceID string, limit int) ([]*models.Task, error) {
	// 1. Get device trust and region
	var deviceTrust float64
	var deviceRegion string
	err := s.db.QueryRowContext(ctx, "SELECT trust_score, region FROM devices WHERE device_id = $1", deviceID).Scan(&deviceTrust, &deviceRegion)
	if err != nil {
		// Fallback for new devices
		deviceTrust = 0.1
		deviceRegion = "unknown"
	}

	// 2. Get available tasks matching device trust and geo-fence
	query := `
		SELECT task_id, requester_address, task_type, operation, model,
		       input_source, input_hash, constraints_time_limit_sec,
		       constraints_max_energy_mwh, labor_compensation_ton, validation_method,
		       priority_score, status, created_at, assigned_at, completed_at,
		       escrow_address, escrow_amount_ton, min_trust_score, is_private
		FROM tasks
		WHERE status = 'pending'
		  AND min_trust_score <= $1
		  AND (geo_restriction IS NULL OR $2 = ANY(geo_restriction))
		ORDER BY priority_score DESC, created_at ASC
		LIMIT $3
	`

	rows, err := s.db.QueryContext(ctx, query, deviceTrust, deviceRegion, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*models.Task
	for rows.Next() {
		var task models.Task
		err := rows.Scan(
			&task.TaskID, &task.RequesterAddress, &task.TaskType, &task.Operation,
			&task.Model, &task.InputSource, &task.InputHash, &task.TimeLimitSec,
			&task.MaxEnergyMwh, &task.LaborCompensationTon, &task.ValidationMethod,
			&task.PriorityScore, &task.Status, &task.CreatedAt, &task.AssignedAt,
			&task.CompletedAt, &task.EscrowAddress, &task.EscrowAmountTon,
		)
		if err != nil {
			continue
		}
		tasks = append(tasks, &task)
	}

	return tasks, nil
}

// ClaimTask allows device to claim a task
func (s *AssignmentService) ClaimTask(ctx context.Context, taskID string, deviceID string) error {
	// Check if task is still available
	var status string
	err := s.db.QueryRowContext(ctx, `
		SELECT status FROM tasks WHERE task_id = $1
	`, taskID).Scan(&status)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	if status != "pending" {
		return fmt.Errorf("task already assigned")
	}

	// Assign task
	return s.AssignTask(ctx, taskID, deviceID)
}

