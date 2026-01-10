package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// TimeoutService handles task timeouts and reassignment
type TimeoutService struct {
	db *sql.DB
}

func NewTimeoutService(db *sql.DB) *TimeoutService {
	return &TimeoutService{
		db: db,
	}
}

// CheckTimeouts checks for timed out tasks and reassigns them
func (s *TimeoutService) CheckTimeouts(ctx context.Context) error {
	// Find tasks that are assigned but haven't been updated in timeout period
	timeoutDuration := 5 * time.Minute // 5 minutes timeout for execution
	
	// SECURITY: Use parameterized query to prevent SQL injection
	query := `
		UPDATE tasks 
		SET status = 'pending', 
		    assigned_at = NULL,
		    assigned_device = NULL,
		    timeout_at = NULL
		WHERE status = 'assigned' 
		  AND (timeout_at < NOW() OR (assigned_at < NOW() - INTERVAL '1 second' * $1 AND timeout_at IS NULL))
		RETURNING task_id
	`
	
	rows, err := s.db.QueryContext(ctx, query, int(timeoutDuration.Seconds()))
	if err != nil {
		return err
	}
	defer rows.Close()

	var reassignedTasks []string
	for rows.Next() {
		var taskID string
		if err := rows.Scan(&taskID); err != nil {
			continue
		}
		reassignedTasks = append(reassignedTasks, taskID)
	}

	// Log reassigned tasks
	if len(reassignedTasks) > 0 {
		// Could emit event or log here
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

