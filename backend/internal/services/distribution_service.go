package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"fmt"
)

// DistributionService handles automatic reward distribution and platform fees
type DistributionService struct {
	db         *sql.DB
	tonConfig  config.TONConfig
	payment    *PaymentService
}

func NewDistributionService(db *sql.DB, tonConfig config.TONConfig, payment *PaymentService) *DistributionService {
	return &DistributionService{
		db:        db,
		tonConfig: tonConfig,
		payment:   payment,
	}
}

// ProcessTaskCompletion triggers automatic distribution after validation
func (s *DistributionService) ProcessTaskCompletion(ctx context.Context, taskID string) error {
	// 1. Get task and validation status
	var status, escrowStatus string
	var rewardAmount float64
	var requester string

	err := s.db.QueryRowContext(ctx, `
		SELECT status, escrow_status, labor_compensation_ton, requester_address 
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(&status, &escrowStatus, &rewardAmount, &requester)
	if err != nil {
		return err
	}

	if status != "validated" {
		return fmt.Errorf("task not validated yet, current status: %s", status)
	}

	if escrowStatus != "locked" {
		return fmt.Errorf("funds not locked in escrow, current status: %s", escrowStatus)
	}

	// 2. Get all successful executors for this task
	rows, err := s.db.QueryContext(ctx, `
		SELECT device_id FROM task_assignments 
		WHERE task_id = $1 AND validation_status = 'passed'
	`, taskID)
	if err != nil {
		return err
	}
	defer rows.Close()

	var executors []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			executors = append(executors, id)
		}
	}

	if len(executors) == 0 {
		return fmt.Errorf("no valid executors found for task")
	}

	// 3. Calculate shares
	// Platform takes fixed % from total pool
	platformFee := rewardAmount * (s.tonConfig.PlatformFeePercent / 100.0)
	netRewardPool := rewardAmount - platformFee

	// 4. Payments are handled via pull-model (executors claim via escrow contract)
	// No direct payment processing needed - executors call BuildPayoutIntent and claim via TonConnect
	// Platform fee is handled by the escrow contract automatically
	// Each executor can claim their share via the escrow contract
	_ = netRewardPool // Keep for future use if needed

	// 5. Update final status
	_, err = s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'completed',
		    escrow_status = 'distributed',
		    platform_fee_ton = $1,
		    executor_reward_ton = $2,
		    completed_at = NOW()
		WHERE task_id = $3
	`, platformFee, netRewardPool, taskID)

	return err
}

// HandleRefund processes automatic refund if task expires
func (s *DistributionService) HandleRefund(ctx context.Context, taskID string) error {
	var escrowStatus string
	var rewardAmount float64
	var requester string

	err := s.db.QueryRowContext(ctx, `
		SELECT escrow_status, labor_compensation_ton, requester_address 
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(&escrowStatus, &rewardAmount, &requester)
	if err != nil {
		return err
	}

	if escrowStatus != "locked" {
		return fmt.Errorf("task cannot be refunded, escrow status: %s", escrowStatus)
	}

	// Refunds are handled via escrow contract or manual process
	// For now, mark as refunded - actual refund would be via contract or manual process

	_, err = s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'failed',
		    escrow_status = 'refunded'
		WHERE task_id = $1
	`, taskID)

	return err
}

