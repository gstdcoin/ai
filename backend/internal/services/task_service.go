package services

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
	"fmt"
	"log"
	"math"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type TaskService struct {
	db                *sql.DB
	queue             *redis.Client
	tonService        *TONService
	tonConfig         config.TONConfig
	efficiencyService *EfficiencyService
	gravityService    *HardenedGravityService
	entropyService    *EntropyService
	hub               interface{} // *api.WSHub (avoid circular import)
	hubMu             sync.RWMutex // Protects hub from race conditions
	redisStreams      *RedisStreamsService
	redisPubSub       *RedisPubSubService // Redis Pub/Sub for horizontal scaling
	telegramService   *TelegramService
}

func NewTaskService(db *sql.DB, queue *redis.Client, tonService *TONService, tonConfig config.TONConfig) *TaskService {
	return &TaskService{
		db:                db,
		queue:             queue,
		tonService:        tonService,
		tonConfig:         tonConfig,
		efficiencyService: NewEfficiencyService(),
		gravityService:    NewHardenedGravityService(db, queue),
		entropyService:    NewEntropyService(db),
		redisStreams:      NewRedisStreamsService(queue),
		redisPubSub:        NewRedisPubSubService(queue),
	}
}

// SetHub sets the WebSocket hub for broadcasting tasks
func (s *TaskService) SetHub(hub interface{}) {
	s.hubMu.Lock()
	defer s.hubMu.Unlock()
	s.hub = hub
}

// SetTelegramService sets the Telegram service for notifications
func (s *TaskService) SetTelegramService(telegramService *TelegramService) {
	s.telegramService = telegramService
}

// GetRedisPubSub returns the Redis Pub/Sub service
func (s *TaskService) GetRedisPubSub() *RedisPubSubService {
	return s.redisPubSub
}

// BroadcastTaskToHub broadcasts a task to WebSocket hub when status becomes 'pending'
// Also publishes to Redis Pub/Sub for horizontal scaling
func (s *TaskService) BroadcastTaskToHub(ctx context.Context, task *models.Task) {
	// Publish to Redis Pub/Sub first (for horizontal scaling)
	// Publish for both 'pending' and 'queued' status (queued is used in new payment flow)
	if s.redisPubSub != nil && (task.Status == "pending" || task.Status == "queued") {
		payload := map[string]interface{}{
			"task_id":              task.TaskID,
			"requester_address":    task.RequesterAddress,
			"task_type":            task.TaskType,
			"operation":            task.Operation,
			"labor_compensation":   task.LaborCompensationGSTD,
			"gravity_score":        task.PriorityScore,
			"min_trust_score":      task.MinTrustScore,
			"redundancy_factor":   task.RedundancyFactor,
			"confidence_depth":     task.ConfidenceDepth,
		}
		if err := s.redisPubSub.PublishTask(ctx, task.TaskID, task.TaskType, task.Status, payload); err != nil {
			log.Printf("⚠️  Failed to publish task to Redis Pub/Sub: %v", err)
			// Continue to local hub broadcast even if Redis fails
		}
	}
	
	// Also broadcast to local WebSocket hub (for this server instance)
	// Use RWMutex to prevent race conditions
	s.hubMu.RLock()
	hub := s.hub
	s.hubMu.RUnlock()
	
	if hub != nil {
		// Use type assertion to call BroadcastTask
		// This avoids circular import between api and services
		if h, ok := hub.(interface {
			BroadcastTask(*models.Task)
		}); ok {
			h.BroadcastTask(task)
		}
	}
}

