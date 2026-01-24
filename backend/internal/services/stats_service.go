package services

import (
	"context"
	"database/sql"
)

type StatsService struct {
	db *sql.DB
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

	// TFLOPS Estimation (using nodes table if available, or fallback to devices estimate)
	// Assuming nodes table has cpu info. If not, we estimate 0.5 TFLOPS per active device on average.
	// Let's check if 'nodes' table is populated, otherwise use 'devices' count * 0.5
	var activeNodesCount int
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM nodes WHERE status = 'active'
	`).Scan(&activeNodesCount)
	
	if err == nil && activeNodesCount > 0 {
		// Use nodes count * 1.5 (assuming roughly 1.5 TFLOPS per node average for simplified metric)
		stats.TotalTFLOPS = float64(activeNodesCount) * 1.5
	} else {
		// Fallback to devices count
		stats.TotalTFLOPS = float64(stats.ActiveDevicesCount) * 0.5
	}

	// Active Countries
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT country) FROM nodes WHERE status = 'active' AND country IS NOT NULL AND country != ''
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
	ActiveWorkers int     `json:"active_workers"`
	TotalGSTDPaid float64 `json:"total_gstd_paid"`
	Tasks24h      int     `json:"tasks_24h"`
	Temperature   float64 `json:"temperature"`
	Pressure      float64 `json:"pressure"`
	TotalHashrate float64 `json:"total_hashrate"`
}

func (s *StatsService) GetNetworkStats(ctx context.Context) (*NetworkStats, error) {
	stats := &NetworkStats{}

	// 1. Total active workers (last 30 seconds for "Live" status)
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM devices WHERE is_active = true AND last_seen_at > NOW() - INTERVAL '30 seconds'
	`).Scan(&stats.ActiveWorkers)
	if err != nil {
		stats.ActiveWorkers = 0
	}

	// 2. Total GSTD paid (all time)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(labor_compensation_gstd), 0) FROM tasks WHERE status = 'completed'
	`).Scan(&stats.TotalGSTDPaid)
	if err != nil {
		stats.TotalGSTDPaid = 0
	}

	// 3. Tasks completed in last 24h
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'
	`).Scan(&stats.Tasks24h)
	if err != nil {
		stats.Tasks24h = 0
	}

	// 4. Calculate Netork Temperature (Average Entropy Score)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(AVG(entropy_score), 0.1) FROM operation_entropy
	`).Scan(&stats.Temperature)
	if err != nil {
		stats.Temperature = 0.1
	}

	// 5. Calculate Computational Pressure (Queued + Processing) / ActiveNodes
	var pendingTasks int
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'queued', 'assigned', 'executing')
	`).Scan(&pendingTasks)
	
	activeNodes := stats.ActiveWorkers
	if activeNodes == 0 {
		// Try to count from nodes table if devices is 0
		s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes WHERE last_seen_at > NOW() - INTERVAL '30 seconds'").Scan(&activeNodes)
	}

	if activeNodes > 0 {
		stats.Pressure = float64(pendingTasks) / float64(activeNodes)
	} else {
		stats.Pressure = float64(pendingTasks)
	}

	// 6. Total Hashrate (Sum of current_hashrate from active nodes)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(current_hashrate), 0) FROM nodes WHERE last_seen_at > NOW() - INTERVAL '30 seconds'
	`).Scan(&stats.TotalHashrate)
	if err != nil {
		stats.TotalHashrate = 0
	}

	return stats, nil
}

// TaskCompletionData represents task completion statistics over time
type TaskCompletionData struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
	GSTD  float64 `json:"gstd"`
}

// GetTaskCompletionHistory returns task completion data grouped by time period
func (s *StatsService) GetTaskCompletionHistory(ctx context.Context, period string) ([]TaskCompletionData, error) {
	var query string
	var data []TaskCompletionData

	// Default to daily if period not specified
	if period == "" {
		period = "day"
	}

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
	case "day":
		// Last 30 days, grouped by day
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
		// Default to daily
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

