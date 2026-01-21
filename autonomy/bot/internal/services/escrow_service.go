package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// EscrowService handles fund locking and release for tasks
type EscrowService struct {
	db           *sql.DB
	platformFee  float64 // 5%
	devFundShare float64 // 2% of platform fee (40% of 5%)
	goldShare    float64 // 3% of platform fee (60% of 5%)
}

// Geography represents task geographic constraints
type Geography struct {
	Type      string   `json:"type"`      // "global" or "countries"
	Countries []string `json:"countries"` // e.g., ["US", "DE", "JP"]
}

// EscrowRecord represents a locked escrow
type EscrowRecord struct {
	ID              int       `json:"id"`
	TaskID          string    `json:"task_id"`
	CreatorWallet   string    `json:"creator_wallet"`
	BudgetGSTD      float64   `json:"budget_gstd"`
	PlatformFeeGSTD float64   `json:"platform_fee_gstd"`
	TotalLockedGSTD float64   `json:"total_locked_gstd"`
	Difficulty      string    `json:"difficulty"`
	TaskType        string    `json:"task_type"`
	Geography       Geography `json:"geography"`
	Status          string    `json:"status"`
	LockedAt        time.Time `json:"locked_at"`
	WorkersPaid     int       `json:"workers_paid"`
	TotalPaidGSTD   float64   `json:"total_paid_gstd"`
}

// TransactionRecord represents a transaction
type TransactionRecord struct {
	ID          int             `json:"id"`
	TxID        string          `json:"tx_id"`
	FromWallet  *string         `json:"from_wallet"`
	ToWallet    string          `json:"to_wallet"`
	AmountGSTD  float64         `json:"amount_gstd"`
	TxType      string          `json:"tx_type"`
	TaskID      *string         `json:"task_id"`
	Description string          `json:"description"`
	Status      string          `json:"status"`
	CreatedAt   time.Time       `json:"created_at"`
	Metadata    json.RawMessage `json:"metadata"`
}

func NewEscrowService(db *sql.DB) *EscrowService {
	return &EscrowService{
		db:           db,
		platformFee:  0.05, // 5%
		devFundShare: 0.40, // 40% of platform fee = 2%
		goldShare:    0.60, // 60% of platform fee = 3%
	}
}

// LockFunds creates an escrow for a task
func (s *EscrowService) LockFunds(ctx context.Context, taskID, creatorWallet string, budgetGSTD float64, taskType, difficulty string, geography *Geography) (*EscrowRecord, error) {
	// Calculate fees
	platformFee := budgetGSTD * s.platformFee
	totalLocked := budgetGSTD + platformFee

	// Default geography
	if geography == nil {
		geography = &Geography{Type: "global"}
	}
	geoJSON, _ := json.Marshal(geography)

	// Create escrow record
	var escrowID int
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO task_escrow (
			task_id, creator_wallet, budget_gstd, platform_fee_gstd, 
			total_locked_gstd, difficulty, task_type, geography, status
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'locked')
		RETURNING id
	`, taskID, creatorWallet, budgetGSTD, platformFee, totalLocked, difficulty, taskType, geoJSON).Scan(&escrowID)

	if err != nil {
		return nil, fmt.Errorf("failed to create escrow: %w", err)
	}

	// Record transaction
	txID := uuid.New().String()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO transaction_history (
			tx_id, from_wallet, to_wallet, amount_gstd, tx_type, 
			task_id, escrow_id, description, status
		) VALUES ($1, $2, 'escrow', $3, 'escrow_lock', $4, $5, $6, 'confirmed')
	`, txID, creatorWallet, totalLocked, taskID, escrowID,
		fmt.Sprintf("Locked %.6f GSTD for task %s (budget: %.6f, fee: %.6f)", totalLocked, taskID, budgetGSTD, platformFee))

	if err != nil {
		log.Printf("⚠️  Failed to record escrow transaction: %v", err)
	}

	// Update task with escrow reference
	_, err = s.db.ExecContext(ctx, `
		UPDATE tasks SET escrow_id = $1, budget_gstd = $2 WHERE task_id = $3
	`, escrowID, budgetGSTD, taskID)

	if err != nil {
		log.Printf("⚠️  Failed to update task with escrow ID: %v", err)
	}

	log.Printf("✅ Escrow created: task=%s, budget=%.6f GSTD, fee=%.6f GSTD, total=%.6f GSTD",
		taskID, budgetGSTD, platformFee, totalLocked)

	return &EscrowRecord{
		ID:              escrowID,
		TaskID:          taskID,
		CreatorWallet:   creatorWallet,
		BudgetGSTD:      budgetGSTD,
		PlatformFeeGSTD: platformFee,
		TotalLockedGSTD: totalLocked,
		Difficulty:      difficulty,
		TaskType:        taskType,
		Geography:       *geography,
		Status:          "locked",
		LockedAt:        time.Now(),
	}, nil
}

