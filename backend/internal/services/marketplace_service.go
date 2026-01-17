package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// MarketplaceService handles job feed and task matching
type MarketplaceService struct {
	db            *sql.DB
	escrowService *EscrowService
}

// AvailableTask represents a task in the marketplace
type AvailableTask struct {
	TaskID           string   `json:"task_id"`
	TaskType         string   `json:"task_type"`
	Operation        string   `json:"operation"`
	Difficulty       string   `json:"difficulty"`
	RewardGSTD       float64  `json:"reward_gstd"`
	EstimatedTimeSec int      `json:"estimated_time_sec"`
	CreatorWallet    string   `json:"creator_wallet"`
	Geography        string   `json:"geography"`        // "global" or comma-separated countries
	RequiredCPU      int      `json:"required_cpu"`
	RequiredRAM      float64  `json:"required_ram_gb"`
	WorkersNeeded    int      `json:"workers_needed"`
	WorkersCompleted int      `json:"workers_completed"`
	CreatedAt        string   `json:"created_at"`
	MinTrustScore    float64  `json:"min_trust_score"`
}

// WorkerStats represents worker statistics
type WorkerStats struct {
	WalletAddress       string  `json:"wallet_address"`
	TotalTasksCompleted int     `json:"total_tasks_completed"`
	TotalEarningsGSTD   float64 `json:"total_earnings_gstd"`
	ReliabilityScore    float64 `json:"reliability_score"`
	AvgExecutionTimeMs  int     `json:"avg_execution_time_ms"`
	LastTaskAt          *string `json:"last_task_at"`
}

// TaskReceipt represents a task completion receipt
type TaskReceipt struct {
	ReceiptID        string  `json:"receipt_id"`
	TaskID           string  `json:"task_id"`
	WorkerWallet     string  `json:"worker_wallet"`
	CreatorWallet    string  `json:"creator_wallet"`
	RewardGSTD       float64 `json:"reward_gstd"`
	PlatformFeeGSTD  float64 `json:"platform_fee_gstd"`
	QualityScore     float64 `json:"quality_score"`
	ExecutionTimeMs  int     `json:"execution_time_ms"`
	CompletedAt      string  `json:"completed_at"`
	TransactionID    string  `json:"transaction_id"`
	DevFundGSTD      float64 `json:"dev_fund_gstd"`
	GoldReserveGSTD  float64 `json:"gold_reserve_gstd"`
}

func NewMarketplaceService(db *sql.DB, escrowService *EscrowService) *MarketplaceService {
	return &MarketplaceService{
		db:            db,
		escrowService: escrowService,
	}
}

// GetAvailableTasks returns tasks matching worker capabilities
func (s *MarketplaceService) GetAvailableTasks(ctx context.Context, workerWallet string, cpuCores int, ramGB float64, country string) ([]AvailableTask, error) {
	// Get worker's trust score
	var trustScore float64 = 0.5
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(reliability_score, 0.5) FROM worker_ratings WHERE worker_wallet = $1
	`, workerWallet).Scan(&trustScore)

	// Query available tasks
	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			t.task_id, 
			t.task_type, 
			COALESCE(t.operation, 'compute') as operation,
			COALESCE(t.difficulty, 'medium') as difficulty,
			COALESCE(t.reward_per_worker, t.labor_compensation_ton, 0) as reward,
			COALESCE(t.estimated_time_sec, 30) as estimated_time,
			t.requester_address,
			COALESCE(t.geography::text, '{"type":"global"}') as geography,
			COALESCE(t.max_workers, 1) as max_workers,
			COALESCE(t.workers_completed, 0) as workers_completed,
			t.created_at,
			COALESCE(t.min_trust_score, 0) as min_trust
		FROM tasks t
		LEFT JOIN task_escrow e ON t.task_id = e.task_id
		WHERE t.status IN ('pending', 'queued')
		  AND (e.status IS NULL OR e.status = 'locked')
		  AND COALESCE(t.min_trust_score, 0) <= $1
		  AND COALESCE(t.workers_completed, 0) < COALESCE(t.max_workers, 1)
		  AND NOT EXISTS (
		      SELECT 1 FROM worker_task_assignments wta 
		      WHERE wta.task_id = t.task_id AND wta.worker_wallet = $2
		  )
		ORDER BY 
			t.labor_compensation_ton DESC,
			t.created_at ASC
		LIMIT 50
	`, trustScore, workerWallet)

	if err != nil {
		return nil, fmt.Errorf("failed to query tasks: %w", err)
	}
	defer rows.Close()

	var tasks []AvailableTask
	for rows.Next() {
		var t AvailableTask
		var createdAt time.Time
		err := rows.Scan(
			&t.TaskID, &t.TaskType, &t.Operation, &t.Difficulty,
			&t.RewardGSTD, &t.EstimatedTimeSec, &t.CreatorWallet,
			&t.Geography, &t.WorkersNeeded, &t.WorkersCompleted,
			&createdAt, &t.MinTrustScore,
		)
		if err != nil {
			log.Printf("⚠️  Error scanning task: %v", err)
			continue
		}
		t.CreatedAt = createdAt.Format(time.RFC3339)
		tasks = append(tasks, t)
	}

	return tasks, nil
}

