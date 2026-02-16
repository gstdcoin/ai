package services

import (
	"context"
	"database/sql"
	"log"

	"github.com/google/uuid"

	"distributed-computing-platform/internal/config"
)

// SettlementService handles automatic distribution on proxy inference completion.
// Split: 85% workers, 10% Treasury (XAUt), 5% protocol.
type SettlementService struct {
	db        *sql.DB
	tonCfg    config.TONConfig
	burn      *BurnService
	poolMon   *PoolMonitorService
	workerPct float64 // 0.85
	treasuryPct float64 // 0.10
	protocolPct float64 // 0.05
}

// SettlementRequest is the input for processing a proxy inference payment
type SettlementRequest struct {
	AmountGSTD   float64 `json:"amount_gstd"`
	WorkerWallet string  `json:"worker_wallet"`
	NodeID       string  `json:"node_id"`
	InferenceID  string  `json:"inference_id"`
	ModelID      string  `json:"model_id"`
}

// SettlementResult holds the distribution breakdown
type SettlementResult struct {
	WorkerAmount   float64 `json:"worker_amount"`
	TreasuryAmount float64 `json:"treasury_amount"`
	ProtocolAmount float64 `json:"protocol_amount"`
	SettlementID   string  `json:"settlement_id"`
}

// NewSettlementService creates the settlement service
func NewSettlementService(db *sql.DB, tonCfg config.TONConfig, burn *BurnService, poolMon *PoolMonitorService) *SettlementService {
	svc := &SettlementService{
		db:          db,
		tonCfg:      tonCfg,
		burn:        burn,
		poolMon:    poolMon,
		workerPct:   0.85,
		treasuryPct: 0.10,
		protocolPct: 0.05,
	}
	svc.ensureSchema()
	return svc
}

func (s *SettlementService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS settlement_ledger (
			id SERIAL PRIMARY KEY,
			settlement_id VARCHAR(64) UNIQUE NOT NULL,
			inference_id VARCHAR(64),
			amount_gstd DECIMAL(18,9) NOT NULL,
			worker_wallet VARCHAR(128),
			node_id VARCHAR(128),
			worker_amount DECIMAL(18,9) NOT NULL,
			treasury_amount DECIMAL(18,9) NOT NULL,
			protocol_amount DECIMAL(18,9) NOT NULL,
			model_id VARCHAR(64),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_settlement_ledger_wallet ON settlement_ledger(worker_wallet);
		CREATE INDEX IF NOT EXISTS idx_settlement_ledger_created ON settlement_ledger(created_at DESC);
	`)
	if err != nil {
		log.Printf("⚠️ settlement_ledger schema: %v", err)
		return
	}
	// Market Ascension: first_query_bonus_used (fallback if migration not run)
	s.db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_query_bonus_used BOOLEAN DEFAULT false`)
	log.Printf("💰 SettlementService schema ensured")
}

