package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// TaskOrchestrator handles dynamic task scheduling and distribution
// Implements priority queue, load balancing, and retry logic
type TaskOrchestrator struct {
	db           *sql.DB
	redis        *redis.Client
	powService   *ProofOfWorkService
	mutex        sync.RWMutex
	
	// Configuration
	maxRetries         int
	retryBackoff       []time.Duration
	workerCapacity     map[string]int  // workerWallet -> active task count
	maxTasksPerWorker  int
	
	// Channels for async processing
	taskQueue     chan *TaskQueueItem
	resultQueue   chan *TaskResult
	stopChan      chan struct{}
}

// TaskQueueItem represents a task in the priority queue
type TaskQueueItem struct {
	TaskID          string    `json:"task_id"`
	TaskType        string    `json:"task_type"`
	Operation       string    `json:"operation"`
	Priority        int       `json:"priority"`        // 1=critical, 2=high, 3=normal, 4=low
	RewardGSTD      float64   `json:"reward_gstd"`
	CreatedAt       time.Time `json:"created_at"`
	Deadline        time.Time `json:"deadline"`
	RequiredCPU     int       `json:"required_cpu"`
	RequiredRAMGB   float64   `json:"required_ram_gb"`
	MinTrustScore   float64   `json:"min_trust_score"`
	RetryCount      int       `json:"retry_count"`
	LastAssignedTo  string    `json:"last_assigned_to"`
	Geography       string    `json:"geography"`
	PoWDifficulty   int       `json:"pow_difficulty"`
}

// TaskResult represents the result of task execution
type TaskResult struct {
	TaskID        string    `json:"task_id"`
	WorkerWallet  string    `json:"worker_wallet"`
	Success       bool      `json:"success"`
	ResultData    []byte    `json:"result_data"`
	ExecutionTime int       `json:"execution_time_ms"`
	PoWNonce      string    `json:"pow_nonce"`
	ErrorMessage  string    `json:"error_message,omitempty"`
}

// WorkerInfo represents worker capacity and status
type WorkerInfo struct {
	WalletAddress   string    `json:"wallet_address"`
	TrustScore      float64   `json:"trust_score"`
	ActiveTasks     int       `json:"active_tasks"`
	MaxCapacity     int       `json:"max_capacity"`
	CPUCores        int       `json:"cpu_cores"`
	RAMGB           float64   `json:"ram_gb"`
	Country         string    `json:"country"`
	LastSeen        time.Time `json:"last_seen"`
	AvgExecutionMs  int       `json:"avg_execution_ms"`
}

// NewTaskOrchestrator creates a new task orchestrator
func NewTaskOrchestrator(db *sql.DB, redis *redis.Client) *TaskOrchestrator {
	orch := &TaskOrchestrator{
		db:                db,
		redis:             redis,
		maxRetries:        3,
		retryBackoff:      []time.Duration{1 * time.Second, 5 * time.Second, 30 * time.Second},
		workerCapacity:    make(map[string]int),
		maxTasksPerWorker: 5,
		taskQueue:         make(chan *TaskQueueItem, 1000),
		resultQueue:       make(chan *TaskResult, 1000),
		stopChan:          make(chan struct{}),
	}
	
	return orch
}

// SetPoWService sets the PoW service for challenge generation
func (o *TaskOrchestrator) SetPoWService(pow *ProofOfWorkService) {
	o.powService = pow
}

// Start begins the orchestrator background processes
func (o *TaskOrchestrator) Start(ctx context.Context) {
	log.Println("🚀 TaskOrchestrator starting...")
	
	// Start queue processor
	go o.processQueue(ctx)
	
	// Start result processor
	go o.processResults(ctx)
	
	// Start periodic queue refresh
	go o.refreshQueue(ctx)
	
	// Start worker capacity monitor
	go o.monitorWorkerCapacity(ctx)
	
	log.Println("✅ TaskOrchestrator started")
}

// Stop gracefully stops the orchestrator
func (o *TaskOrchestrator) Stop() {
	log.Println("🛑 TaskOrchestrator stopping...")
	close(o.stopChan)
}

