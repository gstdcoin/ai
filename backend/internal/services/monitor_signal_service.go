package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// MonitorSignalStats represents the real-time stats for a planetary signal
type MonitorSignalStats struct {
	SignalID           string  `json:"signal_id"`
	Category           string  `json:"category"`
	TotalSponsored     float64 `json:"total_sponsored"`
	TotalGSTDAllocated float64 `json:"total_gstd_allocated"`
	SponsorCount       int     `json:"sponsor_count"`
	ContributorCount   int     `json:"contributor_count"`
	TasksCreated       int     `json:"tasks_created"`
	TasksCompleted     int     `json:"tasks_completed"`
	DataProcessedTB    float64 `json:"data_processed_tb"`
	Progress           int     `json:"progress"`
	LastResult         string  `json:"last_result,omitempty"`
	LastSponsoredAt    *string `json:"last_sponsored_at,omitempty"`
	LastCompletedAt    *string `json:"last_completed_at,omitempty"`
}

// MonitorSignalService manages planetary signal tracking
type MonitorSignalService struct {
	db *sql.DB
}

// NewMonitorSignalService creates a new monitor signal service
func NewMonitorSignalService(db *sql.DB) *MonitorSignalService {
	return &MonitorSignalService{db: db}
}

// GetAllSignalStats returns real stats for all monitor signals
func (s *MonitorSignalService) GetAllSignalStats(ctx context.Context) ([]MonitorSignalStats, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT signal_id, category, total_sponsored, total_gstd_allocated,
		       sponsor_count, contributor_count, tasks_created, tasks_completed,
		       data_processed_tb, progress, last_result,
		       last_sponsored_at, last_completed_at
		FROM monitor_signals
		ORDER BY category, signal_id
	`)
	if err != nil {
		return nil, fmt.Errorf("query monitor_signals: %w", err)
	}
	defer rows.Close()

	var stats []MonitorSignalStats
	for rows.Next() {
		var st MonitorSignalStats
		var lastResult sql.NullString
		var lastSponsored, lastCompleted sql.NullTime
		err := rows.Scan(&st.SignalID, &st.Category, &st.TotalSponsored, &st.TotalGSTDAllocated,
			&st.SponsorCount, &st.ContributorCount, &st.TasksCreated, &st.TasksCompleted,
			&st.DataProcessedTB, &st.Progress, &lastResult,
			&lastSponsored, &lastCompleted)
		if err != nil {
			continue
		}
		if lastResult.Valid {
			st.LastResult = lastResult.String
		}
		if lastSponsored.Valid {
			t := lastSponsored.Time.Format(time.RFC3339)
			st.LastSponsoredAt = &t
		}
		if lastCompleted.Valid {
			t := lastCompleted.Time.Format(time.RFC3339)
			st.LastCompletedAt = &t
		}
		stats = append(stats, st)
	}
	return stats, nil
}

// GetSignalStats returns stats for a single signal
func (s *MonitorSignalService) GetSignalStats(ctx context.Context, signalID string) (*MonitorSignalStats, error) {
	var st MonitorSignalStats
	var lastResult sql.NullString
	var lastSponsored, lastCompleted sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT signal_id, category, total_sponsored, total_gstd_allocated,
		       sponsor_count, contributor_count, tasks_created, tasks_completed,
		       data_processed_tb, progress, last_result,
		       last_sponsored_at, last_completed_at
		FROM monitor_signals WHERE signal_id = $1
	`, signalID).Scan(&st.SignalID, &st.Category, &st.TotalSponsored, &st.TotalGSTDAllocated,
		&st.SponsorCount, &st.ContributorCount, &st.TasksCreated, &st.TasksCompleted,
		&st.DataProcessedTB, &st.Progress, &lastResult,
		&lastSponsored, &lastCompleted)
	if err != nil {
		return nil, err
	}
	if lastResult.Valid {
		st.LastResult = lastResult.String
	}
	if lastSponsored.Valid {
		t := lastSponsored.Time.Format(time.RFC3339)
		st.LastSponsoredAt = &t
	}
	if lastCompleted.Valid {
		t := lastCompleted.Time.Format(time.RFC3339)
		st.LastCompletedAt = &t
	}
	return &st, nil
}

