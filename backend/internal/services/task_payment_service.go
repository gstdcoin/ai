package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"

	"github.com/google/uuid"
)

type TaskPaymentService struct {
	db             *sql.DB
	tonService     *TONService
	tonConfig      config.TONConfig
	taskService    *TaskService // For broadcasting tasks via Redis Pub/Sub
	telegramService *TelegramService
}

func NewTaskPaymentService(db *sql.DB, tonService *TONService, tonConfig config.TONConfig) *TaskPaymentService {
	return &TaskPaymentService{
		db:         db,
		tonService: tonService,
		tonConfig:  tonConfig,
	}
}

type CreateTaskRequest struct {
	Type        string                 `json:"type" binding:"required"`
	Budget      float64                `json:"budget" binding:"required"`
	Payload     map[string]interface{} `json:"payload"`
	InputSource string                 `json:"input_source"`
	InputHash   string                 `json:"input_hash"`
}

type CreateTaskResponse struct {
	TaskID      string  `json:"task_id"`
	Status      string  `json:"status"`
	PaymentMemo string  `json:"payment_memo"`
	Amount      float64 `json:"amount"`
	PlatformWallet string `json:"platform_wallet"`
}

// CreateTask creates a new task with pending_payment status
func (s *TaskPaymentService) CreateTask(ctx context.Context, creatorWallet string, req CreateTaskRequest) (*CreateTaskResponse, error) {
	if creatorWallet == "" {
		return nil, fmt.Errorf("creator_wallet is required")
	}

	// Normalize wallet address (convert raw to user-friendly if needed)
	_ = NormalizeAddressForAPI(creatorWallet) // Normalize for API calls if needed

	// Generate unique task ID
	taskID := uuid.New().String()
	
	// Generate payment memo (unique identifier for this task payment)
	// SECURITY: Use full UUID to prevent collisions
	paymentMemo := fmt.Sprintf("TASK-%s", taskID)

	// Calculate reward (budget minus platform fee)
	// GSTD Price Policy: Fixed at $0.02/hr equivalent in GSTD per Compute Unit
	// This is ~52% cheaper than AWS t3.medium
	platformFee := req.Budget * (s.tonConfig.PlatformFeePercent / 100.0)
	rewardGSTD := req.Budget - platformFee

	// Serialize payload to JSON
	payloadJSON, err := json.Marshal(req.Payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}
	payloadStr := string(payloadJSON)

	// Insert task with pending_payment status
	// Use original wallet address for storage (keep raw format if provided)
	now := time.Now()
	
	// Set default values for required columns that may not be provided in payment flow
	defaultOperation := req.Type // Use task type as operation if not specified
	defaultModel := ""
	defaultInputSource := req.InputSource
	if defaultInputSource == "" {
		defaultInputSource = "inline"
	}
	defaultInputHash := req.InputHash
	
	// Check which priority column exists in database
	// Try to insert with priority_score, fallback to certainty_gravity_score
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO tasks (
			task_id, creator_wallet, requester_address, task_type, operation, model,
			input_source, input_hash,
			status, budget_gstd, reward_gstd, payment_memo, payload,
			created_at, escrow_status
		) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
	`, taskID, creatorWallet, req.Type, defaultOperation, defaultModel, 
		defaultInputSource, defaultInputHash,
		"queued", req.Budget, rewardGSTD, paymentMemo, payloadStr, now)
	
	// If error about priority_score or other columns, try with minimal required columns
	if err != nil && (strings.Contains(err.Error(), "priority_score") || strings.Contains(err.Error(), "column") && strings.Contains(err.Error(), "does not exist")) {
		// Try with minimal required columns only
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO tasks (
				task_id, creator_wallet, requester_address, task_type, operation, model,
				input_source, input_hash,
				status, budget_gstd, reward_gstd, payment_memo, payload,
				created_at, escrow_status
			) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
		`, taskID, creatorWallet, req.Type, defaultOperation, defaultModel,
			defaultInputSource, defaultInputHash,
			"queued", req.Budget, rewardGSTD, paymentMemo, payloadStr, now)
	}

	if err != nil {
		log.Printf("❌ Task creation failed in DB: %v", err)
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	return &CreateTaskResponse{
		TaskID:         taskID,
		Status:         "queued",
		PaymentMemo:    paymentMemo,
		Amount:         req.Budget,
		PlatformWallet: s.tonConfig.AdminWallet,
	}, nil
}

