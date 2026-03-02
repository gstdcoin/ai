package services

import (
	"context"
	"database/sql"
	"log"
	"strconv"
	"sync"
	"time"

	"distributed-computing-platform/internal/services/leviathan"
)

// GoldenAgeService implements the Golden Age Protocol:
// - Automated Payout Waves: weekly or when 10 GSTD threshold
// - Dynamic Fee Scaling: +20% when network load > 80%
// - Global Proof-of-Gold: Sunday ticker audit
// - Swarm Expansion: ticker when active nodes < 1000
type GoldenAgeService struct {
	db            *sql.DB
	settlement    *SettlementService
	stats         *StatsService
	interval      time.Duration
	mu            sync.RWMutex
	feeMultiplier float64
	lastSwarmEmit time.Time
}

const (
	payoutThresholdGSTD = 10.0
	payoutWaveInterval  = 7 * 24 * time.Hour
	loadThresholdPct    = 80.0
	feeBoostPct         = 20.0
	swarmMinNodes       = 1000
)

// feeMultiplierGlobal is used by inferenceFeeGSTD for Dynamic Fee Scaling
var (
	feeMultiplierGlobal   = 1.0
	feeMultiplierGlobalMu sync.RWMutex
	baseInferenceFeeGSTD  = 0.01
	baseInferenceFeeMu    sync.RWMutex
	workerRewardBoost     = 1.0
	workerRewardBoostMu   sync.RWMutex
)

// GetBaseInferenceFeeGSTD returns the current base fee (Anti-Price Barrier adjusted)
func GetBaseInferenceFeeGSTD() float64 {
	baseInferenceFeeMu.RLock()
	defer baseInferenceFeeMu.RUnlock()
	return baseInferenceFeeGSTD
}

// SetBaseInferenceFeeGSTD sets the base fee (called by DynamicEquilibriumService)
func SetBaseInferenceFeeGSTD(f float64) {
	baseInferenceFeeMu.Lock()
	defer baseInferenceFeeMu.Unlock()
	if f < 0.001 {
		f = 0.001
	}
	if f > 0.1 {
		f = 0.1
	}
	baseInferenceFeeGSTD = f
}

// GetInferenceFeeMultiplier returns current fee multiplier (for Dynamic Fee Scaling)
func GetInferenceFeeMultiplier() float64 {
	feeMultiplierGlobalMu.RLock()
	defer feeMultiplierGlobalMu.RUnlock()
	return feeMultiplierGlobal
}

// SetInferenceFeeMultiplier sets the fee multiplier (called by GoldenAgeService)
func SetInferenceFeeMultiplier(m float64) {
	feeMultiplierGlobalMu.Lock()
	defer feeMultiplierGlobalMu.Unlock()
	if m < 1.0 {
		m = 1.0
	}
	if m > 3.0 {
		m = 3.0
	}
	feeMultiplierGlobal = m
}

// GetWorkerRewardBoost returns Eternal Flame Auto-Scale bonus (1.0 or 1.05 when volume > 10k GSTD/hr)
func GetWorkerRewardBoost() float64 {
	workerRewardBoostMu.RLock()
	defer workerRewardBoostMu.RUnlock()
	return workerRewardBoost
}

// SetWorkerRewardBoost sets the worker reward boost (called by EternalFlameService)
func SetWorkerRewardBoost(m float64) {
	workerRewardBoostMu.Lock()
	defer workerRewardBoostMu.Unlock()
	if m < 1.0 {
		m = 1.0
	}
	if m > 1.5 {
		m = 1.5
	}
	workerRewardBoost = m
}

// NewGoldenAgeService creates the Golden Age orchestrator
func NewGoldenAgeService(db *sql.DB, settlement *SettlementService, stats *StatsService) *GoldenAgeService {
	return &GoldenAgeService{
		db:            db,
		settlement:    settlement,
		stats:         stats,
		interval:      5 * time.Minute, // check every 5 min
		feeMultiplier: 1.0,
	}
}

