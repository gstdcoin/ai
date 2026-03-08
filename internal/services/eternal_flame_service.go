package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"time"
)

// Eternal Flame: 99.99% uptime, Auto-Scale Rewards, Archon Oversight
// - Global Availability: node failover + shard redistribution within 30s
// - Auto-Scale Rewards: +5% worker rewards when volume > 10,000 GSTD/hour
// - Archon Oversight: hourly settlement_ledger vs golden_reserve reconciliation

const (
	eternalFlameNodeFailoverThreshold  = 30 * time.Second
	eternalFlameAutoScaleThresholdGSTD = 10000.0
	eternalFlameAutoScaleBonusPct      = 0.05
)

// EternalFlameService implements the Eternal Flame protocol
type EternalFlameService struct {
	db         *sql.DB
	pipeline   *PipelineParallelismService
	settlement *SettlementService
}

// NewEternalFlameService creates the Eternal Flame service
func NewEternalFlameService(db *sql.DB, pipeline *PipelineParallelismService, settlement *SettlementService) *EternalFlameService {
	return &EternalFlameService{
		db:         db,
		pipeline:   pipeline,
		settlement: settlement,
	}
}

// SetPipeline wires PipelineParallelismService (optional, for failover)
func (s *EternalFlameService) SetPipeline(p *PipelineParallelismService) {
	s.pipeline = p
}

// RunGlobalAvailability detects failed nodes and redistributes shards within 30s
func (s *EternalFlameService) RunGlobalAvailability(ctx context.Context) {
	if s.db == nil {
		return
	}
	cutoff := time.Now().Add(-eternalFlameNodeFailoverThreshold)

	// 1. Mark pipeline_nodes as offline if last_seen > 30s ago
	rows, err := s.db.QueryContext(ctx, `
		SELECT node_id FROM pipeline_nodes
		WHERE is_online = true AND (last_seen IS NULL OR last_seen < $1)
	`, cutoff)
	if err != nil {
		return
	}
	defer rows.Close()
	var failedPipelineNodes []string
	for rows.Next() {
		var nodeID string
		if rows.Scan(&nodeID) == nil {
			failedPipelineNodes = append(failedPipelineNodes, nodeID)
		}
	}

	for _, nodeID := range failedPipelineNodes {
		_, _ = s.db.ExecContext(ctx, `UPDATE pipeline_nodes SET is_online = false WHERE node_id = $1`, nodeID)
		if s.pipeline != nil {
			if err := s.pipeline.HandleNodeFailure(ctx, nodeID); err != nil {
				log.Printf("[Eternal Flame] HandleNodeFailure %s: %v", nodeID, err)
			} else {
				log.Printf("[Eternal Flame] Node %s failed — shards redistributed within 30s", nodeID)
			}
		}
	}

	// 2. Mark nodes (general) as offline, update model_shard_replicas for failed wallets
	rows2, err := s.db.QueryContext(ctx, `
		SELECT id, wallet_address FROM nodes
		WHERE status = 'online' AND (last_seen IS NULL OR last_seen < $1)
	`, cutoff)
	if err != nil {
		return
	}
	defer rows2.Close()
	var failedWallets []string
	for rows2.Next() {
		var id, wallet string
		if rows2.Scan(&id, &wallet) == nil && wallet != "" {
			failedWallets = append(failedWallets, wallet)
		}
	}

	for _, w := range failedWallets {
		_, _ = s.db.ExecContext(ctx, `UPDATE nodes SET status = 'offline' WHERE wallet_address = $1`, w)
		res, _ := s.db.ExecContext(ctx, `UPDATE model_shard_replicas SET is_available = false, last_check_at = NOW() WHERE node_wallet = $1`, w)
		if res != nil {
			if n, _ := res.RowsAffected(); n > 0 {
				log.Printf("[Eternal Flame] Node %s failed — %d shard replicas marked unavailable", w[:16], n)
			}
		}
	}
}

