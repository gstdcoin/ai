package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"

	leviathan "distributed-computing-platform/internal/services/leviathan"
)

const (
	PolymarketGammaAPI = "https://gamma-api.polymarket.com"
	DefaultRewardPerTask         = 0.5
	DefaultMaxWorkersPerTask     = 5
	MinResultsToAnalyze          = 3
)

// PolymarketBridgeConfig holds bridge configuration
type PolymarketBridgeConfig struct {
	GammaAPIBase       string
	RewardPerTask      float64
	MaxWorkersPerTask  int
	CreatorWallet      string
	MaxEventsToCreate  int
	GoldSharePct       float64 // 70% → gold reserve
	DevFundSharePct    float64 // 30% → project fund
}

// PolymarketBridgeService converts Polymarket events into crowdsourced prediction tasks
type PolymarketBridgeService struct {
	db     *sql.DB
	escrow *EscrowService
	pm     *leviathan.PolymarketClient
	cfg    PolymarketBridgeConfig
}

// PolymarketTaskInfo holds bridge task metadata
type PolymarketTaskInfo struct {
	ID                 int       `json:"id"`
	MarketID           string    `json:"market_id"`
	EventID            string    `json:"event_id"`
	EventTitle         string    `json:"event_title"`
	Question           string    `json:"question"`
	TaskID             string    `json:"task_id"`
	Status             string    `json:"status"`
	YesPctAtCreate     float64   `json:"yes_pct_at_create"`
	ConsensusPrediction string   `json:"consensus_prediction,omitempty"`
	ConsensusConfidence float64  `json:"consensus_confidence,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	AnalyzedAt         *time.Time `json:"analyzed_at,omitempty"`
}

// PolymarketResultCriteria — формат результата воркера
type PolymarketResultCriteria struct {
	Prediction string  `json:"prediction"` // "yes" | "no"
	Confidence float64 `json:"confidence"` // 0..1
	Reasoning  string  `json:"reasoning"`
}

// NewPolymarketBridgeService creates the bridge service
func NewPolymarketBridgeService(db *sql.DB, escrow *EscrowService, cfg PolymarketBridgeConfig) *PolymarketBridgeService {
	if cfg.GammaAPIBase == "" {
		cfg.GammaAPIBase = PolymarketGammaAPI
	}
	if cfg.RewardPerTask <= 0 {
		cfg.RewardPerTask = DefaultRewardPerTask
	}
	if cfg.MaxWorkersPerTask <= 0 {
		cfg.MaxWorkersPerTask = DefaultMaxWorkersPerTask
	}
	if cfg.MaxEventsToCreate <= 0 {
		cfg.MaxEventsToCreate = 100
	}
	if cfg.GoldSharePct <= 0 {
		cfg.GoldSharePct = 0.70
	}
	cfg.DevFundSharePct = 1.0 - cfg.GoldSharePct

	return &PolymarketBridgeService{
		db:     db,
		escrow: escrow,
		pm:     leviathan.NewPolymarketClient(cfg.GammaAPIBase),
		cfg:    cfg,
	}
}

// FetchAndCreateTasks fetches active Polymarket events and creates tasks (up to limit)
func (s *PolymarketBridgeService) FetchAndCreateTasks(ctx context.Context, limit int) (created int, err error) {
	if limit <= 0 {
		limit = s.cfg.MaxEventsToCreate
	}
	events, err := s.pm.FetchActiveEvents(limit)
	if err != nil {
		return 0, fmt.Errorf("fetch polymarket events: %w", err)
	}

	// Check polymarket_pool balance
	var poolBalance float64
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd, 0) FROM platform_funds WHERE fund_type = 'polymarket_pool'`).Scan(&poolBalance)
	if err != nil {
		return 0, fmt.Errorf("polymarket_pool not found: %w", err)
	}

	creatorWallet := s.cfg.CreatorWallet
	if creatorWallet == "" {
		creatorWallet = "platform_polymarket"
	}

	created = 0
	for _, evt := range events {
		if evt.Closed {
			continue
		}
		// Check if already created
		var exists int
		err = s.db.QueryRowContext(ctx, `SELECT 1 FROM polymarket_bridge_tasks WHERE market_id = $1`, evt.MarketID).Scan(&exists)
		if err == nil {
			continue
		}

		budget := s.cfg.RewardPerTask * float64(s.cfg.MaxWorkersPerTask)
		platformFee := budget * 0.05
		totalLocked := budget + platformFee
		if poolBalance < totalLocked {
			log.Printf("⚠️ Polymarket pool exhausted: %.6f < %.6f", poolBalance, totalLocked)
			break
		}

		mid := evt.MarketID
		if len(mid) > 16 {
			mid = mid[:16]
		}
		taskID := fmt.Sprintf("pm-%s-%s", mid, uuid.New().String()[:8])
		rewardPerWorker := s.cfg.RewardPerTask

		// Insert task (payload = question for workers)
		payloadJSON, _ := json.Marshal(map[string]string{"question": evt.Question, "event": evt.EventName})
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO tasks (
				task_id, requester_address, task_type, operation, status,
				budget_gstd, difficulty, max_workers, reward_per_worker,
				estimated_time_sec, min_trust_score, geography,
				input_source, input_hash, model, payload, created_at
			) VALUES (
				$1, $2, $3, 'compute', 'pending',
				$4, 'medium', $5, $6,
				60, 0, '{"type":"global"}',
				$7, $8, 'polymarket', $9, NOW()
			)
		`, taskID, creatorWallet, TaskTypePolymarketPrediction,
			budget, s.cfg.MaxWorkersPerTask, rewardPerWorker,
			evt.EventID, evt.MarketID, string(payloadJSON))
		if err != nil {
			log.Printf("⚠️ Failed to create task %s: %v", taskID, err)
			continue
		}

		// Lock escrow
		geo := &Geography{Type: "global"}
		_, err = s.escrow.LockFunds(ctx, taskID, creatorWallet, budget, TaskTypePolymarketPrediction, "medium", geo)
		if err != nil {
			s.db.ExecContext(ctx, `DELETE FROM tasks WHERE task_id = $1`, taskID)
			log.Printf("⚠️ Failed to lock escrow for %s: %v", taskID, err)
			continue
		}

		// Deduct from polymarket_pool (budget + 5% platform fee)
		_, err = s.db.ExecContext(ctx, `
			UPDATE platform_funds SET balance_gstd = balance_gstd - $1, updated_at = NOW()
			WHERE fund_type = 'polymarket_pool' AND balance_gstd >= $1
		`, totalLocked)
		if err != nil {
			log.Printf("⚠️ Failed to deduct from pool: %v", err)
			// Rollback task+escrow would be complex; log and continue
		} else {
			poolBalance -= totalLocked
		}

		// Bridge mapping
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO polymarket_bridge_tasks (market_id, event_id, event_title, question, task_id, status, yes_pct_at_create)
			VALUES ($1, $2, $3, $4, $5, 'pending', $6)
		`, evt.MarketID, evt.EventID, evt.EventName, evt.Question, taskID, evt.YesPct)
		if err != nil {
			log.Printf("⚠️ Failed to insert bridge record: %v", err)
		}

		created++
		log.Printf("✅ Polymarket task created: %s | %s", taskID, evt.Question)
	}

	return created, nil
}

