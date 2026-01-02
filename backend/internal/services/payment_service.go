package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"fmt"
)

type PaymentService struct {
	db    *sql.DB
	tonCfg config.TONConfig
}

func NewPaymentService(db *sql.DB, tonCfg config.TONConfig) *PaymentService {
	return &PaymentService{
		db:    db,
		tonCfg: tonCfg,
	}
}

// PayoutIntent describes a TonConnect pull-model transaction executor will sign
// Executor pays gas; transfer happens via escrow contract (tonCfg.ContractAddress).
type PayoutIntent struct {
	ToAddress        string  `json:"to_address"`
	AmountNano       int64   `json:"amount_nano"` // usually 0; contract releases escrow
	PayloadComment   string  `json:"payload_comment"`
	ExecutorReward   float64 `json:"executor_reward_ton"`
	PlatformFee      float64 `json:"platform_fee_ton"`
	TaskID           string  `json:"task_id"`
	ExecutorAddress  string  `json:"executor_address"`
}

// BuildPayoutIntent prepares a TonConnect-compatible pull transaction.
// Does not move funds itself; safe to call repeatedly (idempotent).
func (s *PaymentService) BuildPayoutIntent(ctx context.Context, taskID string, executorAddress string) (*PayoutIntent, error) {
	var task models.Task
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, assigned_device, labor_compensation_ton, status
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(
		&task.TaskID, &task.AssignedDevice, &task.LaborCompensationTon, &task.Status,
	)
	if err != nil {
		return nil, fmt.Errorf("task lookup failed: %w", err)
	}

	if task.Status != "validated" && task.Status != "completed" {
		return nil, fmt.Errorf("task not validated yet")
	}

	if task.AssignedDevice == nil || *task.AssignedDevice != executorAddress {
		return nil, fmt.Errorf("executor mismatch")
	}

	platformFee := task.LaborCompensationTon * (s.tonCfg.PlatformFeePercent / 100.0)
	executorReward := task.LaborCompensationTon - platformFee
	if executorReward <= 0 {
		return nil, fmt.Errorf("invalid reward amount")
	}

	// Payload comment for contract to parse. Frontend will convert to cell payload for TonConnect.
	payloadComment := fmt.Sprintf("WITHDRAW|task:%s|exec:%s|fee:%f|reward:%f", taskID, executorAddress, platformFee, executorReward)

	return &PayoutIntent{
		ToAddress:       s.tonCfg.ContractAddress,
		AmountNano:      0, // executor only pays gas; escrow holds funds
		PayloadComment:  payloadComment,
		ExecutorReward:  executorReward,
		PlatformFee:     platformFee,
		TaskID:          taskID,
		ExecutorAddress: executorAddress,
	}, nil
}