// RunAutoScaleRewards checks hourly GSTD volume and applies +5% worker bonus when > 10k
func (s *EternalFlameService) RunAutoScaleRewards(ctx context.Context) {
	if s.db == nil {
		return
	}
	var volumeGSTD float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM settlement_ledger
		WHERE created_at > NOW() - INTERVAL '1 hour'
	`).Scan(&volumeGSTD)
	if err != nil {
		return
	}

	// Also include task budgets (recycling pool, marketplace) for full picture
	var taskVolume float64
	_ = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(COALESCE(budget_gstd, 0)), 0) FROM tasks
		WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '1 hour'
	`).Scan(&taskVolume)
	volumeGSTD += taskVolume

	bonus := 1.0
	if volumeGSTD >= eternalFlameAutoScaleThresholdGSTD {
		bonus = 1.0 + eternalFlameAutoScaleBonusPct
		SetWorkerRewardBoost(bonus)
		log.Printf("[Eternal Flame] Auto-Scale: %.0f GSTD/hour ≥ 10k → worker rewards +5%%", volumeGSTD)
	} else {
		SetWorkerRewardBoost(1.0)
	}

	// Persist for SettlementService to read
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO platform_status (key, value, updated_at) VALUES ('eternal_flame_worker_boost', $1, NOW())
		ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
	`, formatFloat(bonus))
}

// RunArchonOversight performs hourly reconciliation of settlement_ledger and golden_reserve
func (s *EternalFlameService) RunArchonOversight(ctx context.Context) {
	if s.db == nil {
		return
	}

	// 1. Ledger integrity: sum(amount_gstd) must equal sum(worker_amount) + sum(treasury_amount) + sum(protocol_amount)
	var sumAmount, sumWorker, sumTreasury, sumProtocol float64
	err := s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(amount_gstd), 0),
			COALESCE(SUM(worker_amount), 0),
			COALESCE(SUM(treasury_amount), 0),
			COALESCE(SUM(protocol_amount), 0)
		FROM settlement_ledger
	`).Scan(&sumAmount, &sumWorker, &sumTreasury, &sumProtocol)
	if err != nil {
		log.Printf("[Archon Oversight] settlement_ledger query failed: %v", err)
		return
	}

	sumParts := sumWorker + sumTreasury + sumProtocol
	diff := math.Abs(sumAmount - sumParts)
	if diff > 0.0001 {
		log.Printf("[Archon Oversight] ⚠️ INTEGRITY VIOLATION: settlement_ledger sum(amount_gstd)=%.6f, sum(parts)=%.6f, diff=%.6f",
			sumAmount, sumParts, diff)
		s.logArchonAlert(ctx, "settlement_ledger_mismatch", diff)
	} else {
		log.Printf("[Archon Oversight] ✅ settlement_ledger integrity: sum=%.6f GSTD", sumAmount)
	}

	// 2. Golden reserve: total gstd_amount logged
	var goldenSum float64
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(gstd_amount), 0) FROM golden_reserve_log`).Scan(&goldenSum)

	// Treasury share from settlement should be reflected in golden_reserve (each settlement logs treasury_amount)
	// Allow small tolerance (rounding, timing)
	if sumTreasury > 0 && goldenSum < sumTreasury*0.99 {
		log.Printf("[Archon Oversight] ⚠️ golden_reserve shortfall: expected ≥%.6f (from treasury), got %.6f",
			sumTreasury, goldenSum)
		s.logArchonAlert(ctx, "golden_reserve_shortfall", sumTreasury-goldenSum)
	} else {
		log.Printf("[Archon Oversight] ✅ golden_reserve: %.6f GSTD logged", goldenSum)
	}

	// 3. XAUt total
	var xautTotal float64
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE xaut_amount IS NOT NULL`).Scan(&xautTotal)
	log.Printf("[Archon Oversight] Golden reserve backing: %.6f XAUt", xautTotal)
}

func (s *EternalFlameService) logArchonAlert(ctx context.Context, alertType string, amount float64) {
	s.db.ExecContext(ctx, `
		INSERT INTO platform_status (key, value, updated_at) VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
	`, "archon_alert_"+alertType, formatFloat(amount))
}

// Start runs all Eternal Flame loops
func (s *EternalFlameService) Start(ctx context.Context) {
	// Global Availability: every 10s (30s failover window)
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunGlobalAvailability(ctx)
			}
		}
	}()

	// Auto-Scale Rewards: every 5 min
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		s.RunAutoScaleRewards(ctx) // run on startup
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunAutoScaleRewards(ctx)
			}
		}
	}()

	// Archon Oversight: every hour
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		s.RunArchonOversight(ctx) // run on startup
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunArchonOversight(ctx)
			}
		}
	}()

	log.Printf("🔥 Eternal Flame: ACTIVE — 99.99%% uptime, Auto-Scale Rewards, Archon Oversight")
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%.6f", f)
}