// ValidatePolymarketResult checks result format against criteria
func ValidatePolymarketResult(data []byte) (*PolymarketResultCriteria, error) {
	var r PolymarketResultCriteria
	if err := json.Unmarshal(data, &r); err != nil {
		return nil, fmt.Errorf("invalid json: %w", err)
	}
	r.Prediction = strings.ToLower(strings.TrimSpace(r.Prediction))
	if r.Prediction != "yes" && r.Prediction != "no" {
		return nil, fmt.Errorf("prediction must be 'yes' or 'no', got %q", r.Prediction)
	}
	if r.Confidence < 0 || r.Confidence > 1 {
		return nil, fmt.Errorf("confidence must be 0..1, got %.2f", r.Confidence)
	}
	return &r, nil
}

// AggregateAndAnalyze collects results for a task, computes consensus, and marks analyzed
func (s *PolymarketBridgeService) AggregateAndAnalyze(ctx context.Context, taskID string) (consensus string, confidence float64, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT result_data FROM worker_task_assignments
		WHERE task_id = $1 AND status = 'completed' AND result_data IS NOT NULL
	`, taskID)
	if err != nil {
		return "", 0, err
	}
	defer rows.Close()

	var results []PolymarketResultCriteria
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			continue
		}
		r, err := ValidatePolymarketResult(raw)
		if err != nil {
			continue
		}
		results = append(results, *r)
	}

	if len(results) < MinResultsToAnalyze {
		return "", 0, fmt.Errorf("need at least %d results, got %d", MinResultsToAnalyze, len(results))
	}

	yesSum, noSum := 0.0, 0.0
	for _, r := range results {
		w := r.Confidence
		if r.Prediction == "yes" {
			yesSum += w
		} else {
			noSum += w
		}
	}
	total := yesSum + noSum
	if total == 0 {
		return "", 0, fmt.Errorf("no valid weighted results")
	}
	if yesSum >= noSum {
		consensus = "yes"
		confidence = yesSum / total
	} else {
		consensus = "no"
		confidence = noSum / total
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE polymarket_bridge_tasks SET
			status = 'analyzed',
			consensus_prediction = $1,
			consensus_confidence = $2,
			analyzed_at = NOW()
		WHERE task_id = $3
	`, consensus, confidence, taskID)
	if err != nil {
		return "", 0, err
	}

	return consensus, confidence, nil
}