// ClaimTask assigns a task to a worker
func (s *MarketplaceService) ClaimTask(ctx context.Context, taskID, workerWallet, deviceID string) error {
	// Check if task is available
	var status string
	var maxWorkers, workersCompleted int
	err := s.db.QueryRowContext(ctx, `
		SELECT status, COALESCE(max_workers, 1), COALESCE(workers_completed, 0)
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(&status, &maxWorkers, &workersCompleted)
	
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	if status != "pending" && status != "queued" {
		return fmt.Errorf("task is not available (status: %s)", status)
	}

	if workersCompleted >= maxWorkers {
		return fmt.Errorf("task is fully assigned")
	}

	// Create assignment
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO worker_task_assignments (task_id, worker_wallet, device_id, status)
		VALUES ($1, $2, $3, 'assigned')
		ON CONFLICT (task_id, worker_wallet) DO NOTHING
	`, taskID, workerWallet, deviceID)

	if err != nil {
		return fmt.Errorf("failed to create assignment: %w", err)
	}

	// Update task status if single worker
	if maxWorkers == 1 {
		_, err = s.db.ExecContext(ctx, `
			UPDATE tasks SET status = 'assigned', assigned_device = $1, assigned_at = NOW()
			WHERE task_id = $2
		`, deviceID, taskID)
	}

	return nil
}

// CompleteTask marks a task as completed and triggers payout
func (s *MarketplaceService) CompleteTask(ctx context.Context, taskID, workerWallet string, executionTimeMs int, qualityScore float64, resultData []byte) (*TaskReceipt, error) {
	// Update assignment
	_, err := s.db.ExecContext(ctx, `
		UPDATE worker_task_assignments SET
			status = 'completed',
			completed_at = NOW(),
			execution_time_ms = $1,
			quality_score = $2,
			result_data = $3
		WHERE task_id = $4 AND worker_wallet = $5
	`, executionTimeMs, qualityScore, resultData, taskID, workerWallet)

	if err != nil {
		return nil, fmt.Errorf("failed to update assignment: %w", err)
	}

	// Release funds from escrow
	tx, err := s.escrowService.ReleaseToWorker(ctx, taskID, workerWallet, qualityScore)
	if err != nil {
		log.Printf("⚠️  Escrow release failed for task %s: %v", taskID, err)
		// Continue anyway - funds might be released manually
	}

	// Get escrow details for receipt
	escrow, _ := s.escrowService.GetEscrowByTask(ctx, taskID)

	// Calculate fee breakdown
	platformFee := tx.AmountGSTD / 0.95 * 0.05
	devFund := platformFee * 0.40
	goldReserve := platformFee * 0.60

	// Create receipt
	receipt := &TaskReceipt{
		ReceiptID:       fmt.Sprintf("RCP-%s-%s", taskID[:8], workerWallet[:8]),
		TaskID:          taskID,
		WorkerWallet:    workerWallet,
		CreatorWallet:   escrow.CreatorWallet,
		RewardGSTD:      tx.AmountGSTD,
		PlatformFeeGSTD: platformFee,
		QualityScore:    qualityScore,
		ExecutionTimeMs: executionTimeMs,
		CompletedAt:     time.Now().Format(time.RFC3339),
		TransactionID:   tx.TxID,
		DevFundGSTD:     devFund,
		GoldReserveGSTD: goldReserve,
	}

	// Update worker payout info in assignment
	_, err = s.db.ExecContext(ctx, `
		UPDATE worker_task_assignments SET
			reward_gstd = $1,
			payout_tx_id = $2,
			paid_at = NOW()
		WHERE task_id = $3 AND worker_wallet = $4
	`, tx.AmountGSTD, tx.TxID, taskID, workerWallet)

	if err != nil {
		log.Printf("⚠️  Failed to update assignment with payout: %v", err)
	}

	// Check if task is fully completed
	s.checkAndFinalizeTask(ctx, taskID)

	log.Printf("✅ Task %s completed by %s: reward=%.6f GSTD, quality=%.2f",
		taskID, workerWallet, tx.AmountGSTD, qualityScore)

	return receipt, nil
}

// checkAndFinalizeTask checks if all workers completed and finalizes the task
func (s *MarketplaceService) checkAndFinalizeTask(ctx context.Context, taskID string) {
	var maxWorkers, workersCompleted int
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(max_workers, 1), COALESCE(workers_completed, 0)
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(&maxWorkers, &workersCompleted)

	if err != nil {
		return
	}

	if workersCompleted >= maxWorkers {
		_, err = s.db.ExecContext(ctx, `
			UPDATE tasks SET status = 'completed', completed_at = NOW()
			WHERE task_id = $1
		`, taskID)
		if err != nil {
			log.Printf("⚠️  Failed to finalize task: %v", err)
		}
	}
}

