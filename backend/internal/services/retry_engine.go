package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/redis/go-redis/v9"
)

// RetryEngine handles failed tasks with exponential backoff
type RetryEngine struct {
	db    *sql.DB
	redis *redis.Client
}

func NewRetryEngine(db *sql.DB, rdb *redis.Client) *RetryEngine {
	return &RetryEngine{db: db, redis: rdb}
}

// HandleTaskFailure processes a failed task execution
func (re *RetryEngine) HandleTaskFailure(ctx context.Context, taskID string, reason string) error {
	log.Printf("⚠️ Task %s failed: %s. Initiating retry logic...", taskID, reason)

	// 1. Get current retry count
	var retryCount int
	var maxRetries int = 3 // Hardcoded policy for now
	
	err := re.db.QueryRowContext(ctx, "SELECT retry_count FROM tasks WHERE task_id = $1", taskID).Scan(&retryCount)
	if err != nil {
		return fmt.Errorf("failed to fetch task metadata: %w", err)
	}

	if retryCount >= maxRetries {
		return re.moveToDeadLetterQueue(ctx, taskID, reason)
	}

	// 2. Calculate Backoff (Exponential: 1s, 5s, 30s)
	backoffSeconds := math.Pow(5, float64(retryCount))
	nextAttempt := time.Now().Add(time.Duration(backoffSeconds) * time.Second)

	// 3. Reschedule
	tx, err := re.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'queued', 
		    retry_count = retry_count + 1,
		    executor_address = NULL, -- Unassign existing worker
		    updated_at = NOW() 
		WHERE task_id = $1
	`, taskID)
	if err != nil {
		tx.Rollback()
		return err
	}

	// Add to Redis delayed queue (zset)
	err = re.redis.ZAdd(ctx, "tasks:retry_queue", redis.Z{
		Score:  float64(nextAttempt.Unix()),
		Member: taskID,
	}).Err()
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (re *RetryEngine) moveToDeadLetterQueue(ctx context.Context, taskID, reason string) error {
	log.Printf("❌ Task %s moved to DLQ (Max retries exceeded)", taskID)
	
	_, err := re.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'failed', 
		    last_error = $2,
		    completed_at = NOW()
		WHERE task_id = $1
	`, taskID, reason)
	
	if err == nil {
		// Notify admins or trigger alert
		// notifications.SendDLQAlert(taskID, reason)
	}
	return err
}