func (s *TaskService) CreateTask(ctx context.Context, requesterAddress string, descriptor *models.TaskDescriptor) (*models.Task, error) {
	taskID := uuid.New().String()
	descriptor.TaskID = taskID

	// NOTE: GSTD balance check is currently disabled per user request
	// Users can create tasks without GSTD tokens
	// GSTD balance is set to 0.0, which affects:
	//   - EGS calculation (gravity score may be lower)
	//   - Confidence depth calculation (always 1 with balance 0)
	// If GSTD support is needed in future, restore balance check here
	gstdBalance := 0.0
	
	entropy, _ := s.entropyService.GetEntropy(ctx, descriptor.Operation)

	// Physics-based Gravity Score (EGS v3)
	gravityScore := s.gravityService.CalculateEGS(descriptor.Reward.AmountGSTD, gstdBalance, entropy)

	// Dynamic Redundancy Factor
	redundancy := s.gravityService.CalculateDynamicRedundancy(entropy, 0.9)
	isSpotCheck := s.gravityService.ShouldPerformSpotCheck(redundancy)
	if isSpotCheck {
		redundancy = 2
	}

	// Cold-Start Protection (first 1000 tasks)
	var totalExecs int64
	s.db.QueryRowContext(ctx, "SELECT total_executions FROM operation_entropy WHERE operation_id = $1", descriptor.Operation).Scan(&totalExecs)
	if totalExecs < 1000 {
		redundancy = 3
	}

	finalCompensation := s.efficiencyService.CalculateTaskCost(descriptor.Reward.AmountGSTD, gstdBalance)
	confidenceDepth := int(math.Floor(1 + math.Log10(1+gstdBalance/10000.0)))

    // REAL ESCROW LOGIC (Atomic Transaction)
    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil {
        return nil, fmt.Errorf("failed to begin transaction: %w", err)
    }
    defer tx.Rollback()

    // 1. Deduct from User Balance & Add to Escrow
    // Check if user has enough funds (cost + fee)
    // Assuming totalCost and platformFee are calculated elsewhere or need to be added here.
    // For now, using descriptor.Reward.AmountGSTD as the base cost.
    // The instruction implies `totalCost` and `platformFee` variables exist or should be defined.
    // Let's define them based on the previous logic.
    platformFee := descriptor.Reward.AmountGSTD * 0.05 // 5% platform fee
    totalCost := descriptor.Reward.AmountGSTD + platformFee

    res, err := tx.ExecContext(ctx, `
        UPDATE users 
        SET gstd_balance = gstd_balance - $1, 
            gstd_escrow_balance = COALESCE(gstd_escrow_balance, 0) + $1
        WHERE wallet_address = $2 AND gstd_balance >= $1
    `, totalCost, requesterAddress)
    if err != nil {
        return nil, fmt.Errorf("failed to process escrow: %w", err)
    }
    
    rows, _ := res.RowsAffected()
    if rows == 0 {
        return nil, fmt.Errorf("INSUFFICIENT FUNDS: You need %.4f GSTD (Budget + 5%% Fee) to create this task.", totalCost)
    }

	// 2. Insert task
	_, err = tx.ExecContext(ctx, `
		INSERT INTO tasks (
			task_id, requester_address, task_type, operation, model,
			labor_compensation_gstd, platform_fee_gstd, certainty_gravity_score, status, created_at,
			escrow_status, min_trust_score, is_private, confidence_depth, 
			redundancy_factor, is_spot_check, entropy_snapshot
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'awaiting_escrow', NOW(), 'locked', $9, $10, $11, $12, $13, $14)
	`, taskID, requesterAddress, descriptor.TaskType, descriptor.Operation, descriptor.Model,
		descriptor.Reward.AmountGSTD, platformFee, gravityScore,
		descriptor.MinTrust, descriptor.IsPrivate, confidenceDepth, redundancy, isSpotCheck, entropy)
	
    // Retry with 'priority_score' if 'certainty_gravity_score' fails (DB Schema Compatibility)
	if err != nil && (strings.Contains(err.Error(), "certainty_gravity_score") || 
		(strings.Contains(err.Error(), "column") && strings.Contains(err.Error(), "does not exist"))) {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO tasks (
				task_id, requester_address, task_type, operation, model,
				labor_compensation_gstd, platform_fee_gstd, priority_score, status, created_at,
				escrow_status, min_trust_score, is_private, confidence_depth, 
				redundancy_factor, is_spot_check, entropy_snapshot
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'awaiting_escrow', NOW(), 'locked', $9, $10, $11, $12, $13, $14)
		`, taskID, requesterAddress, descriptor.TaskType, descriptor.Operation, descriptor.Model,
			descriptor.Reward.AmountGSTD, platformFee, gravityScore,
			descriptor.MinTrust, descriptor.IsPrivate, confidenceDepth, redundancy, isSpotCheck, entropy)
	}

    if err != nil {
        return nil, fmt.Errorf("failed to create task record: %w", err)
    }

    if err := tx.Commit(); err != nil {
        return nil, fmt.Errorf("failed to commit transaction: %w", err)
    }

    log.Printf("💰 Task %s Created: Deducted %.4f GSTD from %s. Status: ESCROW_LOCKED", 
        taskID, totalCost, requesterAddress)

	task := &models.Task{
		TaskID:              taskID,
		RequesterAddress:    requesterAddress,
		LaborCompensationGSTD: finalCompensation,
		PriorityScore:        gravityScore,
		Status:              "awaiting_escrow",
		MinTrustScore:       descriptor.MinTrust,
		IsPrivate:           descriptor.IsPrivate,
		RedundancyFactor:    redundancy,
		ConfidenceDepth:     confidenceDepth,
		IsSpotCheck:         isSpotCheck,
	}

	// Publish task to Redis Streams for distribution
	if s.redisStreams != nil {
		taskData := map[string]interface{}{
			"task_id":              task.TaskID,
			"requester_address":    task.RequesterAddress,
			"task_type":            descriptor.TaskType,
			"operation":            descriptor.Operation,
			"labor_compensation":   finalCompensation,
			"gravity_score":        gravityScore,
			"min_trust_score":       descriptor.MinTrust,
			"redundancy_factor":    redundancy,
			"confidence_depth":     confidenceDepth,
		}
		if err := s.redisStreams.PublishTask(ctx, task.TaskID, taskData); err != nil {
			// Log error but don't fail task creation
			// Task will be available via polling if stream fails
		}
	}

	// Broadcast task via WebSocket when status becomes 'pending' (after escrow)
	// Note: Task starts as 'awaiting_escrow', will be broadcast when status changes to 'pending'
	// The broadcast will happen automatically when escrow is confirmed via the escrow service
	// For immediate availability, we also broadcast to Redis Streams (done above)
	
	// If task is already in 'pending' status (shouldn't happen, but safety check)
	if task.Status == "pending" {
		s.BroadcastTaskToHub(ctx, task)
	}

	// Send Telegram notification about new task
	if s.telegramService != nil {
		go func() {
			bgCtx := context.Background()
			if err := s.telegramService.NotifyNewTask(
				bgCtx,
				task.TaskID,
				descriptor.TaskType,
				requesterAddress,
				finalCompensation,
			); err != nil {
				log.Printf("Failed to send Telegram notification for new task: %v", err)
			}
		}()
	}

	return task, err
}

func (s *TaskService) GetTasks(ctx context.Context, requesterAddress *string) ([]*models.Task, error) {
	query := `
		SELECT task_id, requester_address, task_type, operation, model,
		       labor_compensation_gstd, COALESCE(priority_score, 0.0) as gravity_score, status, created_at,
		       COALESCE(escrow_status, 'none') as escrow_status, COALESCE(confidence_depth, 0) as confidence_depth
		FROM tasks
	`
	var args []interface{}
	if requesterAddress != nil {
		query += " WHERE requester_address = $1"
		args = append(args, *requesterAddress)
	}
	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*models.Task
	for rows.Next() {
		var t models.Task
		err := rows.Scan(
			&t.TaskID, &t.RequesterAddress, &t.TaskType, &t.Operation, &t.Model,
			&t.LaborCompensationGSTD, &t.PriorityScore, &t.Status, &t.CreatedAt,
			&t.EscrowStatus, &t.ConfidenceDepth,
		)
		if err != nil {
			continue
		}
		tasks = append(tasks, &t)
	}
	return tasks, nil
}

// GetTaskByID retrieves a single task by its ID
func (s *TaskService) GetTaskByID(ctx context.Context, taskID string) (*models.Task, error) {
	var t models.Task
	var gravityScore sql.NullFloat64
	var assignedAt, completedAt, timeoutAt sql.NullTime
	var assignedDevice sql.NullString
	
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, requester_address, task_type, operation, model,
		       labor_compensation_gstd, 
		       COALESCE(priority_score, 0.0) as gravity_score,
		       status, created_at, 
		       assigned_at, completed_at, timeout_at,
		       COALESCE(escrow_status, 'none') as escrow_status, 
		       COALESCE(confidence_depth, 0) as confidence_depth, 
		       assigned_device, 
		       COALESCE(min_trust_score, 0.0) as min_trust_score
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(
		&t.TaskID, &t.RequesterAddress, &t.TaskType, &t.Operation, &t.Model,
		&t.LaborCompensationGSTD, &gravityScore,
		&t.Status, &t.CreatedAt,
		&assignedAt, &completedAt, &timeoutAt,
		&t.EscrowStatus, &t.ConfidenceDepth, &assignedDevice, &t.MinTrustScore,
	)
	
	if err != nil {
		return nil, err
	}
	
	// Handle nullable fields
	if gravityScore.Valid {
		t.PriorityScore = gravityScore.Float64
	} else {
		t.PriorityScore = 0.0
	}
	
	if assignedAt.Valid {
		t.AssignedAt = &assignedAt.Time
	}
	
	if completedAt.Valid {
		t.CompletedAt = &completedAt.Time
	}
	
	if timeoutAt.Valid {
		t.TimeoutAt = &timeoutAt.Time
	}
	
	if assignedDevice.Valid {
		t.AssignedDevice = &assignedDevice.String
	}
	
	return &t, nil
}
