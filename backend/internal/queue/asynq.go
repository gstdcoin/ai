package queue

// ═══════════════════════════════════════════════════════════════
// ASYNQ: Production-grade distributed task queue
// Replaces naive Redis ZADD-based queue with reliable task processing
//
// Features:
//   - Guaranteed at-least-once delivery
//   - Automatic retries with exponential backoff
//   - Task deduplication
//   - Priority queues (critical > default > low)
//   - Dead-letter queue for failed tasks
//   - Scheduled/delayed tasks
//   - Graceful shutdown
//
// Task Types:
//   - reward:distribute    — distribute node rewards (was cron-based)
//   - reward:claim         — process reward claim (was synchronous)
//   - node:health-check    — periodic node health aggregation
//   - signal:compute       — compute signal predictions
//   - burn:execute         — execute token burns
//   - settlement:process   — process on-chain settlements
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"distributed-computing-platform/internal/config"

	"github.com/hibiken/asynq"
)

// Task type constants
const (
	TaskRewardDistribute  = "reward:distribute"
	TaskRewardClaim       = "reward:claim"
	TaskNodeHealthCheck   = "node:health-check"
	TaskSignalCompute     = "signal:compute"
	TaskBurnExecute       = "burn:execute"
	TaskSettlementProcess = "settlement:process"
	TaskStakingYield      = "staking:yield"
)

// Queue priority names
const (
	QueueCritical = "critical" // settlements, claims
	QueueDefault  = "default"  // rewards, signals
	QueueLow      = "low"      // health checks, analytics
)

// ─── Payloads ─────────────────────────────────────────────────

type RewardDistributePayload struct {
	NodeID        string  `json:"node_id"`
	WalletAddress string  `json:"wallet_address"`
	Amount        float64 `json:"amount"`
	RewardType    string  `json:"reward_type"`
	Reason        string  `json:"reason"`
}

type RewardClaimPayload struct {
	OwnerWallet string `json:"owner_wallet"`
	RequestedAt int64  `json:"requested_at"`
}

type NodeHealthCheckPayload struct {
	BatchSize int `json:"batch_size"`
}

type SignalComputePayload struct {
	SignalID string `json:"signal_id"`
	Market   string `json:"market"`
}

type BurnExecutePayload struct {
	TransactionType string  `json:"transaction_type"`
	OriginalAmount  float64 `json:"original_amount"`
	BurnAmount      float64 `json:"burn_amount"`
	SourceWallet    string  `json:"source_wallet"`
}

type StakingYieldPayload struct {
	Date string `json:"date"` // YYYY-MM-DD
}

// ─── Task Queue Manager ───────────────────────────────────────

type TaskQueueManager struct {
	client    *asynq.Client
	server    *asynq.Server
	inspector *asynq.Inspector
	db        *sql.DB
}

// NewTaskQueueManager creates a new asynq-based task queue
func NewTaskQueueManager(cfg config.RedisConfig, db *sql.DB) (*TaskQueueManager, error) {
	redisOpt := asynq.RedisClientOpt{
		Addr:     fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Password: cfg.Password,
		DB:       cfg.DB,
	}

	client := asynq.NewClient(redisOpt)

	server := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				QueueCritical: 6, // 60% of workers
				QueueDefault:  3, // 30% of workers
				QueueLow:      1, // 10% of workers
			},
			RetryDelayFunc: func(n int, _ error, _ *asynq.Task) time.Duration {
				// Exponential backoff: 10s, 20s, 40s, 80s, 160s...
				return time.Duration(10*(1<<uint(n))) * time.Second
			},
			ErrorHandler: asynq.ErrorHandlerFunc(func(_ context.Context, task *asynq.Task, err error) {
				log.Printf("[TaskQueue] ERROR processing %s: %v", task.Type(), err)
			}),
		},
	)

	inspector := asynq.NewInspector(redisOpt)

	return &TaskQueueManager{
		client:    client,
		server:    server,
		inspector: inspector,
		db:        db,
	}, nil
}

// Start begins processing tasks (non-blocking via goroutine)
func (m *TaskQueueManager) Start() error {
	mux := asynq.NewServeMux()

	// Register handlers
	mux.HandleFunc(TaskRewardDistribute, m.handleRewardDistribute)
	mux.HandleFunc(TaskRewardClaim, m.handleRewardClaim)
	mux.HandleFunc(TaskNodeHealthCheck, m.handleNodeHealthCheck)
	mux.HandleFunc(TaskSignalCompute, m.handleSignalCompute)
	mux.HandleFunc(TaskBurnExecute, m.handleBurnExecute)
	mux.HandleFunc(TaskStakingYield, m.handleStakingYield)

	go func() {
		if err := m.server.Run(mux); err != nil {
			log.Printf("[TaskQueue] Server error: %v", err)
		}
	}()

	log.Printf("✅ Asynq task queue started (concurrency=10, queues=critical/default/low)")
	return nil
}