// EnqueueTask adds a task to the priority queue
func (o *TaskOrchestrator) EnqueueTask(ctx context.Context, task *TaskQueueItem) error {
	// Calculate priority score for Redis sorted set
	// Lower score = higher priority
	score := o.calculatePriorityScore(task)
	
	// Add to Redis sorted set
	key := "task_queue:pending"
	member := task.TaskID
	
	if err := o.redis.ZAdd(ctx, key, redis.Z{
		Score:  score,
		Member: member,
	}).Err(); err != nil {
		return fmt.Errorf("failed to enqueue task: %w", err)
	}
	
	// Store task details in hash
	detailsKey := fmt.Sprintf("task_queue:details:%s", task.TaskID)
	if err := o.redis.HSet(ctx, detailsKey, map[string]interface{}{
		"task_type":       task.TaskType,
		"operation":       task.Operation,
		"priority":        task.Priority,
		"reward_gstd":     task.RewardGSTD,
		"created_at":      task.CreatedAt.Unix(),
		"deadline":        task.Deadline.Unix(),
		"min_trust_score": task.MinTrustScore,
		"retry_count":     task.RetryCount,
		"geography":       task.Geography,
		"pow_difficulty":  task.PoWDifficulty,
	}).Err(); err != nil {
		log.Printf("Warning: failed to store task details: %v", err)
	}
	
	log.Printf("📥 Task %s enqueued with priority score %.2f", task.TaskID, score)
	
	return nil
}

// GetNextTaskForWorker returns the best task for a worker based on capabilities
func (o *TaskOrchestrator) GetNextTaskForWorker(ctx context.Context, worker *WorkerInfo) (*TaskQueueItem, error) {
	// Check worker capacity
	o.mutex.RLock()
	activeCount := o.workerCapacity[worker.WalletAddress]
	o.mutex.RUnlock()
	
	if activeCount >= o.maxTasksPerWorker {
		return nil, fmt.Errorf("worker at capacity (%d/%d tasks)", activeCount, o.maxTasksPerWorker)
	}
	
	// Get top N pending tasks from Redis
	key := "task_queue:pending"
	taskIDs, err := o.redis.ZRange(ctx, key, 0, 19).Result() // Top 20 tasks
	if err != nil {
		return nil, fmt.Errorf("failed to get pending tasks: %w", err)
	}
	
	// Find best matching task
	for _, taskID := range taskIDs {
		task, err := o.getTaskDetails(ctx, taskID)
		if err != nil {
			continue
		}
		
		// Check if worker meets requirements
		if o.workerMeetsRequirements(worker, task) {
			return task, nil
		}
	}
	
	return nil, nil // No suitable task found
}

// ClaimTaskForWorker assigns a task to a worker with PoW challenge
func (o *TaskOrchestrator) ClaimTaskForWorker(ctx context.Context, taskID string, worker *WorkerInfo) (*PoWChallenge, error) {
	// Get task details
	task, err := o.getTaskDetails(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}
	
	// Verify worker requirements
	if !o.workerMeetsRequirements(worker, task) {
		return nil, fmt.Errorf("worker does not meet task requirements")
	}
	
	// Remove from pending queue
	key := "task_queue:pending"
	if err := o.redis.ZRem(ctx, key, taskID).Err(); err != nil {
		return nil, fmt.Errorf("failed to remove task from queue: %w", err)
	}
	
	// Add to assigned queue
	assignedKey := "task_queue:assigned"
	if err := o.redis.ZAdd(ctx, assignedKey, redis.Z{
		Score:  float64(time.Now().Unix()),
		Member: taskID,
	}).Err(); err != nil {
		// Re-add to pending on failure
		o.redis.ZAdd(ctx, key, redis.Z{Score: 0, Member: taskID})
		return nil, fmt.Errorf("failed to assign task: %w", err)
	}
	
	// Update worker capacity
	o.mutex.Lock()
	o.workerCapacity[worker.WalletAddress]++
	o.mutex.Unlock()
	
	// Update database
	if err := o.updateTaskAssignment(ctx, taskID, worker.WalletAddress); err != nil {
		log.Printf("Warning: failed to update task assignment in DB: %v", err)
	}
	
	// Generate PoW challenge
	var challenge *PoWChallenge
	if o.powService != nil {
		challenge, err = o.powService.GenerateChallenge(ctx, taskID, worker.WalletAddress, task.RewardGSTD)
		if err != nil {
			log.Printf("Warning: failed to generate PoW challenge: %v", err)
		}
	}
	
	log.Printf("📤 Task %s assigned to worker %s", taskID, worker.WalletAddress[:16])
	
	return challenge, nil
}