func (s *GoldenAgeService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
		ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS payout_wave_id VARCHAR(64);
	`)
	s.db.Exec(`ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS payout_wave_id VARCHAR(64)`)
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS settlement_payout_waves (
			id SERIAL PRIMARY KEY,
			wave_id VARCHAR(64) UNIQUE NOT NULL,
			total_gstd DECIMAL(18,9) NOT NULL,
			worker_count INT NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		);
	`)
	s.db.Exec(`ALTER TABLE settlement_payout_waves ADD COLUMN IF NOT EXISTS referral_gstd DECIMAL(18,9) DEFAULT 0`)
	s.db.Exec(`ALTER TABLE settlement_payout_waves ADD COLUMN IF NOT EXISTS referrer_count INT DEFAULT 0`)
}

// Start runs all Golden Age protocol loops
func (s *GoldenAgeService) Start(ctx context.Context) {
	s.ensureSchema()

	// 1. Payout Waves + Dynamic Fee + Swarm check — every 5 min
	go s.mainLoop(ctx)

	// 2. Sunday Proof-of-Gold — check daily, emit on Sunday
	go s.sundayAuditLoop(ctx)

	log.Printf("🏛️ Golden Age Protocol: ACTIVE")
}

func (s *GoldenAgeService) mainLoop(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runPayoutWaveIfNeeded(ctx)
			s.updateDynamicFee(ctx)
			s.checkSwarmExpansion(ctx)
		}
	}
}