// RecordSponsorship records a real sponsorship and updates signal stats
func (s *MonitorSignalService) RecordSponsorship(ctx context.Context, signalID, userID string, starsPaid int, gstdReward, gstdGoldFee float64, taskID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Insert sponsorship record
	_, err = tx.ExecContext(ctx, `
		INSERT INTO monitor_sponsorships (signal_id, user_id, stars_paid, gstd_reward, gstd_gold_fee, task_id, status)
		VALUES ($1, $2, $3, $4, $5, $6, 'processing')
	`, signalID, userID, starsPaid, gstdReward, gstdGoldFee, taskID)
	if err != nil {
		return fmt.Errorf("insert sponsorship: %w", err)
	}

	// Update signal stats atomically (Upsert to support new un-seeded signals)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO monitor_signals (
			signal_id, category, total_sponsored, total_gstd_allocated, total_gstd_gold, 
			sponsor_count, tasks_created, progress, data_processed_tb, tasks_completed, contributor_count,
			last_sponsored_at, updated_at
		) VALUES (
			$4, 'Dynamic Signal', $1, $2, $3, 1, 1, 5, 0, 0, 0, NOW(), NOW()
		) ON CONFLICT (signal_id) DO UPDATE SET
			total_sponsored = monitor_signals.total_sponsored + EXCLUDED.total_sponsored,
			total_gstd_allocated = monitor_signals.total_gstd_allocated + EXCLUDED.total_gstd_allocated,
			total_gstd_gold = monitor_signals.total_gstd_gold + EXCLUDED.total_gstd_gold,
			sponsor_count = monitor_signals.sponsor_count + 1,
			tasks_created = monitor_signals.tasks_created + 1,
			last_sponsored_at = NOW(),
			updated_at = NOW()
	`, starsPaid, gstdReward, gstdGoldFee, signalID)
	if err != nil {
		return fmt.Errorf("update signal: %w", err)
	}

	return tx.Commit()
}

// RecordTaskCompletion records a completed task result for a signal
func (s *MonitorSignalService) RecordTaskCompletion(ctx context.Context, signalID string, resultSummary string, dataProcessedTB float64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Update signal progress and stats
	_, err = tx.ExecContext(ctx, `
		UPDATE monitor_signals SET
			tasks_completed = tasks_completed + 1,
			data_processed_tb = data_processed_tb + $1,
			progress = LEAST(100, progress + GREATEST(1, CAST(($1 / GREATEST(data_processed_tb + $1, 0.1)) * 10 AS INTEGER))),
			last_result = $2,
			last_completed_at = NOW(),
			updated_at = NOW()
		WHERE signal_id = $3
	`, dataProcessedTB, resultSummary, signalID)
	if err != nil {
		return err
	}

	// Update sponsorship status
	_, err = tx.ExecContext(ctx, `
		UPDATE monitor_sponsorships SET status = 'completed', result_summary = $1, completed_at = NOW()
		WHERE signal_id = $2 AND status = 'processing'
		AND id = (SELECT id FROM monitor_sponsorships WHERE signal_id = $2 AND status = 'processing' ORDER BY created_at LIMIT 1)
	`, resultSummary, signalID)
	if err != nil {
		log.Printf("[MonitorSignal] update sponsorship status: %v", err)
	}

	return tx.Commit()
}

// IncrementContributors adds a compute contributor to a signal
func (s *MonitorSignalService) IncrementContributors(ctx context.Context, signalID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE monitor_signals SET contributor_count = contributor_count + 1, updated_at = NOW()
		WHERE signal_id = $1
	`, signalID)
	return err
}