// CompleteTask handles task completion with PoW verification
func (o *TaskOrchestrator) CompleteTask(ctx context.Context, result *TaskResult) error {
	// Verify PoW if service is available
	if o.powService != nil && result.PoWNonce != "" {
		powResult, err := o.powService.VerifyProof(ctx, result.TaskID, result.WorkerWallet, result.PoWNonce)
		if err != nil {
			return fmt.Errorf("PoW verification failed: %w", err)
		}
		if !powResult.Valid {
			return fmt.Errorf("invalid PoW: %d leading zeros, required more", powResult.LeadingZeros)
		}
		log.Printf("✅ PoW verified for task %s", result.TaskID)
	}
	
	// Remove from assigned queue
	assignedKey := "task_queue:assigned"
	if err := o.redis.ZRem(ctx, assignedKey, result.TaskID).Err(); err != nil {
		log.Printf("Warning: failed to remove task from assigned queue: %v", err)
	}
	
	// Update worker capacity
	o.mutex.Lock()
	if o.workerCapacity[result.WorkerWallet] > 0 {
		o.workerCapacity[result.WorkerWallet]--
	}
	o.mutex.Unlock()
	
	// Add to completed queue for processing
	completedKey := "task_queue:completed"
	if err := o.redis.ZAdd(ctx, completedKey, redis.Z{
		Score:  float64(time.Now().Unix()),
		Member: result.TaskID,
	}).Err(); err != nil {
		log.Printf("Warning: failed to add task to completed queue: %v", err)
	}
	
	// Update database
	if err := o.updateTaskCompletion(ctx, result); err != nil {
		return fmt.Errorf("failed to update task completion: %w", err)
	}
	
	log.Printf("✅ Task %s completed by worker %s in %dms", 
		result.TaskID, result.WorkerWallet[:16], result.ExecutionTime)
	
	return nil
}

// RetryTask re-queues a failed task with backoff
func (o *TaskOrchestrator) RetryTask(ctx context.Context, taskID string, reason string) error {
	// Get task details
	task, err := o.getTaskDetails(ctx, taskID)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}
	
	// Check retry limit
	if task.RetryCount >= o.maxRetries {
		log.Printf("❌ Task %s exceeded max retries (%d), marking as failed", taskID, o.maxRetries)
		return o.markTaskFailed(ctx, taskID, reason)
	}
	
	// Calculate backoff delay
	backoffDelay := o.retryBackoff[task.RetryCount]
	if task.RetryCount >= len(o.retryBackoff) {
		backoffDelay = o.retryBackoff[len(o.retryBackoff)-1]
	}
	
	// Update retry count
	task.RetryCount++
	task.LastAssignedTo = ""
	
	// Schedule retry after delay
	go func() {
		time.Sleep(backoffDelay)
		
		// Re-enqueue with higher priority
		task.Priority = max(1, task.Priority-1) // Increase priority
		if err := o.EnqueueTask(context.Background(), task); err != nil {
			log.Printf("Failed to re-enqueue task %s: %v", taskID, err)
		}
		log.Printf("🔄 Task %s re-queued for retry %d/%d", taskID, task.RetryCount, o.maxRetries)
	}()
	
	// Update database
	_, err = o.db.ExecContext(ctx, `
		UPDATE tasks SET 
			status = 'pending',
			retry_count = $1,
			last_error = $2,
			updated_at = NOW()
		WHERE task_id = $3
	`, task.RetryCount, reason, taskID)
	
	return err
}