// ProcessPayment distributes balance on proxy inference completion.
// 85% workers, 10% Treasury (XAUt), 5% protocol.
func (s *SettlementService) ProcessPayment(ctx context.Context, req *SettlementRequest) (*SettlementResult, error) {
	if s.db == nil {
		return nil, nil
	}
	if req.AmountGSTD <= 0 {
		return &SettlementResult{}, nil
	}

	s.ensureSchema()

	// Eternal Flame: Auto-Scale +5% worker rewards when volume > 10k GSTD/hour
	boost := GetWorkerRewardBoost()
	workerAmt := req.AmountGSTD * s.workerPct * boost
	treasuryAmt := req.AmountGSTD * s.treasuryPct
	protocolAmt := req.AmountGSTD * s.protocolPct
	if boost > 1.0 {
		// Worker gets +5%; reduce treasury+protocol so total = amount_gstd
		platformShare := treasuryAmt + protocolAmt
		extraToWorker := workerAmt - (req.AmountGSTD * s.workerPct)
		platformShare -= extraToWorker
		if platformShare < 0 {
			platformShare = 0
		}
		ratio := treasuryAmt / (treasuryAmt + protocolAmt)
		if treasuryAmt+protocolAmt > 0 {
			treasuryAmt = platformShare * ratio
			protocolAmt = platformShare * (1 - ratio)
		}
		workerAmt = req.AmountGSTD - treasuryAmt - protocolAmt
	}

	// Genesis Sync: Repay internal credit from first PoW payout, then grant Reputation Recovery
	if req.WorkerWallet != "" {
		var creditUsed float64
		if s.db.QueryRowContext(ctx, `SELECT COALESCE(internal_credit_used, 0) FROM users WHERE wallet_address = $1`, req.WorkerWallet).Scan(&creditUsed) == nil && creditUsed >= 1 {
			repay := 0.01
			if workerAmt >= repay {
				workerAmt -= repay
				// Reset flag and grant +5 reputation for "Успешное выполнение обязательств"
				_, _ = s.db.ExecContext(ctx, `
					UPDATE users SET internal_credit_used = 0,
						reputation_bonus = COALESCE(reputation_bonus, 0) + 5
					WHERE wallet_address = $1
				`, req.WorkerWallet)
				log.Printf("[Genesis Sync] Internal Credit repaid: %.2f GSTD deducted, +5 reputation (Успешное выполнение обязательств)", repay)
			}
		}
	}

	settlementID := uuid.New().String()

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO settlement_ledger (
			settlement_id, inference_id, amount_gstd, worker_wallet, node_id,
			worker_amount, treasury_amount, protocol_amount, model_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, settlementID, nullIfEmpty(req.InferenceID), req.AmountGSTD, nullIfEmpty(req.WorkerWallet), nullIfEmpty(req.NodeID),
		workerAmt, treasuryAmt, protocolAmt, nullIfEmpty(req.ModelID))

	if err != nil {
		log.Printf("⚠️ SettlementService ProcessPayment: %v", err)
		return nil, err
	}

	// Log to golden_reserve_log for Treasury (XAUt) tracking
	if treasuryAmt > 0 {
		_ = s.logTreasuryAccrual(ctx, treasuryAmt, req.InferenceID)
	}

	// Gasless User: accumulate protocol_amount (5%) to protocol_fund for gas subsidies
	if protocolAmt > 0 {
		_, _ = s.db.ExecContext(ctx, `
			INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('protocol_fund', $1)
			ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + EXCLUDED.balance_gstd
		`, protocolAmt)
	}

	log.Printf("[Settlement] %.6f GSTD: worker=%.6f (85%%), treasury=%.6f (10%%), protocol=%.6f (5%%)",
		req.AmountGSTD, workerAmt, treasuryAmt, protocolAmt)

	return &SettlementResult{
		WorkerAmount:   workerAmt,
		TreasuryAmount: treasuryAmt,
		ProtocolAmount: protocolAmt,
		SettlementID:   settlementID,
	}, nil
}

func (s *SettlementService) logTreasuryAccrual(ctx context.Context, gstdAmount float64, inferenceID string) error {
	treasury := s.tonCfg.AdminWallet
	if treasury == "" {
		treasury = s.tonCfg.TreasuryWallet
	}
	if treasury == "" {
		treasury = "treasury"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO golden_reserve_log (task_id, gstd_amount, treasury_wallet, timestamp)
		VALUES ($1, $2, $3, NOW())
	`, "inference:"+inferenceID, gstdAmount, treasury)
	return err
}

// GetWalletEarnings returns total earned GSTD for a wallet (from settlement_ledger worker_amount)
func (s *SettlementService) GetWalletEarnings(ctx context.Context, wallet string) (float64, error) {
	if s.db == nil {
		return 0, nil
	}
	var total float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(worker_amount), 0) FROM settlement_ledger WHERE worker_wallet = $1
	`, wallet).Scan(&total)
	return total, err
}