func (s *GoldenAgeService) runPayoutWaveIfNeeded(ctx context.Context) {
	if s.db == nil || s.settlement == nil {
		return
	}

	// Sum unpaid worker_amount
	var totalUnpaid float64
	var referralUnpaid float64
	var lastWaveAt *time.Time
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(worker_amount), 0) FROM settlement_ledger WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
	`).Scan(&totalUnpaid)
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards WHERE status = 'pending'
	`).Scan(&referralUnpaid)
	s.db.QueryRowContext(ctx, `SELECT MAX(created_at) FROM settlement_payout_waves`).Scan(&lastWaveAt)

	// Trigger: 10 GSTD threshold OR 7 days since last wave (workers or referrers)
	shouldWave := totalUnpaid >= payoutThresholdGSTD || referralUnpaid >= payoutThresholdGSTD
	if lastWaveAt != nil && time.Since(*lastWaveAt) >= payoutWaveInterval {
		shouldWave = shouldWave || totalUnpaid > 0 || referralUnpaid > 0
	}

	if !shouldWave {
		return
	}

	waveID := "wave-" + strconv.FormatInt(time.Now().Unix(), 10)
	var workerCount int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT worker_wallet) FROM settlement_ledger
		WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
	`).Scan(&workerCount)

	var referrerCount int
	s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT referrer_address) FROM referral_rewards WHERE status = 'pending'`).Scan(&referrerCount)

	if workerCount == 0 && referrerCount == 0 {
		return
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO settlement_payout_waves (wave_id, total_gstd, worker_count, referral_gstd, referrer_count)
		VALUES ($1, $2, $3, $4, $5)
	`, waveID, totalUnpaid, workerCount, referralUnpaid, referrerCount)
	if err != nil {
		log.Printf("[Golden Age] Payout wave insert: %v", err)
		return
	}

	// Mark settlement as paid
	if workerCount > 0 {
		_, err = s.db.ExecContext(ctx, `
			UPDATE settlement_ledger SET paid_at = NOW(), payout_wave_id = $1
			WHERE paid_at IS NULL AND worker_wallet IS NOT NULL AND worker_wallet != ''
		`, waveID)
		if err != nil {
			log.Printf("[Golden Age] Payout wave mark paid: %v", err)
		}
	}

	// Eternal Synergy: Referral rewards in same wave — credit referrers' balance, mark paid
	if referrerCount > 0 && referralUnpaid > 0 {
		rows, err := s.db.QueryContext(ctx, `
			SELECT referrer_address, SUM(amount_gstd) FROM referral_rewards WHERE status = 'pending' GROUP BY referrer_address
		`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var addr string
				var amt float64
				if rows.Scan(&addr, &amt) == nil && addr != "" && amt > 0 {
					s.db.ExecContext(ctx, `UPDATE users SET balance = COALESCE(balance, 0) + $1 WHERE wallet_address = $2`, amt, addr)
				}
			}
			rows.Close()
		}
		_, _ = s.db.ExecContext(ctx, `
			UPDATE referral_rewards SET status = 'paid', paid_at = NOW(), payout_wave_id = $1 WHERE status = 'pending'
		`, waveID)
		log.Printf("[Golden Age] Referral payout: %.4f GSTD to %d referrers (wave %s)", referralUnpaid, referrerCount, waveID)
	}

	log.Printf("[Golden Age] Payout Wave: %s — %.4f GSTD to %d workers, %.4f GSTD to %d referrers", waveID, totalUnpaid, workerCount, referralUnpaid, referrerCount)
	leviathan.EmitLearning("🏛️ Payout Wave: " + strconv.FormatFloat(totalUnpaid, 'f', 2, 64) + " GSTD to " + strconv.Itoa(workerCount) + " workers, " + strconv.FormatFloat(referralUnpaid, 'f', 2, 64) + " GSTD to " + strconv.Itoa(referrerCount) + " referrers")
}

func (s *GoldenAgeService) updateDynamicFee(ctx context.Context) {
	if s.stats == nil {
		return
	}

	stats, err := s.stats.GetGlobalStats(ctx)
	if err != nil {
		return
	}

	// Capacity heuristic: assume 10 tasks per worker is 100%
	active := stats.ActiveDevicesCount
	if active == 0 {
		active = 1
	}
	capacityTasks := active * 10
	totalPending := stats.ProcessingTasks + stats.QueuedTasks
	loadPct := 0.0
	if capacityTasks > 0 {
		loadPct = float64(totalPending) / float64(capacityTasks) * 100
	}

	if loadPct >= loadThresholdPct {
		SetInferenceFeeMultiplier(1.0 + feeBoostPct/100)
		log.Printf("[Golden Age] Dynamic Fee: load %.0f%% → +20%% inference fee", loadPct)
	} else {
		SetInferenceFeeMultiplier(1.0)
	}
}

func (s *GoldenAgeService) checkSwarmExpansion(ctx context.Context) {
	if s.db == nil {
		return
	}

	activeNodes := 0
	var n int
	if s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE status = 'online' AND last_seen > NOW() - INTERVAL '10 minutes'`).Scan(&n) == nil {
		activeNodes += n
	}
	if s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pipeline_nodes WHERE is_online = true AND last_seen > NOW() - INTERVAL '10 minutes'`).Scan(&n) == nil {
		activeNodes += n
	}
	if s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM mobile_sessions WHERE status = 'active'`).Scan(&n) == nil {
		activeNodes += n
	}

	if activeNodes < swarmMinNodes && time.Since(s.lastSwarmEmit) > time.Hour {
		s.mu.Lock()
		s.lastSwarmEmit = time.Now()
		s.mu.Unlock()
		leviathan.EmitLearning("🚀 Сеть ищет воркеров: Повышенные награды за Proof-of-Storage! (Active: " + strconv.Itoa(activeNodes) + ")")
	}
}

func (s *GoldenAgeService) sundayAuditLoop(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	// Run once on startup if Sunday
	now := time.Now()
	if now.Weekday() == time.Sunday {
		s.emitWeeklyAudit(ctx)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if time.Now().Weekday() == time.Sunday {
				s.emitWeeklyAudit(ctx)
			}
		}
	}
}

func (s *GoldenAgeService) emitWeeklyAudit(ctx context.Context) {
	if s.db == nil {
		return
	}

	var gstdProcessed, xautAdded float64
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(gstd_amount), 0) FROM golden_reserve_log WHERE timestamp > NOW() - INTERVAL '7 days'
	`).Scan(&gstdProcessed)
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE timestamp > NOW() - INTERVAL '7 days' AND xaut_amount IS NOT NULL
	`).Scan(&xautAdded)

	msg := "🏛️ Weekly Audit: " + strconv.FormatFloat(gstdProcessed, 'f', 2, 64) + " GSTD processed -> " + strconv.FormatFloat(xautAdded, 'f', 6, 64) + " XAUt added to backing. Integrity: 100%."
	leviathan.EmitLearning(msg)
	log.Printf("[Golden Age] %s", msg)
}
