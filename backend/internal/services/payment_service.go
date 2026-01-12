package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

type PaymentService struct {
	db          *sql.DB
	tonCfg      config.TONConfig
	tonService  *TONService // For checking contract balance
	nodeService *NodeService // For resolving node_id to wallet_address
}

func NewPaymentService(db *sql.DB, tonCfg config.TONConfig) *PaymentService {
	return &PaymentService{
		db:     db,
		tonCfg: tonCfg,
	}
}

// SetTONService sets the TON service for contract balance checks
func (s *PaymentService) SetTONService(tonService *TONService) {
	s.tonService = tonService
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
	Nonce            int64   `json:"nonce"` // Replay attack protection
	QueryID          *int64  `json:"query_id,omitempty"` // Transaction query ID for tracking
	IdempotencyKey   string  `json:"idempotency_key"` // For idempotent requests
}

// BuildPayoutIntent prepares a TonConnect-compatible pull transaction.
// PULL-MODEL: Executor signs and pays gas fees, escrow contract releases funds.
// Implements idempotency: if intent exists for task_id, returns existing one.
// Checks contract balance before creating intent.
func (s *PaymentService) BuildPayoutIntent(ctx context.Context, taskID string, executorAddress string) (*PayoutIntent, error) {
	// Start transaction for idempotency check
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Check if intent already exists (idempotency)
	var existingIntent struct {
		IdempotencyKey   string
		Nonce            int64
		QueryID          sql.NullInt64
		ExecutorReward   float64
		PlatformFee      float64
	}
	err = tx.QueryRowContext(ctx, `
		SELECT idempotency_key, nonce, query_id, executor_reward_ton, platform_fee_ton
		FROM payout_intents
		WHERE task_id = $1 AND executor_address = $2
	`, taskID, executorAddress).Scan(
		&existingIntent.IdempotencyKey,
		&existingIntent.Nonce,
		&existingIntent.QueryID,
		&existingIntent.ExecutorReward,
		&existingIntent.PlatformFee,
	)

	if err == nil {
		// Intent already exists - return existing one (idempotency)
		log.Printf("BuildPayoutIntent: Returning existing intent for task %s (idempotency)", taskID)
		
		// Get task info for response
		var task models.Task
		var assignedDevice sql.NullString
		err = tx.QueryRowContext(ctx, `
			SELECT task_id, assigned_device, labor_compensation_ton, status
			FROM tasks
			WHERE task_id = $1
		`, taskID).Scan(
			&task.TaskID, &assignedDevice, &task.LaborCompensationTon, &task.Status,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to get task info: %w", err)
		}

		executorRewardNano := int64(existingIntent.ExecutorReward * 1e9)
		platformFeeNano := int64(existingIntent.PlatformFee * 1e9)
		minGasFee := int64(10000000) // 0.01 TON

		var queryID *int64
		if existingIntent.QueryID.Valid {
			qid := existingIntent.QueryID.Int64
			queryID = &qid
		}

		intent := &PayoutIntent{
			ToAddress:       s.tonCfg.ContractAddress,
			AmountNano:      minGasFee,
			PayloadComment:  fmt.Sprintf("WITHDRAW|task:%s|exec:%s|fee:%d|reward:%d|nonce:%d", 
				taskID, executorAddress, platformFeeNano, executorRewardNano, existingIntent.Nonce),
			ExecutorReward:  existingIntent.ExecutorReward,
			PlatformFee:     existingIntent.PlatformFee,
			TaskID:          taskID,
			ExecutorAddress: executorAddress,
			Nonce:           existingIntent.Nonce,
			QueryID:        queryID,
			IdempotencyKey: existingIntent.IdempotencyKey,
		}

		tx.Commit()
		return intent, nil
	}

	// Intent doesn't exist - create new one
	var task models.Task
	var assignedDevice sql.NullString
	err = tx.QueryRowContext(ctx, `
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

	// Verify executor
	if !assignedDevice.Valid {
		return nil, fmt.Errorf("task not assigned to any device")
	}

	var nodeWalletAddress string
	err = tx.QueryRowContext(ctx, `
		SELECT wallet_address FROM nodes WHERE id = $1
	`, assignedDevice.String).Scan(&nodeWalletAddress)
	if err != nil {
		if assignedDevice.String != executorAddress {
			return nil, fmt.Errorf("executor mismatch: node not found or address mismatch")
		}
		nodeWalletAddress = executorAddress
	} else {
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

	// Convert to nanoTON for contract
	executorRewardNano := int64(executorReward * 1e9)
	platformFeeNano := int64(platformFee * 1e9)
	minGasFee := int64(10000000) // 0.01 TON
	totalRequiredNano := executorRewardNano + platformFeeNano + minGasFee

	// SECURITY: Check contract balance before creating intent
	if s.tonService == nil {
		return nil, fmt.Errorf("TON service not configured")
	}

	if s.tonCfg.ContractAddress == "" {
		return nil, fmt.Errorf("contract address not configured")
	}

	contractBalance, err := s.tonService.GetContractBalance(ctx, s.tonCfg.ContractAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to check contract balance: %w", err)
	}

	if contractBalance < totalRequiredNano {
		return nil, fmt.Errorf("insufficient contract balance: need %d nanoTON (%.9f TON), have %d nanoTON (%.9f TON)",
			totalRequiredNano, float64(totalRequiredNano)/1e9,
			contractBalance, float64(contractBalance)/1e9)
	}

	// Generate nonce (timestamp-based for now, will be replaced by contract nonce)
	nonce := time.Now().Unix()
	idempotencyKey := uuid.New().String()

	// Generate query_id (for transaction tracking)
	queryID := time.Now().UnixNano() / 1000 // Microseconds

	// Create intent in database
	_, err = tx.ExecContext(ctx, `
		INSERT INTO payout_intents (
			task_id, executor_address, idempotency_key, nonce, query_id,
			executor_reward_ton, platform_fee_ton
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, taskID, executorAddress, idempotencyKey, nonce, queryID, executorReward, platformFee)
	if err != nil {
		return nil, fmt.Errorf("failed to create payout intent: %w", err)
	}

	// Create payout transaction record
	_, err = tx.ExecContext(ctx, `
		INSERT INTO payout_transactions (
			task_id, executor_address, query_id, status,
			executor_reward_ton, platform_fee_ton, nonce
		) VALUES ($1, $2, $3, 'pending', $4, $5, $6)
	`, taskID, executorAddress, queryID, executorReward, platformFee, nonce)
	if err != nil {
		return nil, fmt.Errorf("failed to create payout transaction: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	intent := &PayoutIntent{
		ToAddress:       s.tonCfg.ContractAddress,
		AmountNano:      minGasFee,
		PayloadComment:  fmt.Sprintf("WITHDRAW|task:%s|exec:%s|fee:%d|reward:%d|nonce:%d", 
			taskID, executorAddress, platformFeeNano, executorRewardNano, nonce),
		ExecutorReward:  executorReward,
		PlatformFee:     platformFee,
		TaskID:          taskID,
		ExecutorAddress: executorAddress,
		Nonce:           nonce,
		QueryID:         &queryID,
		IdempotencyKey:  idempotencyKey,
	}

	log.Printf("BuildPayoutIntent: Created new intent for task %s (query_id: %d, balance: %d nanoTON)",
		taskID, queryID, contractBalance)

	return intent, nil
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