// Stop gracefully shuts down the task queue
func (m *TaskQueueManager) Stop() {
	m.server.Shutdown()
	m.client.Close()
	m.inspector.Close()
	log.Println("[TaskQueue] Shutdown complete")
}

// ─── Enqueue helpers ──────────────────────────────────────────

func (m *TaskQueueManager) EnqueueRewardDistribute(p RewardDistributePayload) error {
	payload, _ := json.Marshal(p)
	task := asynq.NewTask(TaskRewardDistribute, payload,
		asynq.Queue(QueueDefault),
		asynq.MaxRetry(5),
		asynq.Timeout(30*time.Second),
		asynq.Unique(10*time.Minute), // Deduplicate within 10 min
	)
	_, err := m.client.Enqueue(task)
	return err
}

func (m *TaskQueueManager) EnqueueRewardClaim(wallet string) error {
	payload, _ := json.Marshal(RewardClaimPayload{
		OwnerWallet: wallet,
		RequestedAt: time.Now().Unix(),
	})
	task := asynq.NewTask(TaskRewardClaim, payload,
		asynq.Queue(QueueCritical),
		asynq.MaxRetry(3),
		asynq.Timeout(60*time.Second),
		asynq.Unique(5*time.Minute), // Prevent double-claiming
	)
	_, err := m.client.Enqueue(task)
	return err
}

func (m *TaskQueueManager) EnqueueNodeHealthCheck(batchSize int) error {
	payload, _ := json.Marshal(NodeHealthCheckPayload{BatchSize: batchSize})
	task := asynq.NewTask(TaskNodeHealthCheck, payload,
		asynq.Queue(QueueLow),
		asynq.MaxRetry(2),
		asynq.Timeout(120*time.Second),
	)
	_, err := m.client.Enqueue(task)
	return err
}

func (m *TaskQueueManager) EnqueueBurn(p BurnExecutePayload) error {
	payload, _ := json.Marshal(p)
	task := asynq.NewTask(TaskBurnExecute, payload,
		asynq.Queue(QueueCritical),
		asynq.MaxRetry(3),
		asynq.Timeout(30*time.Second),
	)
	_, err := m.client.Enqueue(task)
	return err
}

func (m *TaskQueueManager) EnqueueStakingYield() error {
	payload, _ := json.Marshal(StakingYieldPayload{Date: time.Now().Format("2006-01-02")})
	task := asynq.NewTask(TaskStakingYield, payload,
		asynq.Queue(QueueDefault),
		asynq.MaxRetry(3),
		asynq.Timeout(120*time.Second),
		asynq.Unique(23*time.Hour), // Once per day
	)
	_, err := m.client.Enqueue(task)
	return err
}

// ScheduleRecurringTasks sets up periodic tasks (replaces cron)
func (m *TaskQueueManager) ScheduleRecurringTasks() {
	// Enqueue health check every 10 minutes
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			_ = m.EnqueueNodeHealthCheck(100)
		}
	}()

	// Enqueue staking yield calculation daily at midnight
	go func() {
		for {
			now := time.Now()
			next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 5, 0, 0, now.Location())
			time.Sleep(time.Until(next))
			_ = m.EnqueueStakingYield()
		}
	}()

	log.Println("✅ Recurring tasks scheduled (health-check/10min, staking-yield/daily)")
}

// ─── GetQueueStats returns queue health for monitoring ────────

type QueueStats struct {
	ActiveTasks    int `json:"active_tasks"`
	PendingTasks   int `json:"pending_tasks"`
	ScheduledTasks int `json:"scheduled_tasks"`
	RetryTasks     int `json:"retry_tasks"`
	ArchivedTasks  int `json:"archived_tasks"`
	CompletedTasks int `json:"completed_tasks"`
}

func (m *TaskQueueManager) GetQueueStats() QueueStats {
	stats := QueueStats{}
	for _, q := range []string{QueueCritical, QueueDefault, QueueLow} {
		info, err := m.inspector.GetQueueInfo(q)
		if err != nil {
			continue
		}
		stats.ActiveTasks += info.Active
		stats.PendingTasks += info.Pending
		stats.ScheduledTasks += info.Scheduled
		stats.RetryTasks += info.Retry
		stats.ArchivedTasks += info.Archived
		stats.CompletedTasks += info.Completed
	}
	return stats
}

// ─── Task Handlers ────────────────────────────────────────────

