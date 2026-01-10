package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"fmt"
)

type PaymentService struct {
	db         *sql.DB
	tonCfg     config.TONConfig
	nodeService *NodeService // For resolving node_id to wallet_address
}

func NewPaymentService(db *sql.DB, tonCfg config.TONConfig) *PaymentService {
	return &PaymentService{
		db:    db,
		tonCfg: tonCfg,
	}
}

// SetNodeService sets the node service for resolving node IDs to wallet addresses
func (s *PaymentService) SetNodeService(nodeService *NodeService) {
	s.nodeService = nodeService
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
// PULL-MODEL: Executor signs and pays gas fees, escrow contract releases funds.
// Does not move funds itself; safe to call repeatedly (idempotent).
func (s *PaymentService) BuildPayoutIntent(ctx context.Context, taskID string, executorAddress string) (*PayoutIntent, error) {
	var task models.Task
	var assignedDevice sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, assigned_device, labor_compensation_ton, status, requester_address
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(
		&task.TaskID, &assignedDevice, &task.LaborCompensationTon, &task.Status, &task.RequesterAddress,
	)
	if err != nil {
		return nil, fmt.Errorf("task lookup failed: %w", err)
	}

	if task.Status != "validated" && task.Status != "completed" {
		return nil, fmt.Errorf("task not validated yet")
	}

	// Verify executor: assigned_device is node_id, need to get wallet_address from nodes table
	if !assignedDevice.Valid {
		return nil, fmt.Errorf("task not assigned to any device")
	}

	// Get wallet address from node_id
	var nodeWalletAddress string
	err = s.db.QueryRowContext(ctx, `
		SELECT wallet_address FROM nodes WHERE id = $1
	`, assignedDevice.String).Scan(&nodeWalletAddress)
	if err != nil {
		// Fallback: if node not found, check if executorAddress matches assigned_device directly
		// (for backward compatibility or if executorAddress is already node_id)
		if assignedDevice.String != executorAddress {
			return nil, fmt.Errorf("executor mismatch: node not found or address mismatch")
		}
		// If node not found but addresses match, allow it (backward compatibility)
		nodeWalletAddress = executorAddress
	} else {
		// Normalize addresses for comparison (remove dashes, case-insensitive)
		normalizedExecutor := normalizeAddress(executorAddress)
		normalizedNode := normalizeAddress(nodeWalletAddress)
		if normalizedExecutor != normalizedNode {
			return nil, fmt.Errorf("executor mismatch: wallet address does not match assigned device")
		}
	}

	platformFee := task.LaborCompensationTon * (s.tonCfg.PlatformFeePercent / 100.0)
	executorReward := task.LaborCompensationTon - platformFee
	if executorReward <= 0 {
		return nil, fmt.Errorf("invalid reward amount")
	}

	// PULL-MODEL: Executor pays gas fees (AmountNano = 0.01 TON minimum for contract call)
	// Escrow contract holds the funds and releases them when executor claims
	// Frontend will use TonConnect to sign and send this transaction
	// Executor's wallet pays gas, escrow contract sends executor reward + platform fee
	
	// Convert to nanoTON for contract
	executorRewardNano := int64(executorReward * 1e9)
	platformFeeNano := int64(platformFee * 1e9)
	
	// Minimum gas fee executor needs to pay (0.01 TON)
	minGasFee := int64(10000000) // 0.01 TON in nanotons

	return &PayoutIntent{
		ToAddress:       s.tonCfg.ContractAddress, // Escrow contract address
		AmountNano:      minGasFee,                  // Executor pays gas (minimum 0.01 TON)
		PayloadComment:  fmt.Sprintf("WITHDRAW|task:%s|exec:%s|fee:%d|reward:%d", 
			taskID, executorAddress, platformFeeNano, executorRewardNano),
		ExecutorReward:  executorReward,
		PlatformFee:     platformFee,
		TaskID:          taskID,
		ExecutorAddress: executorAddress,
	}, nil
}

// normalizeAddress normalizes TON address for comparison (removes dashes, converts to uppercase)
func normalizeAddress(addr string) string {
	normalized := ""
	for _, c := range addr {
		if c != '-' {
			if c >= 'a' && c <= 'z' {
				normalized += string(c - 32) // Convert to uppercase
			} else {
				normalized += string(c)
			}
		}
	}
	return normalized
}

// CommissionBalance represents accumulated platform commission
type CommissionBalance struct {
	TotalCommission float64 `json:"total_commission"` // Total accumulated commission in TON
	PendingTasks    int     `json:"pending_tasks"`     // Number of tasks with pending commission
	ClaimedTasks    int     `json:"claimed_tasks"`     // Number of tasks with claimed commission
}

// GetCommissionBalance calculates total accumulated commission for admin
func (s *PaymentService) GetCommissionBalance(ctx context.Context) (*CommissionBalance, error) {
	var totalCommission float64
	var pendingTasks, claimedTasks int

	// Calculate total commission from completed tasks
	err := s.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(SUM(platform_fee_ton), 0) as total_commission,
			COUNT(*) FILTER (WHERE executor_payout_status IS NULL OR executor_payout_status = 'pending') as pending_tasks,
			COUNT(*) FILTER (WHERE executor_payout_status = 'completed') as claimed_tasks
		FROM tasks
		WHERE status IN ('validated', 'completed')
		  AND platform_fee_ton > 0
	`).Scan(&totalCommission, &pendingTasks, &claimedTasks)

	if err != nil {
		return nil, fmt.Errorf("failed to calculate commission balance: %w", err)
	}

	return &CommissionBalance{
		TotalCommission: totalCommission,
		PendingTasks:    pendingTasks,
		ClaimedTasks:    claimedTasks,
	}, nil
}