// GetWorkerStats returns worker statistics
func (s *MarketplaceService) GetWorkerStats(ctx context.Context, workerWallet string) (*WorkerStats, error) {
	var stats WorkerStats
	var lastTaskAt sql.NullTime
	
	err := s.db.QueryRowContext(ctx, `
		SELECT 
			wallet_address,
			total_tasks_completed,
			total_earnings_gstd,
			reliability_score,
			avg_execution_time_ms,
			last_task_at
		FROM worker_ratings
		WHERE wallet_address = $1
	`, workerWallet).Scan(
		&stats.WalletAddress,
		&stats.TotalTasksCompleted,
		&stats.TotalEarningsGSTD,
		&stats.ReliabilityScore,
		&stats.AvgExecutionTimeMs,
		&lastTaskAt,
	)

	if err == sql.ErrNoRows {
		// Return default stats for new worker
		return &WorkerStats{
			WalletAddress:       workerWallet,
			TotalTasksCompleted: 0,
			TotalEarningsGSTD:   0,
			ReliabilityScore:    0.5,
		}, nil
	}

	if err != nil {
		return nil, err
	}

	if lastTaskAt.Valid {
		t := lastTaskAt.Time.Format(time.RFC3339)
		stats.LastTaskAt = &t
	}

	return &stats, nil
}

// GetMyTasks returns tasks created by a specific wallet
func (s *MarketplaceService) GetMyTasks(ctx context.Context, creatorWallet string) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			t.task_id,
			t.task_type,
			COALESCE(t.operation, 'compute') as operation,
			t.status,
			COALESCE(t.budget_gstd, t.labor_compensation_ton, 0) as budget,
			COALESCE(t.max_workers, 1) as max_workers,
			COALESCE(t.workers_completed, 0) as workers_completed,
			t.created_at,
			t.completed_at,
			COALESCE(e.status, 'none') as escrow_status,
			COALESCE(e.total_paid_gstd, 0) as paid_out
		FROM tasks t
		LEFT JOIN task_escrow e ON t.task_id = e.task_id
		WHERE t.requester_address = $1
		ORDER BY t.created_at DESC
		LIMIT 100
	`, creatorWallet)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []map[string]interface{}
	for rows.Next() {
		var taskID, taskType, operation, status, escrowStatus string
		var budget, paidOut float64
		var maxWorkers, workersCompleted int
		var createdAt time.Time
		var completedAt sql.NullTime

		err := rows.Scan(&taskID, &taskType, &operation, &status, &budget,
			&maxWorkers, &workersCompleted, &createdAt, &completedAt,
			&escrowStatus, &paidOut)
		if err != nil {
			continue
		}

		task := map[string]interface{}{
			"task_id":           taskID,
			"task_type":         taskType,
			"operation":         operation,
			"status":            status,
			"budget_gstd":       budget,
			"max_workers":       maxWorkers,
			"workers_completed": workersCompleted,
			"created_at":        createdAt.Format(time.RFC3339),
			"escrow_status":     escrowStatus,
			"paid_out_gstd":     paidOut,
		}

		if completedAt.Valid {
			task["completed_at"] = completedAt.Time.Format(time.RFC3339)
		}

		tasks = append(tasks, task)
	}

	return tasks, nil
}

// GetTaskReceipts returns receipts for a task
func (s *MarketplaceService) GetTaskReceipts(ctx context.Context, taskID string) ([]TaskReceipt, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			wta.task_id,
			wta.worker_wallet,
			t.requester_address,
			COALESCE(wta.reward_gstd, 0),
			COALESCE(wta.quality_score, 0),
			COALESCE(wta.execution_time_ms, 0),
			wta.completed_at,
			COALESCE(wta.payout_tx_id, '')
		FROM worker_task_assignments wta
		JOIN tasks t ON wta.task_id = t.task_id
		WHERE wta.task_id = $1 AND wta.status = 'completed'
		ORDER BY wta.completed_at DESC
	`, taskID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var receipts []TaskReceipt
	for rows.Next() {
		var r TaskReceipt
		var completedAt sql.NullTime
		err := rows.Scan(&r.TaskID, &r.WorkerWallet, &r.CreatorWallet,
			&r.RewardGSTD, &r.QualityScore, &r.ExecutionTimeMs,
			&completedAt, &r.TransactionID)
		if err != nil {
			continue
		}

		if completedAt.Valid {
			r.CompletedAt = completedAt.Time.Format(time.RFC3339)
		}

		r.ReceiptID = fmt.Sprintf("RCP-%s-%s", r.TaskID[:8], r.WorkerWallet[:8])
		r.PlatformFeeGSTD = r.RewardGSTD / 0.95 * 0.05
		r.DevFundGSTD = r.PlatformFeeGSTD * 0.40
		r.GoldReserveGSTD = r.PlatformFeeGSTD * 0.60

		receipts = append(receipts, r)
	}

	return receipts, nil
}