// GetBridgeTasks returns bridge tasks by status
func (s *PolymarketBridgeService) GetBridgeTasks(ctx context.Context, status string, limit int) ([]PolymarketTaskInfo, error) {
	q := `SELECT id, market_id, event_id, event_title, question, task_id, status,
	       COALESCE(yes_pct_at_create, 0), consensus_prediction, COALESCE(consensus_confidence, 0), created_at, analyzed_at
	      FROM polymarket_bridge_tasks`
	args := []interface{}{}
	argNum := 1
	if status != "" {
		q += ` WHERE status = $1`
		args = append(args, status)
		argNum++
	}
	q += ` ORDER BY created_at DESC`
	if limit > 0 {
		args = append(args, limit)
		q += fmt.Sprintf(` LIMIT $%d`, argNum)
	}

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]PolymarketTaskInfo, 0)
	for rows.Next() {
		var t PolymarketTaskInfo
		var cons sql.NullString
		var conf sql.NullFloat64
		var ana sql.NullTime
		err := rows.Scan(&t.ID, &t.MarketID, &t.EventID, &t.EventTitle, &t.Question, &t.TaskID, &t.Status,
			&t.YesPctAtCreate, &cons, &conf, &t.CreatedAt, &ana)
		if err != nil {
			continue
		}
		if cons.Valid {
			t.ConsensusPrediction = cons.String
		}
		if conf.Valid {
			t.ConsensusConfidence = conf.Float64
		}
		if ana.Valid {
			t.AnalyzedAt = &ana.Time
		}
		out = append(out, t)
	}
	return out, nil
}

// FundPolymarketPool adds GSTD to the polymarket pool
func (s *PolymarketBridgeService) FundPolymarketPool(ctx context.Context, amountGSTD float64, source string) error {
	if amountGSTD <= 0 {
		return fmt.Errorf("amount must be positive")
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE platform_funds SET
			balance_gstd = COALESCE(balance_gstd, 0) + $1,
			total_received_gstd = COALESCE(total_received_gstd, 0) + $1,
			last_deposit_at = NOW(),
			updated_at = NOW()
		WHERE fund_type = 'polymarket_pool'
	`, amountGSTD)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("polymarket_pool not found: run migration v53_polymarket_bridge.sql first")
	}
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO fund_transactions (fund_type, amount_gstd, tx_type, description)
		VALUES ('polymarket_pool', $1, 'deposit', $2)
	`, amountGSTD, source)
	return nil
}

// GetPoolBalance returns polymarket pool balance
func (s *PolymarketBridgeService) GetPoolBalance(ctx context.Context) (float64, error) {
	var b float64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd, 0) FROM platform_funds WHERE fund_type = 'polymarket_pool'`).Scan(&b)
	return b, err
}