// GetQueueStats returns current queue statistics
func (o *TaskOrchestrator) GetQueueStats(ctx context.Context) (map[string]interface{}, error) {
	pendingCount, _ := o.redis.ZCard(ctx, "task_queue:pending").Result()
	assignedCount, _ := o.redis.ZCard(ctx, "task_queue:assigned").Result()
	completedCount, _ := o.redis.ZCard(ctx, "task_queue:completed").Result()
	
	return map[string]interface{}{
		"pending":   pendingCount,
		"assigned":  assignedCount,
		"completed": completedCount,
		"workers":   len(o.workerCapacity),
	}, nil
}

// --- Private methods ---

// calculatePriorityScore calculates Redis sorted set score
// Lower score = higher priority
func (o *TaskOrchestrator) calculatePriorityScore(task *TaskQueueItem) float64 {
	// Base: priority level (1-4) * 1000000
	score := float64(task.Priority) * 1000000
	
	// Subtract reward to prioritize higher rewards
	score -= task.RewardGSTD * 1000
	
	// Add age penalty (older tasks get priority)
	age := time.Since(task.CreatedAt).Minutes()
	score -= age * 10
	
	// Deadline urgency
	if !task.Deadline.IsZero() {
		timeToDeadline := time.Until(task.Deadline).Minutes()
		if timeToDeadline < 60 {
			score -= (60 - timeToDeadline) * 100 // Urgent tasks
		}
	}
	
	return score
}

