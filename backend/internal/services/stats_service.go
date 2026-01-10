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

	// 1. Processing tasks (status = 'assigned' or 'executing')
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status IN ('assigned', 'executing', 'validating')
	`).Scan(&stats.ProcessingTasks)
	if err != nil {
		return nil, err
	}

	// 2. Queued tasks (status = 'pending')
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status = 'pending'
	`).Scan(&stats.QueuedTasks)
	if err != nil {
		return nil, err
	}

	// 3. Completed tasks
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks WHERE status = 'completed'
	`).Scan(&stats.CompletedTasks)
	if err != nil {
		return nil, err
	}

	// 4. Total rewards paid
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(reward_amount_ton), 0) FROM tasks WHERE status = 'completed'
	`).Scan(&stats.TotalRewardsTon)
	if err != nil {
		return nil, err
	}

	// 5. Active devices count (seen in last 5 minutes)
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM devices WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND is_active = true
	`).Scan(&stats.ActiveDevicesCount)
	if err != nil {
		return nil, err
	}

	return stats, nil
}

