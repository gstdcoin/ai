package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"distributed-computing-platform/internal/models"
)

// GetDB returns the database connection (for use in routes)
func (s *TaskPaymentService) GetDB() *sql.DB {
	return s.db
}

// GetPendingTasks retrieves all tasks with 'queued' status
func (s *TaskPaymentService) GetPendingTasks(ctx context.Context) ([]*models.Task, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT task_id, creator_wallet, requester_address, task_type, status,
		       budget_gstd, reward_gstd, deposit_id, payment_memo, payload,
		       created_at, priority_score
		FROM tasks
		WHERE status = 'queued'
		ORDER BY created_at ASC
		LIMIT 100
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*models.Task
	for rows.Next() {
		var task models.Task
		var creatorWallet, depositID, paymentMemo, payload sql.NullString
		var budgetGSTD, rewardGSTD sql.NullFloat64

		err := rows.Scan(
			&task.TaskID,
			&creatorWallet,
			&task.RequesterAddress,
			&task.TaskType,
			&task.Status,
			&budgetGSTD,
			&rewardGSTD,
			&depositID,
			&paymentMemo,
			&payload,
			&task.CreatedAt,
			&task.PriorityScore,
		)
		if err != nil {
			continue
		}

		if creatorWallet.Valid {
			task.CreatorWallet = &creatorWallet.String
		}
		if budgetGSTD.Valid {
			task.BudgetGSTD = &budgetGSTD.Float64
		}
		if rewardGSTD.Valid {
			task.RewardGSTD = &rewardGSTD.Float64
		}
		if depositID.Valid {
			task.DepositID = &depositID.String
		}
		if paymentMemo.Valid {
			task.PaymentMemo = &paymentMemo.String
		}
		if payload.Valid {
			task.Payload = &payload.String
		}

		tasks = append(tasks, &task)
	}

	return tasks, rows.Err()
}

// SubmitWorkerResult processes worker result submission and triggers reward distribution
// SECURITY: Implements double-spending prevention and node validation
func (s *TaskPaymentService) SubmitWorkerResult(
	ctx context.Context,
	taskID string,
	nodeID string,
	walletAddress string,
	result json.RawMessage,
	rewardEngine *RewardEngine,
) error {
	// Use transaction to prevent race conditions and double-spending
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Get task with row-level lock (FOR UPDATE) to prevent concurrent submissions
	var task models.Task
	var creatorWallet, depositID, paymentMemo, payload sql.NullString
	var budgetGSTD, rewardGSTD sql.NullFloat64
	var currentStatus string
	var assignedDevice sql.NullString

	err = tx.QueryRowContext(ctx, `
		SELECT task_id, creator_wallet, requester_address, task_type, status,
		       budget_gstd, reward_gstd, deposit_id, payment_memo, payload,
		       created_at, priority_score, assigned_device
		FROM tasks
		WHERE task_id = $1
		FOR UPDATE
	`, taskID).Scan(
		&task.TaskID,
		&creatorWallet,
		&task.RequesterAddress,
		&task.TaskType,
		&currentStatus,
		&budgetGSTD,
		&rewardGSTD,
		&depositID,
		&paymentMemo,
		&payload,
		&task.CreatedAt,
		&task.PriorityScore,
		&assignedDevice,
	)

	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	// SECURITY: Prevent double-spending - check if task is already completed
	if currentStatus == "completed" {
		return fmt.Errorf("task %s is already completed - cannot submit result again (double-spending prevention)", taskID)
	}

	// Verify task is in queued status
	if currentStatus != "queued" {
		return fmt.Errorf("task is not in queued status (current: %s)", currentStatus)
	}

	// SECURITY: Verify node_id exists and matches wallet
	var nodeWalletAddress string
	err = tx.QueryRowContext(ctx, `
		SELECT wallet_address
		FROM nodes
		WHERE id = $1
	`, nodeID).Scan(&nodeWalletAddress)

	if err != nil {
		return fmt.Errorf("node %s not found or invalid", nodeID)
	}

	// SECURITY: Verify wallet address matches
	if nodeWalletAddress != walletAddress {
		return fmt.Errorf("wallet address mismatch: node belongs to different wallet")
	}

	// Update task status to completed and store result (atomic operation with WHERE status check)
	resultStr := string(result)
	resultExec, err := tx.ExecContext(ctx, `
		UPDATE tasks
		SET status = 'completed',
		    result_data = $1,
		    assigned_device = $2,
		    completed_at = NOW(),
		    updated_at = NOW()
		WHERE task_id = $3 AND status = 'queued'
	`, resultStr, nodeID, taskID)

	if err != nil {
		return fmt.Errorf("failed to update task: %w", err)
	}

	// SECURITY: Verify update actually happened (prevent race conditions)
	rowsAffected, err := resultExec.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to check rows affected: %w", err)
	}
	
	if rowsAffected == 0 {
		return fmt.Errorf("failed to update task status - task may have been completed by another worker (race condition prevented)")
	}

	// Commit transaction before triggering reward distribution
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Build task object for reward engine
	if creatorWallet.Valid {
		task.CreatorWallet = &creatorWallet.String
	}
	if budgetGSTD.Valid {
		task.BudgetGSTD = &budgetGSTD.Float64
	}
	if rewardGSTD.Valid {
		task.RewardGSTD = &rewardGSTD.Float64
	}
	task.Status = "completed"

	// Trigger reward distribution (async, after transaction commit)
	if rewardEngine != nil {
		go func() {
			// Use background context for async reward distribution
			bgCtx := context.Background()
			if err := rewardEngine.DistributeRewards(bgCtx, &task, walletAddress); err != nil {
				// Log error but don't fail the submission
				fmt.Printf("Error distributing rewards for task %s: %v\n", taskID, err)
			}
		}()
	}

	return nil
}

