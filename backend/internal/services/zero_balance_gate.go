package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// ZeroBalanceGateService implements the Compute-to-Use circular economy.
// When a user's GSTD balance reaches 0, they automatically transition
// to Worker mode. Their device starts processing tasks to earn GSTD,
// which can then be used for their own queries.
//
// Flow:
//  1. User sends chat query with balance=0
//  2. Gateway checks balance via ZeroBalanceGate
//  3. Gate returns WorkCredit: "process N validation tasks to earn enough for your query"
//  4. Frontend auto-starts WorkerService in background
//  5. Once earned, the original query is processed
type ZeroBalanceGateService struct {
	db *sql.DB
}

// GateDecision represents the outcome of a balance check
type GateDecision struct {
	Allowed       bool    `json:"allowed"`
	Balance       float64 `json:"balance"`
	RequiredCost  float64 `json:"required_cost"`
	Deficit       float64 `json:"deficit"`
	WorkRequired  int     `json:"work_required"`    // Number of tasks to mine
	EstimatedTime int     `json:"estimated_time_s"` // Estimated seconds to earn enough
	Mode          string  `json:"mode"`             // "master" or "worker"
	Message       string  `json:"message"`
}

func NewZeroBalanceGateService(db *sql.DB) *ZeroBalanceGateService {
	return &ZeroBalanceGateService{db: db}
}

// CheckBalance evaluates if a user can afford a request, and if not,
// calculates how much work they need to do
func (s *ZeroBalanceGateService) CheckBalance(ctx context.Context, walletAddress string, requestCost float64) (*GateDecision, error) {
	var balance float64
	err := s.db.QueryRowContext(ctx,
		"SELECT COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&balance)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	decision := &GateDecision{
		Balance:      balance,
		RequiredCost: requestCost,
	}

	if balance >= requestCost {
		decision.Allowed = true
		decision.Mode = "master"
		decision.Message = "Sufficient balance"
		return decision, nil
	}

	// Insufficient balance → calculate work requirement
	decision.Allowed = false
	decision.Deficit = requestCost - balance
	decision.Mode = "worker"

	// Average reward per validation task
	avgRewardPerTask := 0.005 // 0.005 GSTD per task
	decision.WorkRequired = int(decision.Deficit/avgRewardPerTask) + 1
	decision.EstimatedTime = decision.WorkRequired * 15 // ~15 seconds per task

	decision.Message = "Insufficient balance. Switch to Worker mode to earn GSTD."

	return decision, nil
}

// GrantWorkCredit grants a temporary credit for a query while the user mines
// The credit is deducted once the user earns enough through mining
func (s *ZeroBalanceGateService) GrantWorkCredit(ctx context.Context, walletAddress string, amount float64) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) - $1
		WHERE wallet_address = $2
	`, amount, walletAddress)
	if err != nil {
		log.Printf("ZBG: Failed to grant work credit: %v", err)
	}
	return err
}

// RecordWorkContribution records that a user earned GSTD through work
func (s *ZeroBalanceGateService) RecordWorkContribution(ctx context.Context, walletAddress string, amount float64, taskID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1
		WHERE wallet_address = $2
	`, amount, walletAddress)

	// Log the contribution
	s.db.ExecContext(ctx, `
		INSERT INTO work_contributions (wallet_address, amount_gstd, task_id, created_at)
		VALUES ($1, $2, $3, NOW())
	`, walletAddress, amount, taskID)

	return err
}

// GetWorkStats returns work contribution statistics for a user
func (s *ZeroBalanceGateService) GetWorkStats(ctx context.Context, walletAddress string) (map[string]interface{}, error) {
	var totalEarned float64
	var totalTasks int
	var balance float64

	s.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount_gstd), 0), COUNT(*) FROM work_contributions WHERE wallet_address = $1",
		walletAddress).Scan(&totalEarned, &totalTasks)
	s.db.QueryRowContext(ctx,
		"SELECT COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&balance)

	// Average earning rate (last hour)
	var recentRate float64
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM work_contributions
		WHERE wallet_address = $1 AND created_at > NOW() - INTERVAL '1 hour'
	`, walletAddress).Scan(&recentRate)

	return map[string]interface{}{
		"total_earned_gstd":     totalEarned,
		"total_tasks_completed": totalTasks,
		"current_balance":       balance,
		"earning_rate_per_hour": recentRate,
		"mode": func() string {
			if balance > 0.01 {
				return "master"
			}
			return "worker"
		}(),
	}, nil
}

// EnsureSchema creates required tables
func (s *ZeroBalanceGateService) EnsureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS work_contributions (
			id BIGSERIAL PRIMARY KEY,
			wallet_address VARCHAR(128) NOT NULL,
			amount_gstd DECIMAL(18,8) DEFAULT 0,
			task_id VARCHAR(64),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_work_contributions_wallet ON work_contributions(wallet_address);
		CREATE INDEX IF NOT EXISTS idx_work_contributions_time ON work_contributions(created_at DESC);
	`)
	log.Println("✅ ZeroBalanceGate schema ensured")
}

func init() {
	_ = time.Now // Prevent unused import
}