// ReleaseToWorker releases funds to a worker after task completion
func (s *EscrowService) ReleaseToWorker(ctx context.Context, taskID, workerWallet string, qualityScore float64) (*TransactionRecord, error) {
	// Get escrow details
	var escrow EscrowRecord
	var geoJSON []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT id, task_id, creator_wallet, budget_gstd, platform_fee_gstd, 
		       total_locked_gstd, difficulty, task_type, geography, status,
		       workers_paid, total_paid_gstd
		FROM task_escrow WHERE task_id = $1
	`, taskID).Scan(
		&escrow.ID, &escrow.TaskID, &escrow.CreatorWallet, &escrow.BudgetGSTD,
		&escrow.PlatformFeeGSTD, &escrow.TotalLockedGSTD, &escrow.Difficulty,
		&escrow.TaskType, &geoJSON, &escrow.Status, &escrow.WorkersPaid, &escrow.TotalPaidGSTD,
	)
	if err != nil {
		return nil, fmt.Errorf("escrow not found: %w", err)
	}

	if escrow.Status != "locked" {
		return nil, fmt.Errorf("escrow is not locked (status: %s)", escrow.Status)
	}

	// Get task details for reward calculation
	var maxWorkers, workersCompleted int
	var rewardPerWorker sql.NullFloat64
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(max_workers, 1), COALESCE(workers_completed, 0), reward_per_worker
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(&maxWorkers, &workersCompleted, &rewardPerWorker)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	// Calculate worker reward (95% of their share)
	var workerReward float64
	if rewardPerWorker.Valid {
		workerReward = rewardPerWorker.Float64 * 0.95
	} else {
		// Single worker gets full budget (minus platform fee which is separate)
		workerReward = escrow.BudgetGSTD * 0.95
	}

	// Platform fee breakdown
	platformFeeFromWorker := workerReward / 0.95 * 0.05
	devFundAmount := platformFeeFromWorker * s.devFundShare
	goldAmount := platformFeeFromWorker * s.goldShare

	// Start transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// 1. Create worker payout transaction
	workerTxID := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO transaction_history (
			tx_id, from_wallet, to_wallet, amount_gstd, tx_type,
			task_id, escrow_id, description, status, metadata
		) VALUES ($1, 'escrow', $2, $3, 'worker_payout', $4, $5, $6, 'confirmed', $7)
	`, workerTxID, workerWallet, workerReward, taskID, escrow.ID,
		fmt.Sprintf("Task reward for %s (95%% of budget)", taskID),
		fmt.Sprintf(`{"quality_score": %.4f}`, qualityScore))
	if err != nil {
		return nil, fmt.Errorf("failed to record worker payout: %w", err)
	}

	// 2. Record platform fee transactions
	devTxID := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO transaction_history (
			tx_id, from_wallet, to_wallet, amount_gstd, tx_type, task_id, description, status
		) VALUES ($1, 'escrow', 'dev_fund', $2, 'platform_fee', $3, 'Development fund (2%)', 'confirmed')
	`, devTxID, devFundAmount, taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to record dev fund tx: %w", err)
	}

	goldTxID := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO transaction_history (
			tx_id, from_wallet, to_wallet, amount_gstd, tx_type, task_id, description, status
		) VALUES ($1, 'escrow', 'gold_reserve', $2, 'platform_fee', $3, 'Gold reserve (3%)', 'confirmed')
	`, goldTxID, goldAmount, taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to record gold reserve tx: %w", err)
	}

	// 3. Update platform funds
	_, err = tx.ExecContext(ctx, `
		UPDATE platform_funds SET 
			balance_gstd = balance_gstd + $1,
			total_received_gstd = total_received_gstd + $1,
			last_deposit_at = NOW(),
			updated_at = NOW()
		WHERE fund_type = 'dev_fund'
	`, devFundAmount)
	if err != nil {
		return nil, fmt.Errorf("failed to update dev fund: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE platform_funds SET 
			balance_gstd = balance_gstd + $1,
			total_received_gstd = total_received_gstd + $1,
			last_deposit_at = NOW(),
			updated_at = NOW()
		WHERE fund_type = 'gold_reserve'
	`, goldAmount)
	if err != nil {
		return nil, fmt.Errorf("failed to update gold reserve: %w", err)
	}

	// 4. Record fund transactions
	_, err = tx.ExecContext(ctx, `
		INSERT INTO fund_transactions (fund_type, amount_gstd, tx_type, source_task_id, description)
		VALUES 
			('dev_fund', $1, 'deposit', $2, 'Platform fee from task completion'),
			('gold_reserve', $3, 'deposit', $2, 'Platform fee from task completion')
	`, devFundAmount, taskID, goldAmount)
	if err != nil {
		log.Printf("⚠️  Failed to record fund transactions: %v", err)
	}

	// 5. Update escrow
	_, err = tx.ExecContext(ctx, `
		UPDATE task_escrow SET 
			workers_paid = workers_paid + 1,
			total_paid_gstd = total_paid_gstd + $1,
			status = CASE WHEN workers_paid + 1 >= (SELECT COALESCE(max_workers, 1) FROM tasks WHERE task_id = $2) THEN 'released' ELSE status END,
			released_at = CASE WHEN workers_paid + 1 >= (SELECT COALESCE(max_workers, 1) FROM tasks WHERE task_id = $2) THEN NOW() ELSE released_at END
		WHERE task_id = $2
	`, workerReward+platformFeeFromWorker, taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to update escrow: %w", err)
	}

	// 6. Update worker rating
	_, err = tx.ExecContext(ctx, `
		INSERT INTO worker_ratings (worker_wallet, total_tasks_completed, total_earnings_gstd, last_task_at, first_task_at)
		VALUES ($1, 1, $2, NOW(), NOW())
		ON CONFLICT (worker_wallet) DO UPDATE SET
			total_tasks_completed = worker_ratings.total_tasks_completed + 1,
			total_earnings_gstd = worker_ratings.total_earnings_gstd + $2,
			last_task_at = NOW(),
			reliability_score = (worker_ratings.total_tasks_completed + 1)::numeric / 
				NULLIF(worker_ratings.total_tasks_completed + worker_ratings.total_tasks_failed + 1, 0),
			updated_at = NOW()
	`, workerWallet, workerReward)
	if err != nil {
		log.Printf("⚠️  Failed to update worker rating: %v", err)
	}

	// 7. Update task completion count
	_, err = tx.ExecContext(ctx, `
		UPDATE tasks SET workers_completed = COALESCE(workers_completed, 0) + 1 WHERE task_id = $1
	`, taskID)
	if err != nil {
		log.Printf("⚠️  Failed to update task completion count: %v", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	log.Printf("✅ Released %.6f GSTD to worker %s (dev: %.6f, gold: %.6f)",
		workerReward, workerWallet, devFundAmount, goldAmount)

	return &TransactionRecord{
		TxID:        workerTxID,
		ToWallet:    workerWallet,
		AmountGSTD:  workerReward,
		TxType:      "worker_payout",
		Description: fmt.Sprintf("Task reward for %s", taskID),
		Status:      "confirmed",
		CreatedAt:   time.Now(),
	}, nil
}

// GetTransactionHistory returns transaction history for a wallet
func (s *EscrowService) GetTransactionHistory(ctx context.Context, wallet string, limit int) ([]TransactionRecord, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, tx_id, from_wallet, to_wallet, amount_gstd, tx_type,
		       task_id, description, status, created_at, COALESCE(metadata, '{}'::jsonb)
		FROM transaction_history
		WHERE from_wallet = $1 OR to_wallet = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, wallet, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []TransactionRecord
	for rows.Next() {
		var tx TransactionRecord
		var fromWallet, taskID sql.NullString
		err := rows.Scan(&tx.ID, &tx.TxID, &fromWallet, &tx.ToWallet, &tx.AmountGSTD,
			&tx.TxType, &taskID, &tx.Description, &tx.Status, &tx.CreatedAt, &tx.Metadata)
		if err != nil {
			continue
		}
		if fromWallet.Valid {
			tx.FromWallet = &fromWallet.String
		}
		if taskID.Valid {
			tx.TaskID = &taskID.String
		}
		transactions = append(transactions, tx)
	}

	return transactions, nil
}

// GetPlatformFunds returns current platform fund balances
func (s *EscrowService) GetPlatformFunds(ctx context.Context) (map[string]float64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT fund_type, balance_gstd FROM platform_funds
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	funds := make(map[string]float64)
	for rows.Next() {
		var fundType string
		var balance float64
		if err := rows.Scan(&fundType, &balance); err == nil {
			funds[fundType] = balance
		}
	}

	return funds, nil
}

// GetEscrowByTask returns escrow details for a task
func (s *EscrowService) GetEscrowByTask(ctx context.Context, taskID string) (*EscrowRecord, error) {
	var escrow EscrowRecord
	var geoJSON []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT id, task_id, creator_wallet, budget_gstd, platform_fee_gstd,
		       total_locked_gstd, difficulty, task_type, geography, status,
		       locked_at, workers_paid, total_paid_gstd
		FROM task_escrow WHERE task_id = $1
	`, taskID).Scan(
		&escrow.ID, &escrow.TaskID, &escrow.CreatorWallet, &escrow.BudgetGSTD,
		&escrow.PlatformFeeGSTD, &escrow.TotalLockedGSTD, &escrow.Difficulty,
		&escrow.TaskType, &geoJSON, &escrow.Status, &escrow.LockedAt,
		&escrow.WorkersPaid, &escrow.TotalPaidGSTD,
	)
	if err != nil {
		return nil, err
	}

	json.Unmarshal(geoJSON, &escrow.Geography)
	return &escrow, nil
}