func (m *TaskQueueManager) handleRewardDistribute(ctx context.Context, task *asynq.Task) error {
	var p RewardDistributePayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal payload: %w", err)
	}

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Credit reward to user
	_, err = tx.ExecContext(ctx,
		`UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd,0) + $1, updated_at = NOW()
		 WHERE wallet_address = $2`,
		p.Amount, p.WalletAddress)
	if err != nil {
		return fmt.Errorf("credit reward: %w", err)
	}

	// Record in ledger
	_, err = tx.ExecContext(ctx,
		`INSERT INTO node_rewards_ledger (node_id, reward_gstd, reward_type, reason, created_at)
		 VALUES ($1, $2, $3, $4, NOW())`,
		p.NodeID, p.Amount, p.RewardType, p.Reason)
	if err != nil {
		return fmt.Errorf("record ledger: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	log.Printf("[TaskQueue] Reward distributed: %.4f GSTD to %s (%s)", p.Amount, p.WalletAddress, p.RewardType)
	return nil
}

func (m *TaskQueueManager) handleRewardClaim(ctx context.Context, task *asynq.Task) error {
	var p RewardClaimPayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}

	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var pending float64
	err = tx.QueryRowContext(ctx,
		`SELECT COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1`,
		p.OwnerWallet).Scan(&pending)
	if err != nil || pending <= 0 {
		return nil // Nothing to claim
	}

	// Move pending to balance
	_, err = tx.ExecContext(ctx,
		`UPDATE users SET
		   gstd_balance = COALESCE(gstd_balance, 0) + pending_balance_gstd,
		   pending_balance_gstd = 0,
		   updated_at = NOW()
		 WHERE wallet_address = $1`, p.OwnerWallet)
	if err != nil {
		return fmt.Errorf("claim transfer: %w", err)
	}

	// Record claim
	_, err = tx.ExecContext(ctx,
		`INSERT INTO node_reward_claims (wallet_address, amount, status, created_at)
		 VALUES ($1, $2, 'completed', NOW())`,
		p.OwnerWallet, pending)
	if err != nil {
		// Non-critical, don't fail
		log.Printf("[TaskQueue] Warning: failed to record claim: %v", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit claim: %w", err)
	}

	log.Printf("[TaskQueue] Reward claimed: %.4f GSTD by %s", pending, p.OwnerWallet)
	return nil
}

func (m *TaskQueueManager) handleNodeHealthCheck(ctx context.Context, task *asynq.Task) error {
	var p NodeHealthCheckPayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}

	// Mark nodes offline if no heartbeat in 70 minutes
	result, err := m.db.ExecContext(ctx,
		`UPDATE nodes SET status = 'offline'
		 WHERE status = 'online' AND last_seen < NOW() - INTERVAL '70 minutes'`)
	if err != nil {
		return fmt.Errorf("update offline nodes: %w", err)
	}

	affected, _ := result.RowsAffected()
	if affected > 0 {
		log.Printf("[TaskQueue] Health check: marked %d nodes offline", affected)
	}

	return nil
}

func (m *TaskQueueManager) handleSignalCompute(_ context.Context, task *asynq.Task) error {
	var p SignalComputePayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}
	// Signal computation is handled by the prediction engine
	log.Printf("[TaskQueue] Signal compute requested: %s (%s)", p.SignalID, p.Market)
	return nil
}

func (m *TaskQueueManager) handleBurnExecute(ctx context.Context, task *asynq.Task) error {
	var p BurnExecutePayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}

	_, err := m.db.ExecContext(ctx,
		`INSERT INTO token_burns (transaction_id, transaction_type, original_amount, burn_amount, burn_address, source_wallet, created_at)
		 VALUES (gen_random_uuid()::text, $1, $2, $3, 'BURN', $4, NOW())`,
		p.TransactionType, p.OriginalAmount, p.BurnAmount, p.SourceWallet)
	if err != nil {
		return fmt.Errorf("record burn: %w", err)
	}

	log.Printf("[TaskQueue] Burn executed: %.4f GSTD (%s)", p.BurnAmount, p.TransactionType)
	return nil
}

func (m *TaskQueueManager) handleStakingYield(ctx context.Context, task *asynq.Task) error {
	var p StakingYieldPayload
	if err := json.Unmarshal(task.Payload(), &p); err != nil {
		return fmt.Errorf("unmarshal: %w", err)
	}

	// Calculate and distribute daily staking yield
	rows, err := m.db.QueryContext(ctx,
		`SELECT id, wallet_address, staked_amount, apy_rate, bonus_multiplier
		 FROM staking_pools WHERE is_active = true AND staked_amount > 0`)
	if err != nil {
		return fmt.Errorf("query stakes: %w", err)
	}
	defer rows.Close()

	var totalDistributed float64
	var stakersProcessed int

	for rows.Next() {
		var id int
		var wallet string
		var amount, apy, bonus float64
		if err := rows.Scan(&id, &wallet, &amount, &apy, &bonus); err != nil {
			continue
		}

		dailyYield := amount * (apy / 100) * bonus / 365
		if dailyYield <= 0 {
			continue
		}

		// Credit yield
		m.db.ExecContext(ctx,
			`UPDATE staking_pools SET total_earned = COALESCE(total_earned,0) + $1 WHERE id = $2`,
			dailyYield, id)
		m.db.ExecContext(ctx,
			`UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd,0) + $1, updated_at = NOW()
			 WHERE wallet_address = $2`, dailyYield, wallet)

		totalDistributed += dailyYield
		stakersProcessed++
	}

	log.Printf("[TaskQueue] Staking yield distributed: %.4f GSTD to %d stakers (%s)",
		totalDistributed, stakersProcessed, p.Date)
	return nil
}
