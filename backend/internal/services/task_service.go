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
	redisStreams      *RedisStreamsService
	redisPubSub       *RedisPubSubService // Redis Pub/Sub for horizontal scaling
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
	s.hub = hub
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
			"labor_compensation":   task.LaborCompensationTon,
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
	if s.hub != nil {
		// Use type assertion to call BroadcastTask
		// This avoids circular import between api and services
		if hub, ok := s.hub.(interface {
			BroadcastTask(*models.Task)
		}); ok {
			hub.BroadcastTask(task)
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
	gravityScore := s.gravityService.CalculateEGS(descriptor.Reward.AmountTon, gstdBalance, entropy)

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

	finalCompensation := s.efficiencyService.CalculateTaskCost(descriptor.Reward.AmountTon, gstdBalance)
	confidenceDepth := int(math.Floor(1 + math.Log10(1+gstdBalance/10000.0)))

	// Insert task - try with certainty_gravity_score first (priority_score was renamed)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO tasks (
			task_id, requester_address, task_type, operation, model,
			labor_compensation_ton, certainty_gravity_score, status, created_at,
			escrow_status, min_trust_score, is_private, confidence_depth, 
			redundancy_factor, is_spot_check, entropy_snapshot
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'awaiting', $9, $10, $11, $12, $13, $14)
	`, taskID, requesterAddress, descriptor.TaskType, descriptor.Operation, descriptor.Model,
		finalCompensation, gravityScore, "awaiting_escrow",
		descriptor.MinTrust, descriptor.IsPrivate, confidenceDepth, redundancy, isSpotCheck, entropy)
	
	// If error about certainty_gravity_score, try with priority_score
	if err != nil && (strings.Contains(err.Error(), "certainty_gravity_score") || 
		(strings.Contains(err.Error(), "column") && strings.Contains(err.Error(), "does not exist"))) {
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO tasks (
				task_id, requester_address, task_type, operation, model,
				labor_compensation_ton, priority_score, status, created_at,
				escrow_status, min_trust_score, is_private, confidence_depth, 
				redundancy_factor, is_spot_check, entropy_snapshot
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'awaiting', $9, $10, $11, $12, $13, $14)
		`, taskID, requesterAddress, descriptor.TaskType, descriptor.Operation, descriptor.Model,
			finalCompensation, gravityScore, "awaiting_escrow",
			descriptor.MinTrust, descriptor.IsPrivate, confidenceDepth, redundancy, isSpotCheck, entropy)
	}
	
	if err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	task := &models.Task{
		TaskID:              taskID,
		RequesterAddress:    requesterAddress,
		LaborCompensationTon: finalCompensation,
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

	return task, err
}

func (s *TaskService) GetTasks(ctx context.Context, requesterAddress *string) ([]*models.Task, error) {
	query := `
		SELECT task_id, requester_address, task_type, operation, model,
		       labor_compensation_ton, COALESCE(priority_score, 0.0) as gravity_score, status, created_at,
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
			&t.LaborCompensationTon, &t.PriorityScore, &t.Status, &t.CreatedAt,
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
	
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, requester_address, task_type, operation, model,
		       labor_compensation_ton, 
		       COALESCE(certainty_gravity_score, priority_score, 0.0) as gravity_score,
		       status, created_at, completed_at,
		       escrow_status, confidence_depth, assigned_device, min_trust_score
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(
		&t.TaskID, &t.RequesterAddress, &t.TaskType, &t.Operation, &t.Model,
		&t.LaborCompensationTon, &gravityScore,
		&t.Status, &t.CreatedAt, &t.CompletedAt,
		&t.EscrowStatus, &t.ConfidenceDepth, &t.AssignedDevice, &t.MinTrustScore,
	)
	
	if err != nil {
		return nil, err
	}
	
	if gravityScore.Valid {
		t.PriorityScore = gravityScore.Float64
	} else {
		t.PriorityScore = 0.0
	}
	
	return &t, nil
}
