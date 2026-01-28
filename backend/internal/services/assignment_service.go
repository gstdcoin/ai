package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/models"
	"fmt"
	"log"
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
// SECURITY: Uses transaction with FOR UPDATE to prevent race conditions
func (s *AssignmentService) AssignTask(ctx context.Context, taskID string, deviceID string) error {
	// Start transaction to prevent race conditions
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Get task with row-level lock (FOR UPDATE) to prevent concurrent assignments
	var timeLimitSec int
	var currentStatus string
	var reward float64
	err = tx.QueryRowContext(ctx, `
		SELECT constraints_time_limit_sec, status, labor_compensation_gstd
		FROM tasks 
		WHERE task_id = $1
		FOR UPDATE
	`, taskID).Scan(&timeLimitSec, &currentStatus, &reward)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	// Verify task is still pending or timeout (can be reassigned)
	if currentStatus != "pending" && currentStatus != "timeout" {
		return fmt.Errorf("task is not available (current status: %s)", currentStatus)
	}

	timeoutAt := time.Now().Add(time.Duration(timeLimitSec+120) * time.Second)

	// -------------------------------------------------------------------------
	// STAKE CHECK (Atomic & Race-Condition Proof)
	// -------------------------------------------------------------------------
	// 1. Get wallet address for this device/node
	var walletAddress string
	// Try nodes table first
	err = tx.QueryRowContext(ctx, "SELECT wallet_address FROM nodes WHERE id = $1", deviceID).Scan(&walletAddress)
	if err != nil {
		// Try devices table
		err = tx.QueryRowContext(ctx, "SELECT wallet_address FROM devices WHERE device_id = $1", deviceID).Scan(&walletAddress)
	}
	
	if err != nil {
		// If fails (e.g. device not found or wallet_address is null), use deviceID as fallback
		// or proceed (risk of bypass, but prevents bricking if DB inconsistent)
		walletAddress = deviceID
	}

	requiredStake := reward * 0.10 // 10% of labor compensation as stake

	// Attempt to atomically freeze stake
	// We assume 'gstd_frozen' column exists for staking in the 'users' table
	res, err := tx.ExecContext(ctx, `
		UPDATE users 
		SET gstd_frozen = COALESCE(gstd_frozen, 0) + $1 
		WHERE wallet_address = $2 
		  AND (gstd_balance - COALESCE(gstd_frozen, 0)) >= $1
	`, requiredStake, walletAddress)

	if err != nil {
		// If column doesn't exist, we might fail here. 
		// In production we'd migrate. For now we assume scheme compliance.
		return fmt.Errorf("system error during stake check: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("INSUFFICIENT STAKE: You need %.4f GSTD (10%% of reward) free margin to accept this task.", requiredStake)
	}
	// -------------------------------------------------------------------------

	// 2. Count active assignments for this wallet (SYBIL ATTACK MITIGATION)
	// We count tasks where the assigned device belongs to the same wallet
	var activeCount int
	err = tx.QueryRowContext(ctx, `
		SELECT COUNT(*) 
		FROM tasks t
		JOIN devices d ON t.assigned_device = d.device_id
		WHERE d.wallet_address = $1 
		  AND t.status = 'assigned' 
		  AND t.timeout_at > NOW()
	`, walletAddress).Scan(&activeCount)
	
	// Limit is 3 active tasks per wallet (temporary measure)
	if err == nil && activeCount >= 3 {
		log.Printf("⚠️  Rate limit exceeded for wallet %s: %d active tasks (limit 3)", walletAddress, activeCount)
		return fmt.Errorf("rate limit exceeded: wallet %s has too many active tasks (%d/3). Please complete existing tasks first.", walletAddress, activeCount)
	}
	// -------------------------------------------------------------------------

	// Update task status atomically (allow reassignment from 'pending' or 'timeout')
	var result sql.Result
	result, err = tx.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'assigned',
		    assigned_device = $1,
		    assigned_at = NOW(),
		    timeout_at = $2
		WHERE task_id = $3 AND status IN ('pending', 'timeout')
	`, deviceID, timeoutAt, taskID)
	if err != nil {
		return fmt.Errorf("failed to assign task: %w", err)
	}

	// Verify update actually happened (prevent race conditions)
	rowsAffected, err = result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	
	if rowsAffected == 0 {
		return fmt.Errorf("task assignment failed - task may have been assigned to another worker (race condition prevented)")
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// GetAvailableTasks returns available tasks for a device
func (s *AssignmentService) GetAvailableTasks(ctx context.Context, deviceID string, limit int) ([]*models.Task, error) {
	// 1. Get device trust and region from nodes table
	var deviceTrust float64
	var deviceRegion sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(trust_score, 1.0) as trust, 
		       COALESCE(country, '') as region 
		FROM nodes WHERE id = $1
	`, deviceID).Scan(&deviceTrust, &deviceRegion)
	if err != nil {
        // Try devices table as fallback (legacy)
        err = s.db.QueryRowContext(ctx, `
            SELECT COALESCE(trust_score, 0.1) as trust, 
                   COALESCE(region, '') as region 
            FROM devices WHERE device_id = $1
        `, deviceID).Scan(&deviceTrust, &deviceRegion)
        
        if err != nil {
            // Fallback for new/unknown devices
            deviceTrust = 0.1
            deviceRegion = sql.NullString{String: "unknown", Valid: true}
        }
	}
	
	// regionStr removed - not used in query below
	// regionStr := "unknown"
	// if deviceRegion.Valid {
	// 	regionStr = deviceRegion.String
	// }

	// 2. Get available tasks matching device trust and geo-fence
	// Use simplified query with only guaranteed columns to avoid SQL errors
	// If extended columns are needed, they should be added via migrations first
	query := `
		SELECT task_id, requester_address, task_type, operation, model,
		       labor_compensation_gstd,
		       COALESCE(priority_score, 0.0) as priority_score,
		       status, created_at,
		       completed_at,
		       COALESCE(assigned_device, '') as assigned_device,
		       COALESCE(min_trust_score, 0.0) as min_trust_score
		FROM tasks
		WHERE status IN ('pending', 'queued', 'timeout')
		  AND COALESCE(min_trust_score, 0.0) <= $1
		ORDER BY COALESCE(priority_score, 0.0) DESC, created_at ASC
		FOR UPDATE SKIP LOCKED
		LIMIT $2
	`

	rows, err := s.db.QueryContext(ctx, query, deviceTrust, limit)
	if err != nil {
		// Log error but return empty array instead of failing
		log.Printf("GetAvailableTasks: Query error: %v", err)
		return []*models.Task{}, nil
	}
	defer rows.Close()

	var tasks []*models.Task
	for rows.Next() {
		var task models.Task
		var completedAt sql.NullTime
		var assignedDevice sql.NullString
		
		err := rows.Scan(
			&task.TaskID, &task.RequesterAddress, &task.TaskType, &task.Operation,
			&task.Model, &task.LaborCompensationGSTD, &task.PriorityScore,
			&task.Status, &task.CreatedAt, &completedAt, &assignedDevice, &task.MinTrustScore,
		)
		if err != nil {
			log.Printf("GetAvailableTasks: Scan error: %v", err)
			continue // Skip invalid rows
		}
		
		// Set optional fields
		if completedAt.Valid {
			task.CompletedAt = &completedAt.Time
		}
		if assignedDevice.Valid {
			task.AssignedDevice = &assignedDevice.String
		}
		
		// Set defaults for optional fields that may not exist in DB
		task.InputSource = ""
		task.InputHash = ""
		task.TimeLimitSec = 0
		task.MaxEnergyMwh = 0
		task.ValidationMethod = "majority"
		task.EscrowAddress = ""
		task.EscrowAmountGSTD = 0.0
		task.IsPrivate = false
		
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

	if status != "pending" && status != "timeout" {
		return fmt.Errorf("task already assigned (current status: %s)", status)
	}

	// Assign task
	return s.AssignTask(ctx, taskID, deviceID)
}

