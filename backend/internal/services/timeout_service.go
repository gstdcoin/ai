package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// TimeoutService handles task timeouts and reassignment
type TimeoutService struct {
	db          *sql.DB
	errorLogger *ErrorLogger // For logging errors to database
}

func NewTimeoutService(db *sql.DB) *TimeoutService {
	return &TimeoutService{
		db: db,
	}
}

// SetErrorLogger sets the error logger for logging errors to database
func (s *TimeoutService) SetErrorLogger(errorLogger *ErrorLogger) {
	s.errorLogger = errorLogger
}

// CheckTimeouts checks for timed out tasks and reassigns them
func (s *TimeoutService) CheckTimeouts(ctx context.Context) error {
	// Find tasks that are assigned but haven't been updated in timeout period
	timeoutDuration := 5 * time.Minute // 5 minutes timeout for execution
	
	// SECURITY: Use parameterized query to prevent SQL injection
	// Return both task_id and assigned_device for logging
	query := `
		UPDATE tasks 
		SET status = 'timeout', 
		    assigned_at = NULL,
		    assigned_device = NULL,
		    timeout_at = NULL
		WHERE status = 'assigned' 
		  AND (timeout_at < NOW() OR (assigned_at < NOW() - INTERVAL '1 second' * $1 AND timeout_at IS NULL))
		RETURNING task_id, assigned_device
	`
	
	rows, err := s.db.QueryContext(ctx, query, int(timeoutDuration.Seconds()))
	if err != nil {
		return err
	}
	defer rows.Close()

	var reassignedTasks []struct {
		TaskID        string
		AssignedDevice sql.NullString
	}
	
	for rows.Next() {
		var taskID string
		var assignedDevice sql.NullString
		if err := rows.Scan(&taskID, &assignedDevice); err != nil {
			continue
		}
		reassignedTasks = append(reassignedTasks, struct {
			TaskID        string
			AssignedDevice sql.NullString
		}{TaskID: taskID, AssignedDevice: assignedDevice})
	}

	// Log reassigned tasks with device information
	if len(reassignedTasks) > 0 {
		for _, task := range reassignedTasks {
			deviceID := "unknown"
			if task.AssignedDevice.Valid {
				deviceID = task.AssignedDevice.String
			}
			log.Printf("TimeoutService: Task %s timed out (device: %s) - status changed to 'timeout'", task.TaskID, deviceID)
			
			// Log timeout to database if errorLogger is available
			if s.errorLogger != nil {
				s.errorLogger.LogError(ctx, "TASK_TIMEOUT", fmt.Errorf("task %s timed out", task.TaskID), SeverityWarning, map[string]interface{}{
					"task_id":   task.TaskID,
					"device_id": deviceID,
				})
			}
		}
		log.Printf("TimeoutService: Reassigned %d tasks due to timeout", len(reassignedTasks))
	}

	return nil
}

// StartTimeoutChecker starts a background goroutine to check timeouts
func (s *TimeoutService) StartTimeoutChecker(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.CheckTimeouts(ctx); err != nil {
				// Log error but continue
			}
		}
	}
}

