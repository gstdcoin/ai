package services

import (
	"context"
	"database/sql"
	"log"
	"time"

	leviathan "distributed-computing-platform/internal/services/leviathan"

	"github.com/lib/pq"
)

const (
	latencyThresholdMs = 250
	iqMilestoneStep    = 1.0
)

// SingularityGatewayService implements:
// - Latency Optimization: when global_brain_latency_ms > 250ms, suggest nearest nodes to cache hot vectors
// - IQ Milestone Alert: when IQ +1.0, broadcast to ticker
type SingularityGatewayService struct {
	db       *sql.DB
	interval time.Duration
}

// NewSingularityGatewayService creates the service.
func NewSingularityGatewayService(db *sql.DB) *SingularityGatewayService {
	return &SingularityGatewayService{
		db:       db,
		interval: 5 * time.Minute,
	}
}

// RunLatencyOptimization checks latency; if > 250ms, inserts cache suggestions for hot topics.
func (s *SingularityGatewayService) RunLatencyOptimization(ctx context.Context) {
	var avgLatency float64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(AVG(latency_ms), 0)::float FROM network_measurements WHERE recorded_at > NOW() - INTERVAL '1 hour' AND latency_ms IS NOT NULL`).Scan(&avgLatency)
	if err != nil || int(avgLatency) <= latencyThresholdMs {
		return
	}

	// Get most frequently requested topics (last 24h)
	rows, err := s.db.QueryContext(ctx, `
		SELECT query_topic, COUNT(*) as cnt FROM brain_query_payments 
		WHERE created_at > NOW() - INTERVAL '24 hours' AND query_topic != ''
		GROUP BY query_topic ORDER BY cnt DESC LIMIT 5
	`)
	if err != nil {
		return
	}
	defer rows.Close()
	var topics []string
	for rows.Next() {
		var t string
		var cnt int
		if rows.Scan(&t, &cnt) == nil && t != "" {
			topics = append(topics, t)
		}
	}
	if len(topics) == 0 {
		topics = []string{"global_knowledge_graph", "resonance_report"}
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO knowledge_cache_suggestions (consumer_h3_index, suggested_topics, latency_ms)
		VALUES (NULL, $1, $2)
	`, pq.Array(topics), int(avgLatency))
	if err != nil {
		log.Printf("[Singularity Gateway] Cache suggestion insert error: %v", err)
		return
	}
	log.Printf("[Singularity Gateway] Latency %.0fms > %dms → cache suggestions for %v", avgLatency, latencyThresholdMs, topics)
}

// RunIQMilestoneCheck compares current IQ to last; if +1.0, emits to ticker.
func (s *SingularityGatewayService) RunIQMilestoneCheck(ctx context.Context) {
	iq, ok := leviathan.GetSystemIQSafe()
	if !ok {
		return
	}
	var lastIQ float64
	err := s.db.QueryRowContext(ctx, `SELECT last_iq FROM iq_milestone_checkpoint ORDER BY id DESC LIMIT 1`).Scan(&lastIQ)
	if err != nil {
		_, _ = s.db.ExecContext(ctx, `INSERT INTO iq_milestone_checkpoint (last_iq) VALUES ($1) ON CONFLICT DO NOTHING`, iq)
		return
	}
	if iq >= lastIQ+iqMilestoneStep {
		leviathan.EmitIQMilestone(iq)
		_, _ = s.db.ExecContext(ctx, `UPDATE iq_milestone_checkpoint SET last_iq = $1, last_checked_at = NOW() WHERE id = (SELECT id FROM iq_milestone_checkpoint ORDER BY id DESC LIMIT 1)`, iq)
		// Golden Age Verification: correlate IQ increase with golden reserve
		var reserveXAUt float64
		s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE xaut_amount IS NOT NULL`).Scan(&reserveXAUt)
		s.db.ExecContext(ctx, `INSERT INTO iq_golden_verification (iq, golden_reserve_xaut) VALUES ($1, $2)`, iq, reserveXAUt)
		log.Printf("[Singularity Gateway] IQ Milestone: %.1f (was %.1f) — Golden verification: %.4f XAUt", iq, lastIQ, reserveXAUt)
	}
}

// Start runs the gateway loop.
func (s *SingularityGatewayService) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	s.RunLatencyOptimization(ctx)
	s.RunIQMilestoneCheck(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.RunLatencyOptimization(ctx)
			s.RunIQMilestoneCheck(ctx)
		}
	}
}
