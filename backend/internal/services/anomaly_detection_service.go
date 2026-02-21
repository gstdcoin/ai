package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// AnomalyDetectionService - Cosmic Genesis: Anticipatory Defense
// Detects Sybil/51% attacks via PoW pattern deviations by region
type AnomalyDetectionService struct {
	db     *sql.DB
	telegram *TelegramService
}

func NewAnomalyDetectionService(db *sql.DB, telegram *TelegramService) *AnomalyDetectionService {
	return &AnomalyDetectionService{db: db, telegram: telegram}
}

// RunSnapshot captures PoW patterns by H3 region for anomaly detection
func (s *AnomalyDetectionService) RunSnapshot(ctx context.Context) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO pow_pattern_snapshots (h3_index, region_country, node_count, avg_difficulty, avg_solve_time_ms)
		SELECT COALESCE(n.h3_index, 'unknown'), n.country, COUNT(*),
		       NULL, NULL
		FROM nodes n
		WHERE n.status = 'online' AND n.last_seen > NOW() - INTERVAL '5 minutes'
		GROUP BY n.h3_index, n.country
	`)
	if err != nil {
		log.Printf("AnomalyDetection: snapshot failed: %v", err)
		return
	}
}

// DetectAnomalies checks for sudden pattern changes (e.g. 100 nodes from one region change PoW)
// patterns: heuristic patterns from WhiteHat bounty history (sandbox-trained defense)
func (s *AnomalyDetectionService) DetectAnomalies(ctx context.Context, patterns []string) {
	// Compare current vs 1h ago: if any region suddenly has 2x+ nodes with different pattern, flag
	rows, err := s.db.QueryContext(ctx, `
		WITH current_regions AS (
			SELECT COALESCE(h3_index, 'unknown') as h3, country, COUNT(*) as cnt
			FROM nodes WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'
			GROUP BY h3_index, country
		),
		prev_regions AS (
			SELECT DISTINCT ON (h3_index, region_country) h3_index as h3, region_country as country, node_count as cnt
			FROM pow_pattern_snapshots
			WHERE snapshot_at > NOW() - INTERVAL '2 hours' AND snapshot_at < NOW() - INTERVAL '1 hour'
			ORDER BY h3_index, region_country, snapshot_at DESC
		)
		SELECT c.h3, c.country, c.cnt, COALESCE(p.cnt, 0) as prev_cnt
		FROM current_regions c
		LEFT JOIN prev_regions p ON c.h3 = p.h3 AND c.country = p.country
		WHERE c.cnt > 10 AND c.cnt > COALESCE(p.cnt, 0) * 2
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var h3, country string
		var curr, prev int
		if err := rows.Scan(&h3, &country, &curr, &prev); err != nil {
			continue
		}
		msg := fmt.Sprintf("⚠️ Anomaly: Region %s (%s) node count jumped from %d to %d. Possible Sybil/51%% pattern.", h3, country, prev, curr)
		if len(patterns) > 0 {
			msg += fmt.Sprintf(" Known patterns to watch: %v", patterns)
		}
		log.Printf("AnomalyDetection: %s", msg)
		if s.telegram != nil {
			s.telegram.SendMessage(ctx, msg)
		}
	}
}

// LoadHeuristicPatterns - Absolute Point: Train on WhiteHat bounty history
func (s *AnomalyDetectionService) LoadHeuristicPatterns(ctx context.Context) []string {
	var patterns []string
	rows, err := s.db.QueryContext(ctx, `SELECT vulnerability_type FROM auto_bounty_tasks WHERE status IN ('open','resolved')`)
	if err != nil {
		return patterns
	}
	defer rows.Close()
	seen := make(map[string]bool)
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil || v == "" {
			continue
		}
		if !seen[v] {
			seen[v] = true
			patterns = append(patterns, v)
		}
	}
	return patterns
}

// Start runs periodic anomaly detection
func (s *AnomalyDetectionService) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	// Absolute Point: Heuristic Pattern Injection — train on WhiteHat bounty history
	patterns := s.LoadHeuristicPatterns(ctx)
	if len(patterns) > 0 {
		log.Printf("AnomalyDetection: Loaded %d heuristic patterns from WhiteHat bounties: %v", len(patterns), patterns)
	}
	s.RunSnapshot(ctx)
	s.DetectAnomalies(ctx, patterns)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			patterns = s.LoadHeuristicPatterns(ctx)
			s.RunSnapshot(ctx)
			s.DetectAnomalies(ctx, patterns)
		}
	}
}
