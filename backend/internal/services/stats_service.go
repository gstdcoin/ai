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
	TotalRewardsTon    float64 `json:"total_rewards_ton"`
	ActiveDevicesCount int     `json:"active_devices_count"`
}

func (s *StatsService) GetGlobalStats(ctx context.Context) (*GlobalStats, error) {
	stats := &GlobalStats{}

	// Initialize with safe defaults
	stats.ProcessingTasks = 0
	stats.QueuedTasks = 0
	stats.CompletedTasks = 0
	stats.TotalRewardsTon = 0.0
	stats.ActiveDevicesCount = 0

	// 1. Processing tasks (status = 'assigned' or 'executing')
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status IN ('assigned', 'executing', 'validating')
	`).Scan(&stats.ProcessingTasks)
	if err != nil {
		// Log error but continue with default value (0)
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

	// 4. Total rewards paid (using labor_compensation_ton instead of deprecated reward_amount_ton)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(labor_compensation_ton), 0) FROM tasks WHERE status = 'completed'
	`).Scan(&stats.TotalRewardsTon)
	if err != nil {
		stats.TotalRewardsTon = 0.0
	}

	// 5. Active devices count (seen in last 5 minutes)
	// Use COALESCE to handle NULL case when no devices exist
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM devices WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND is_active = true
	`).Scan(&stats.ActiveDevicesCount)
	if err != nil {
		stats.ActiveDevicesCount = 0
	}

	return stats, nil
}

type NetworkStats struct {
	ActiveWorkers    int     `json:"active_workers"`
	TotalGSTDPaid    float64 `json:"total_gstd_paid"`
	Tasks24h         int     `json:"tasks_24h"`
}

func (s *StatsService) GetNetworkStats(ctx context.Context) (*NetworkStats, error) {
	stats := &NetworkStats{}

	// 1. Total active workers (last 10 mins)
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM devices WHERE is_active = true AND last_seen_at > NOW() - INTERVAL '10 minutes'
	`).Scan(&stats.ActiveWorkers)
	if err != nil {
		stats.ActiveWorkers = 0
	}

	// 2. Total GSTD paid (all time)
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(labor_compensation_ton), 0) FROM tasks WHERE status = 'completed'
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

	return stats, nil
}

// TaskCompletionData represents task completion statistics over time
type TaskCompletionData struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
	TON   float64 `json:"ton"`
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
				COALESCE(SUM(labor_compensation_ton), 0) as ton
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
				COALESCE(SUM(labor_compensation_ton), 0) as ton
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
				COALESCE(SUM(labor_compensation_ton), 0) as ton
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
				COALESCE(SUM(labor_compensation_ton), 0) as ton
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
		if err := rows.Scan(&item.Date, &item.Count, &item.TON); err != nil {
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

