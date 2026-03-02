package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	leviathan "distributed-computing-platform/internal/services/leviathan"

	"github.com/lib/pq"
)

const (
	iqAutonomousExpansionThreshold = 95.0
	predictiveGrowthThresholdPct   = 15.0
)

// OmnipotenceService implements:
// - Predictive Resource Allocation: forecast topic spikes, proactive cache suggestions
// - Autonomous Expansion: at IQ 95.0, create Sub-agents for narrow niches
// - Golden Age Verification: every IQ increase correlates with golden standard update
type OmnipotenceService struct {
	db             *sql.DB
	platformWallet string
	interval       time.Duration
}

// NewOmnipotenceService creates the service.
func NewOmnipotenceService(db *sql.DB, platformWallet string) *OmnipotenceService {
	if platformWallet == "" {
		platformWallet = "platform_omnipotence"
	}
	return &OmnipotenceService{
		db:             db,
		platformWallet: platformWallet,
		interval:       10 * time.Minute,
	}
}

// RunPredictiveResourceAllocation analyzes trends and proactively suggests cache topics.
func (s *OmnipotenceService) RunPredictiveResourceAllocation(ctx context.Context) {
	// Compare this week vs last week for each topic, find topics with >15% growth
	rows, err := s.db.QueryContext(ctx, `
		WITH curr AS (
			SELECT query_topic as topic, COUNT(*) as cnt
			FROM brain_query_payments
			WHERE created_at > NOW() - INTERVAL '7 days' AND query_topic != '' AND query_topic IS NOT NULL
			GROUP BY query_topic
		),
		prev AS (
			SELECT query_topic as topic, COUNT(*) as cnt
			FROM brain_query_payments
			WHERE created_at > NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'
			  AND query_topic != '' AND query_topic IS NOT NULL
			GROUP BY query_topic
		)
		SELECT c.topic, c.cnt, COALESCE(p.cnt, 0),
		       CASE WHEN COALESCE(p.cnt, 0) > 0 THEN 100.0 * (c.cnt - p.cnt) / p.cnt ELSE 100 END as growth_pct
		FROM curr c
		LEFT JOIN prev p ON c.topic = p.topic
		WHERE c.cnt >= 2
		ORDER BY growth_pct DESC
		LIMIT 5
	`)
	if err != nil {
		return
	}
	defer rows.Close()
	var topics []string
	for rows.Next() {
		var topic string
		var currCnt, prevCnt int
		var growthPct float64
		if rows.Scan(&topic, &currCnt, &prevCnt, &growthPct) != nil || topic == "" {
			continue
		}
		if growthPct >= predictiveGrowthThresholdPct {
			topics = append(topics, topic)
		}
	}
	if len(topics) == 0 {
		return
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO knowledge_cache_suggestions (consumer_h3_index, suggested_topics, latency_ms)
		VALUES (NULL, $1, 0)
	`, pq.Array(topics))
	if err != nil {
		log.Printf("[Omnipotence] Predictive cache insert error: %v", err)
		return
	}
	log.Printf("[Omnipotence] Predictive Resource Allocation: trending topics %v → proactive cache", topics)
}

// RunAutonomousExpansion creates Sub-agents when IQ >= 95.0.
func (s *OmnipotenceService) RunAutonomousExpansion(ctx context.Context) {
	iq, ok := leviathan.GetSystemIQSafe()
	if !ok || iq < iqAutonomousExpansionThreshold {
		return
	}
	var existing int
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sub_agents`).Scan(&existing)
	if existing > 0 {
		return // Already expanded
	}
	niches := []struct {
		niche       string
		description string
	}{
		{"quantum_physics", "Quantum physics specialist"},
		{"hft_trading", "High-frequency trading analytics"},
		{"climate_modeling", "Climate and environmental modeling"},
		{"biomedical_research", "Biomedical and genomics research"},
		{"cybersecurity", "Threat intelligence and anomaly detection"},
	}
	for _, n := range niches {
		var agentID string
		err := s.db.QueryRowContext(ctx, `
			INSERT INTO agent_registry (owner_wallet, agent_name, description, capabilities, pricing_model, price_gstd, is_active)
			VALUES ($1, $2, $3, '["specialist","sub_agent"]', 'per_task', 0.05, true)
			RETURNING id
		`, s.platformWallet, "Sub-agent: "+n.niche, n.description).Scan(&agentID)
		if err != nil {
			log.Printf("[Omnipotence] Sub-agent insert error: %v", err)
			continue
		}
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO sub_agents (niche, agent_registry_id, description, triggered_at_iq)
			VALUES ($1, $2, $3, $4)
		`, n.niche, agentID, n.description, iq)
		if err != nil {
			log.Printf("[Omnipotence] Sub-agent link error: %v", err)
			continue
		}
	}
	leviathan.EmitLearning(fmt.Sprintf("🏛️ Omnipotence: Autonomous Expansion — Sub-agents created for niche specialization at IQ %.1f", iq))
	log.Printf("[Omnipotence] Autonomous Expansion: %d Sub-agents created at IQ %.1f", len(niches), iq)
}

// RunGoldenAgeVerification records IQ–gold correlation when IQ increases.
func (s *OmnipotenceService) RunGoldenAgeVerification(ctx context.Context) {
	iq, ok := leviathan.GetSystemIQSafe()
	if !ok {
		return
	}
	var lastIQ float64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(iq), 0) FROM iq_golden_verification`).Scan(&lastIQ)
	if err != nil || iq <= lastIQ {
		return
	}
	var reserveXAUt float64
	s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE xaut_amount IS NOT NULL`).Scan(&reserveXAUt)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO iq_golden_verification (iq, golden_reserve_xaut) VALUES ($1, $2)
	`, iq, reserveXAUt)
	if err != nil {
		log.Printf("[Omnipotence] Golden verification insert error: %v", err)
		return
	}
	leviathan.EmitLearning(fmt.Sprintf("🏆 Golden Age Verification: IQ %.1f — Intelligence backed by %.4f XAUt", iq, reserveXAUt))
	log.Printf("[Omnipotence] Golden Age Verification: IQ %.1f ↔ %.4f XAUt", iq, reserveXAUt)
}

// Start runs the Omnipotence loop.
func (s *OmnipotenceService) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	s.RunPredictiveResourceAllocation(ctx)
	s.RunAutonomousExpansion(ctx)
	s.RunGoldenAgeVerification(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.RunPredictiveResourceAllocation(ctx)
			s.RunAutonomousExpansion(ctx)
			s.RunGoldenAgeVerification(ctx)
		}
	}
}