// getTaskDetails retrieves task details from Redis or database
func (o *TaskOrchestrator) getTaskDetails(ctx context.Context, taskID string) (*TaskQueueItem, error) {
	// Try Redis first
	detailsKey := fmt.Sprintf("task_queue:details:%s", taskID)
	result, err := o.redis.HGetAll(ctx, detailsKey).Result()
	if err == nil && len(result) > 0 {
		task := &TaskQueueItem{TaskID: taskID}
		// Parse from Redis hash
		if v, ok := result["task_type"]; ok {
			task.TaskType = v
		}
		if v, ok := result["operation"]; ok {
			task.Operation = v
		}
		if v, ok := result["priority"]; ok {
			fmt.Sscanf(v, "%d", &task.Priority)
		}
		if v, ok := result["reward_gstd"]; ok {
			fmt.Sscanf(v, "%f", &task.RewardGSTD)
		}
		if v, ok := result["min_trust_score"]; ok {
			fmt.Sscanf(v, "%f", &task.MinTrustScore)
		}
		if v, ok := result["retry_count"]; ok {
			fmt.Sscanf(v, "%d", &task.RetryCount)
		}
		if v, ok := result["geography"]; ok {
			task.Geography = v
		}
		if v, ok := result["pow_difficulty"]; ok {
			fmt.Sscanf(v, "%d", &task.PoWDifficulty)
		}
		return task, nil
	}
	
	// Fall back to database
	task := &TaskQueueItem{TaskID: taskID}
	err = o.db.QueryRowContext(ctx, `
		SELECT task_type, operation, priority, reward_per_worker, min_trust_score, geography, pow_difficulty
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(
		&task.TaskType, &task.Operation, &task.Priority, &task.RewardGSTD,
		&task.MinTrustScore, &task.Geography, &task.PoWDifficulty,
	)
	
	if err != nil {
		return nil, err
	}
	
	return task, nil
}

// workerMeetsRequirements checks if worker can handle task
func (o *TaskOrchestrator) workerMeetsRequirements(worker *WorkerInfo, task *TaskQueueItem) bool {
	// Trust score check
	if worker.TrustScore < task.MinTrustScore {
		return false
	}
	
	// CPU check
	if task.RequiredCPU > 0 && worker.CPUCores < task.RequiredCPU {
		return false
	}
	
	// RAM check
	if task.RequiredRAMGB > 0 && worker.RAMGB < task.RequiredRAMGB {
		return false
	}
	
	// Geography check (simplified)
	if task.Geography != "" && task.Geography != "{\"type\": \"global\"}" {
		// TODO: Parse geography JSON and check country
	}
	
	// Don't reassign to same worker on retry
	if task.LastAssignedTo == worker.WalletAddress && task.RetryCount > 0 {
		return false
	}
	
	return true
}

// updateTaskAssignment updates task status in database
func (o *TaskOrchestrator) updateTaskAssignment(ctx context.Context, taskID, workerWallet string) error {
	_, err := o.db.ExecContext(ctx, `
		UPDATE tasks SET 
			status = 'assigned',
			assigned_node = $1,
			assigned_node_id = $1,
			updated_at = NOW()
		WHERE task_id = $2
	`, workerWallet, taskID)
	return err
}

// updateTaskCompletion updates task completion in database
func (o *TaskOrchestrator) updateTaskCompletion(ctx context.Context, result *TaskResult) error {
	status := "completed"
	if !result.Success {
		status = "failed"
	}
	
	_, err := o.db.ExecContext(ctx, `
		UPDATE tasks SET 
			status = $1,
			result_data = $2,
			execution_time_ms = $3,
			completed_at = NOW(),
			updated_at = NOW()
		WHERE task_id = $4
	`, status, result.ResultData, result.ExecutionTime, result.TaskID)
	return err
}

// markTaskFailed marks task as permanently failed
func (o *TaskOrchestrator) markTaskFailed(ctx context.Context, taskID, reason string) error {
	_, err := o.db.ExecContext(ctx, `
		UPDATE tasks SET 
			status = 'failed',
			last_error = $1,
			updated_at = NOW()
		WHERE task_id = $2
	`, reason, taskID)
	return err
}

// processQueue processes the task queue
func (o *TaskOrchestrator) processQueue(ctx context.Context) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-o.stopChan:
			return
		case <-ticker.C:
			// Process queue items
			// Implementation handles broadcasting to workers via WebSocket
		}
	}
}

// processResults processes completed task results
func (o *TaskOrchestrator) processResults(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-o.stopChan:
			return
		case result := <-o.resultQueue:
			if err := o.CompleteTask(ctx, result); err != nil {
				log.Printf("Error processing result for task %s: %v", result.TaskID, err)
			}
		}
	}
}

// refreshQueue refreshes queue from database
func (o *TaskOrchestrator) refreshQueue(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-o.stopChan:
			return
		case <-ticker.C:
			// Sync pending tasks from database to Redis
			rows, err := o.db.QueryContext(ctx, `
				SELECT task_id, task_type, operation, priority, reward_per_worker, 
					   created_at, min_trust_score, geography, COALESCE(pow_difficulty, 16)
				FROM tasks 
				WHERE status IN ('pending', 'queued') 
				AND created_at > NOW() - INTERVAL '1 day'
				ORDER BY priority, created_at
				LIMIT 100
			`)
			if err != nil {
				log.Printf("Error refreshing queue: %v", err)
				continue
			}
			
			for rows.Next() {
				task := &TaskQueueItem{}
				var rewardGSTD sql.NullFloat64
				if err := rows.Scan(
					&task.TaskID, &task.TaskType, &task.Operation, &task.Priority,
					&rewardGSTD, &task.CreatedAt, &task.MinTrustScore, &task.Geography,
					&task.PoWDifficulty,
				); err != nil {
					continue
				}
				if rewardGSTD.Valid {
					task.RewardGSTD = rewardGSTD.Float64
				}
				
				// Check if already in queue
				score, err := o.redis.ZScore(ctx, "task_queue:pending", task.TaskID).Result()
				if err != nil || score == 0 {
					o.EnqueueTask(ctx, task)
				}
			}
			rows.Close()
		}
	}
}

// monitorWorkerCapacity tracks active worker capacity
func (o *TaskOrchestrator) monitorWorkerCapacity(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-o.stopChan:
			return
		case <-ticker.C:
			// Query active task counts per worker
			rows, err := o.db.QueryContext(ctx, `
				SELECT assigned_node, COUNT(*) 
				FROM tasks 
				WHERE status = 'assigned' 
				AND assigned_node IS NOT NULL
				GROUP BY assigned_node
			`)
			if err != nil {
				continue
			}
			
			newCapacity := make(map[string]int)
			for rows.Next() {
				var wallet string
				var count int
				if err := rows.Scan(&wallet, &count); err == nil {
					newCapacity[wallet] = count
				}
			}
			rows.Close()
			
			o.mutex.Lock()
			o.workerCapacity = newCapacity
			o.mutex.Unlock()
		}
	}
}

// Helper function for Go 1.21+
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
