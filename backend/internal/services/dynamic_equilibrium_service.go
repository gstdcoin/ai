package services

import (
	"context"
	"database/sql"
	"log"
	"math"
	"time"
)

// DynamicEquilibriumService implements:
// - Anti-Price Barrier: 24h BaseInferenceFee adjustment by GSTD/XAUt (micro-request <= $0.01)
// - Shard Integrity Watchdog: availability check, reward boost when < 80%
type DynamicEquilibriumService struct {
	db         *sql.DB
	poolMonitor *PoolMonitorService
	interval   time.Duration
}

// BaseInferenceFeeGSTD returns the current base fee (from DB, adjusted daily)
func (s *DynamicEquilibriumService) BaseInferenceFeeGSTD(ctx context.Context) float64 {
	var fee float64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(base_fee_gstd, 0.01) FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1`).Scan(&fee)
	if err != nil {
		return GetBaseInferenceFeeGSTD()
	}
	if fee < 0.001 {
		return 0.001
	}
	return fee
}

// LoadFromDB loads the last persisted fee into global (for startup)
func (s *DynamicEquilibriumService) LoadFromDB(ctx context.Context) {
	var fee float64
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(base_fee_gstd, 0.01) FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1`).Scan(&fee); err == nil && fee >= 0.001 {
		SetBaseInferenceFeeGSTD(fee)
	}
}

// RunAntiPriceBarrier adjusts BaseInferenceFee so micro-request <= $0.01
func (s *DynamicEquilibriumService) RunAntiPriceBarrier(ctx context.Context) {
	if s.poolMonitor == nil {
		return
	}
	gstdUSD, err := s.poolMonitor.GetGSTDPriceUSD(ctx)
	if err != nil || gstdUSD <= 0 {
		gstdUSD = 0.015
	}
	targetUSD := 0.01
	// baseFeeGSTD = targetUSD / gstdUSD, capped
	baseFee := targetUSD / gstdUSD
	if baseFee < 0.001 {
		baseFee = 0.001
	}
	if baseFee > 0.1 {
		baseFee = 0.1
	}
	_, execErr := s.db.ExecContext(ctx, `
		UPDATE inference_fee_config SET base_fee_gstd = $1, gstd_price_usd_at_set = $2, updated_at = NOW()
		WHERE id = (SELECT id FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1)
	`, baseFee, gstdUSD)
	if execErr != nil {
		s.db.ExecContext(ctx, `INSERT INTO inference_fee_config (base_fee_gstd, gstd_price_usd_at_set, target_usd_per_micro) VALUES ($1, $2, 0.01)`, baseFee, gstdUSD)
	}
	SetBaseInferenceFeeGSTD(baseFee)
	log.Printf("[Dynamic Equilibrium] Anti-Price Barrier: BaseInferenceFee = %.6f GSTD (GSTD=$%.6f, target $0.01/micro)", baseFee, gstdUSD)
}

// RunNodeInfluxExpansion: if Node Influx > 10,000/day, expand shard_replicas (boost rewards for redundancy).
func (s *DynamicEquilibriumService) RunNodeInfluxExpansion(ctx context.Context) {
	var influx int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE created_at > NOW() - INTERVAL '1 day'`).Scan(&influx)
	if err != nil || influx < 10000 {
		return
	}
	// Auto-Expansion: raise boost multiplier for all shards to attract more replicas
	rows, err := s.db.QueryContext(ctx, `SELECT model_id, shard_index FROM model_shard_replicas GROUP BY model_id, shard_index`)
	if err != nil {
		return
	}
	defer rows.Close()
	expansionBoost := 1.0 + math.Min(0.5, float64(influx-10000)/100000) // up to 1.5x when 60k+ influx
	for rows.Next() {
		var modelID string
		var shardIdx int
		if rows.Scan(&modelID, &shardIdx) != nil {
			continue
		}
		s.db.ExecContext(ctx, `
			INSERT INTO shard_reward_boosts (model_id, shard_index, boost_multiplier, availability_pct, updated_at)
			VALUES ($1, $2, $3, 100, NOW())
			ON CONFLICT (model_id, shard_index) DO UPDATE SET
				boost_multiplier = GREATEST(shard_reward_boosts.boost_multiplier, $3),
				updated_at = NOW()
		`, modelID, shardIdx, expansionBoost)
	}
	log.Printf("[Node Influx] Auto-Expansion: %d nodes/24h → shard_reward_boosts raised to %.2fx", influx, expansionBoost)
}

// RunShardIntegrityWatchdog checks shard availability, boosts reward when < 80%
func (s *DynamicEquilibriumService) RunShardIntegrityWatchdog(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT model_id, shard_index,
		       COUNT(*) FILTER (WHERE is_available) as available,
		       COUNT(*) as total
		FROM model_shard_replicas
		GROUP BY model_id, shard_index
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var modelID string
		var shardIdx, available, total int
		if err := rows.Scan(&modelID, &shardIdx, &available, &total); err != nil {
			continue
		}
		if total == 0 {
			continue
		}
		availPct := float64(available) / float64(total) * 100
		boost := 1.0
		if availPct < 80 {
			boost = 1.0 + (80-availPct)/80*0.5 // up to 1.5x when 0% available
			boost = math.Min(boost, 1.5)
			log.Printf("[Shard Watchdog] %s shard %d: %.0f%% available → reward boost %.2fx", modelID, shardIdx, availPct, boost)
		}
		s.db.ExecContext(ctx, `
			INSERT INTO shard_reward_boosts (model_id, shard_index, boost_multiplier, availability_pct, updated_at)
			VALUES ($1, $2, $3, $4, NOW())
			ON CONFLICT (model_id, shard_index) DO UPDATE SET boost_multiplier = $3, availability_pct = $4, updated_at = NOW()
		`, modelID, shardIdx, boost, availPct)
	}
}

// Start runs the 24h Anti-Price Barrier and periodic Shard Watchdog
func (s *DynamicEquilibriumService) Start(ctx context.Context) {
	s.LoadFromDB(ctx)

	// Anti-Price Barrier: every 24h
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		s.RunAntiPriceBarrier(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.RunAntiPriceBarrier(ctx)
			}
		}
	}()

		// Shard Watchdog + Node Influx Expansion: every 15 min
		go func() {
			ticker := time.NewTicker(15 * time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					s.RunShardIntegrityWatchdog(ctx)
					s.RunNodeInfluxExpansion(ctx)
				}
			}
		}()

	log.Printf("⚖️ Dynamic Equilibrium: Anti-Price Barrier (24h) + Shard Watchdog (15m) ACTIVE")
}

// NewDynamicEquilibriumService creates the service
func NewDynamicEquilibriumService(db *sql.DB, poolMonitor *PoolMonitorService) *DynamicEquilibriumService {
	return &DynamicEquilibriumService{db: db, poolMonitor: poolMonitor}
}