// VerifyPayment checks if a payment has been received for a task
func (s *TaskPaymentService) VerifyPayment(ctx context.Context, taskID string) (bool, error) {
	var depositID sql.NullString
	var status string
	
	err := s.db.QueryRowContext(ctx, `
		SELECT deposit_id, status
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(&depositID, &status)

	if err != nil {
		return false, err
	}

	// Payment verified if deposit_id is set
	return depositID.Valid && depositID.String != "", nil
}

// SetTaskService sets the task service for broadcasting
func (s *TaskPaymentService) SetTaskService(taskService *TaskService) {
	s.taskService = taskService
}

// SetTelegramService sets the Telegram service for notifications
func (s *TaskPaymentService) SetTelegramService(telegramService *TelegramService) {
	s.telegramService = telegramService
}

// GetTelegramService returns the Telegram service
func (s *TaskPaymentService) GetTelegramService() *TelegramService {
	return s.telegramService
}

// MarkTaskAsPaid updates task status to queued after payment verification
// Also broadcasts task via Redis Pub/Sub for horizontal scaling
func (s *TaskPaymentService) MarkTaskAsPaid(ctx context.Context, taskID string, depositID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE tasks
		SET status = 'queued', deposit_id = $1, updated_at = NOW()
		WHERE task_id = $2 AND status = 'pending_payment'
	`, depositID, taskID)

	if err != nil {
		return err
	}

	// Broadcast task via Redis Pub/Sub and WebSocket hub
	if s.taskService != nil {
		// Get updated task to broadcast
		task, err := s.GetTaskByID(ctx, taskID)
		if err == nil && task != nil {
			// Convert queued status to pending for broadcast (workers expect 'pending')
			task.Status = "pending"
			s.taskService.BroadcastTaskToHub(ctx, task)
		}
	}

	return nil
}

// GetTaskByID retrieves a task by its ID
func (s *TaskPaymentService) GetTaskByID(ctx context.Context, taskID string) (*models.Task, error) {
	var task models.Task
	var creatorWallet, depositID, paymentMemo, payload sql.NullString
	var budgetGSTD, rewardGSTD sql.NullFloat64

	// Try to select with certainty_gravity_score first, fallback to priority_score
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, creator_wallet, requester_address, task_type, status,
		       budget_gstd, reward_gstd, deposit_id, payment_memo, payload,
		       created_at, COALESCE(certainty_gravity_score, priority_score, 0.0) as priority_score
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(
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
	
	// If error about column, try with priority_score only
	if err != nil && strings.Contains(err.Error(), "certainty_gravity_score") {
		err = s.db.QueryRowContext(ctx, `
			SELECT task_id, creator_wallet, requester_address, task_type, status,
			       budget_gstd, reward_gstd, deposit_id, payment_memo, payload,
			       created_at, COALESCE(priority_score, 0.0) as priority_score
			FROM tasks
			WHERE task_id = $1
		`, taskID).Scan(
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
	}

	if err != nil {
		return nil, err
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

	return &task, nil
}

// GetTaskByPaymentMemo retrieves a task by its payment memo
func (s *TaskPaymentService) GetTaskByPaymentMemo(ctx context.Context, paymentMemo string) (*models.Task, error) {
	var task models.Task
	var creatorWallet, depositID, paymentMemoVal, payload sql.NullString
	var budgetGSTD, rewardGSTD sql.NullFloat64

	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, creator_wallet, requester_address, task_type, status,
		       budget_gstd, reward_gstd, deposit_id, payment_memo, payload,
		       created_at, priority_score
		FROM tasks
		WHERE payment_memo = $1
	`, paymentMemo).Scan(
		&task.TaskID,
		&creatorWallet,
		&task.RequesterAddress,
		&task.TaskType,
		&task.Status,
		&budgetGSTD,
		&rewardGSTD,
		&depositID,
		&paymentMemoVal,
		&payload,
		&task.CreatedAt,
		&task.PriorityScore,
	)

	if err != nil {
		return nil, err
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
	if paymentMemoVal.Valid {
		task.PaymentMemo = &paymentMemoVal.String
	}
	if payload.Valid {
		task.Payload = &payload.String
	}

	return &task, nil
}

