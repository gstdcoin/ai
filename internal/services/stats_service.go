package services

import (
	"context"
	"database/sql"

	leviathan "distributed-computing-platform/internal/services/leviathan"
)

type StatsService struct {
	db          *sql.DB
	poolMonitor *PoolMonitorService
}

func (s *StatsService) SetPoolMonitor(pm *PoolMonitorService) {
	s.poolMonitor = pm
}

func NewStatsService(db *sql.DB) *StatsService {
	return &StatsService{db: db}
}

type GlobalStats struct {
	ProcessingTasks    int     `json:"processing_tasks"`
	QueuedTasks        int     `json:"queued_tasks"`
	CompletedTasks     int     `json:"completed_tasks"`
	TotalRewardsGSTD   float64 `json:"total_rewards_gstd"`
	ActiveDevicesCount int     `json:"active_devices_count"`
	TotalTFLOPS        float64 `json:"total_tflops"`
	ActiveCountries    int     `json:"active_countries"`
}

func (s *StatsService) GetGlobalStats(ctx context.Context) (*GlobalStats, error) {
	stats := &GlobalStats{}

	// Initialize with safe defaults
	stats.ProcessingTasks = 0
	stats.QueuedTasks = 0
	stats.CompletedTasks = 0
	stats.TotalRewardsGSTD = 0.0
	stats.ActiveDevicesCount = 0
	stats.TotalTFLOPS = 0.0
	stats.ActiveCountries = 0

	// 1. Processing tasks (status = 'assigned' or 'executing')
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status IN ('assigned', 'executing', 'validating')
	`).Scan(&stats.ProcessingTasks)
	if err != nil {
		stats.ProcessingTasks = 0
	}

	// 2. Queued tasks (status = 'pending')
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status = 'pending'
	`).Scan(&stats.QueuedTasks)
	if err != nil {
		stats.QueuedTasks = 0
	}

	// 3. Completed tasks
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status = 'completed'
	`).Scan(&stats.CompletedTasks)
	if err != nil {
		stats.CompletedTasks = 0
	}

	// 4. Total rewards paid (using labor_compensation_gstd)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(labor_compensation_gstd), 0) FROM tasks WHERE status = 'completed'
	`).Scan(&stats.TotalRewardsGSTD)
	if err != nil {
		stats.TotalRewardsGSTD = 0.0
	}

	// 5. Active devices count & TFLOPS estimation
	// We estimate TFLOPS based on CPU cores (simplified: 1 core ~ 0.1 TFLOPS for standard consumer hardware in distributed network)
	// Also get active countries count

	// Active devices (last 5 minutes)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM devices WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND is_active = true
	`).Scan(&stats.ActiveDevicesCount)
	if err != nil {
		stats.ActiveDevicesCount = 0
	}

	// Eco Certification Bonus Logic:
	// We count nodes that are eco_certified to display in the UI / Marketing
	// This is implicitly handled by ActiveDevicesCount for now but could be split if requested.

	// TFLOPS Estimation (using nodes table if available; nodes use status='online')
	var activeNodesCount int
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM nodes WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'
	`).Scan(&activeNodesCount)

	if err == nil && activeNodesCount > 0 {
		// Use nodes count * 1.5 (assuming roughly 1.5 TFLOPS per node average for simplified metric)
		stats.TotalTFLOPS = float64(activeNodesCount) * 1.5
	} else {
		// Fallback to devices count
		stats.TotalTFLOPS = float64(stats.ActiveDevicesCount) * 0.5
	}

	// Active Countries (nodes use status='online')
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT country) FROM nodes WHERE status = 'online' AND country IS NOT NULL AND country != ''
	`).Scan(&stats.ActiveCountries)
	if err != nil {
		// If nodes table query fails or no country data
		stats.ActiveCountries = 0
		// Fallback: If we have active devices but no country data, assume at least 1 country
		if stats.ActiveDevicesCount > 0 {
			stats.ActiveCountries = 1
		}
	}

	return stats, nil
}

type NetworkStats struct {
	ActiveWorkers        int     `json:"active_workers"`
	TotalGSTDPaid        float64 `json:"total_gstd_paid"`
	Tasks24h             int     `json:"tasks_24h"`
	TotalTasks           int     `json:"total_tasks"`
	Temperature          float64 `json:"temperature"`
	Pressure             float64 `json:"pressure"`
	TotalHashrate        float64 `json:"total_hashrate"`
	GoldReserve          float64 `json:"gold_reserve"`
	GoldenReserveXAUt    float64 `json:"golden_reserve_xaut"`
	GSTDPriceUSD         float64 `json:"gstd_price_usd"`
	LastAuditDate        string  `json:"last_audit_date"`
	AuditVerified        bool    `json:"audit_verified"`
	BackingRatio         float64 `json:"backing_ratio"`
	TotalBurnedGSTD      float64 `json:"total_burned"`            // Admin Treasury View
	TotalXAUtBought      float64 `json:"total_xaut_bought"`       // Admin Treasury View
	NetworkIQ            float64 `json:"network_iq"`              // Public Proof of Intelligence (Leviathan)
	GlobalBrainLatencyMs int     `json:"global_brain_latency_ms"` // Avg ping from network_measurements
}

// scanInt runs a single-row query and scans into *dst; on error, *dst is left unchanged.
func (s *StatsService) scanInt(ctx context.Context, dst *int, query string) {
	_ = s.db.QueryRowContext(ctx, query).Scan(dst)
}

// scanFloat runs a single-row query and scans into *dst; on error, *dst is left unchanged.
func (s *StatsService) scanFloat(ctx context.Context, dst *float64, query string) {
	_ = s.db.QueryRowContext(ctx, query).Scan(dst)
}

func (s *StatsService) GetNetworkStats(ctx context.Context) (*NetworkStats, error) {
	stats := &NetworkStats{}

	// 1. Network size — count only ONLINE nodes and active devices
	var onlineNodes, activeDevices int
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE status='online' AND last_seen > NOW()-INTERVAL '5 min'`).Scan(&onlineNodes)
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM devices WHERE is_active=true AND last_seen_at > NOW()-INTERVAL '5 min'`).Scan(&activeDevices)
	stats.ActiveWorkers = max(onlineNodes, activeDevices)

	// 2–3. Aggregate task and payout stats
	s.scanFloat(ctx, &stats.TotalGSTDPaid, `SELECT COALESCE(SUM(labor_compensation_gstd), 0) FROM tasks WHERE status = 'completed'`)
	s.scanInt(ctx, &stats.Tasks24h, `SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'`)
	s.scanInt(ctx, &stats.TotalTasks, `SELECT COUNT(*) FROM tasks WHERE status = 'completed'`)

	// 4. Network Temperature (Average Entropy Score)
	stats.Temperature = 0.1
	s.scanFloat(ctx, &stats.Temperature, `SELECT COALESCE(AVG(entropy_score), 0.1) FROM operation_entropy`)

	// 5. Computational Pressure
	var pendingTasks int
	s.scanInt(ctx, &pendingTasks, `SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'queued', 'assigned', 'executing')`)

	if stats.ActiveWorkers > 0 {
		stats.Pressure = float64(pendingTasks) / float64(stats.ActiveWorkers)
	} else {
		stats.Pressure = float64(pendingTasks)
	}

	// 6. Total Hashrate (PFLOPS) - estimate from ACTIVE workers only
	stats.TotalHashrate = float64(stats.ActiveWorkers) * 0.5

	// 7. Gold Reserve (Get from latest log)
	s.scanFloat(ctx, &stats.GoldReserve, `SELECT COALESCE(xaut_amount, 0) FROM golden_reserve_log ORDER BY timestamp DESC LIMIT 1`)
	// Populate GoldenReserveXAUt from GoldReserve for consistency
	stats.GoldenReserveXAUt = stats.GoldReserve

	if s.poolMonitor != nil {
		if price, err := s.poolMonitor.GetGSTDPriceUSD(ctx); err == nil && price > 0 {
			stats.GSTDPriceUSD = price
		}
	}

	// 8. Nightly Audit Stats
	if err := s.db.QueryRowContext(ctx, `
		SELECT TO_CHAR(audit_date, 'YYYY-MM-DD'), verified, COALESCE(backing_ratio_percent, 0)
		FROM nightly_audits 
		ORDER BY audit_date DESC 
		LIMIT 1
	`).Scan(&stats.LastAuditDate, &stats.AuditVerified, &stats.BackingRatio); err != nil {
		stats.LastAuditDate = ""
		stats.AuditVerified = false
		stats.BackingRatio = 0
	}

	// 9. Admin Treasury View: total burned GSTD, total XAUt bought
	s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns`).Scan(&stats.TotalBurnedGSTD)
	s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE xaut_amount IS NOT NULL`).Scan(&stats.TotalXAUtBought)

	// 10. Public Proof of Intelligence: Network IQ (Leviathan) + Global Brain Latency
	if iq, ok := leviathan.GetSystemIQSafe(); ok {
		stats.NetworkIQ = iq
	}
	var avgLatency float64
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(AVG(latency_ms), 0)::float FROM network_measurements WHERE recorded_at > NOW() - INTERVAL '1 hour' AND latency_ms IS NOT NULL`).Scan(&avgLatency); err == nil {
		stats.GlobalBrainLatencyMs = int(avgLatency)
	}

	return stats, nil
}

// TaskCompletionData represents task completion statistics over time
type TaskCompletionData struct {
	Date  string  `json:"date"`
	Count int     `json:"count"`
	GSTD  float64 `json:"gstd"`
}

// GetTaskCompletionHistory returns task completion data grouped by time period
func (s *StatsService) GetTaskCompletionHistory(ctx context.Context, period string) ([]TaskCompletionData, error) {
	var query string
	var data []TaskCompletionData

	switch period {
	case "hour":
		// Last 24 hours, grouped by hour
		query = `
			SELECT 
				TO_CHAR(completed_at, 'YYYY-MM-DD HH24:00') as date,
				COUNT(*) as count,
				COALESCE(SUM(labor_compensation_gstd), 0) as gstd
			FROM tasks
			WHERE status = 'completed' 
				AND completed_at > NOW() - INTERVAL '24 hours'
			GROUP BY TO_CHAR(completed_at, 'YYYY-MM-DD HH24:00')
			ORDER BY date ASC
		`
	case "week":
		// Last 12 weeks, grouped by week
		query = `
			SELECT 
				TO_CHAR(DATE_TRUNC('week', completed_at), 'YYYY-MM-DD') as date,
				COUNT(*) as count,
				COALESCE(SUM(labor_compensation_gstd), 0) as gstd
			FROM tasks
			WHERE status = 'completed' 
				AND completed_at > NOW() - INTERVAL '12 weeks'
			GROUP BY DATE_TRUNC('week', completed_at)
			ORDER BY date ASC
		`
	default:
		// "day" and any unrecognized period — last 30 days grouped by day
		query = `
			SELECT 
				TO_CHAR(completed_at, 'YYYY-MM-DD') as date,
				COUNT(*) as count,
				COALESCE(SUM(labor_compensation_gstd), 0) as gstd
			FROM tasks
			WHERE status = 'completed' 
				AND completed_at > NOW() - INTERVAL '30 days'
			GROUP BY TO_CHAR(completed_at, 'YYYY-MM-DD')
			ORDER BY date ASC
		`
	}

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		// Return empty array instead of error to prevent frontend crashes
		return []TaskCompletionData{}, nil
	}
	defer rows.Close()

	for rows.Next() {
		var item TaskCompletionData
		if err := rows.Scan(&item.Date, &item.Count, &item.GSTD); err != nil {
			// Skip invalid rows but continue processing
			continue
		}
		data = append(data, item)
	}

	// Return empty array if no data found
	if err := rows.Err(); err != nil {
		return []TaskCompletionData{}, nil
	}

	return data, nil
}
