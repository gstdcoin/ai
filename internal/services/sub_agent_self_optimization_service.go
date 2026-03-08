package services

import (
	"context"
	"database/sql"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
)

const (
	subAgentLessonsTopic = "sub_agent_lessons"
	maxLessonsPerCycle   = 3
)

// SubAgentSelfOptimizationService: sub-agents form their own lessons, exchange critical insights with central graph.
type SubAgentSelfOptimizationService struct {
	db       *sql.DB
	interval time.Duration
}

// NewSubAgentSelfOptimizationService creates the service.
func NewSubAgentSelfOptimizationService(db *sql.DB) *SubAgentSelfOptimizationService {
	return &SubAgentSelfOptimizationService{
		db:       db,
		interval: 20 * time.Minute,
	}
}

// nicheKeywords maps sub-agent niches to query keywords for matching.
var nicheKeywords = map[string][]string{
	"quantum_physics":     {"quantum", "physics", "qubit", "entanglement", "superposition"},
	"hft_trading":         {"hft", "trading", "latency", "market", "order", "arbitrage"},
	"climate_modeling":    {"climate", "environment", "carbon", "emission", "modeling"},
	"biomedical_research": {"biomedical", "genomics", "dna", "protein", "clinical"},
	"cybersecurity":       {"cyber", "security", "threat", "malware", "vulnerability"},
}

// RunSelfOptimization distills brain queries into sub-agent lessons, promotes critical insights to central graph.
func (s *SubAgentSelfOptimizationService) RunSelfOptimization(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT sa.niche, sa.agent_registry_id, sa.description
		FROM sub_agents sa
		JOIN agent_registry ar ON ar.id = sa.agent_registry_id AND ar.is_active = true
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var niche, agentID, desc string
		if rows.Scan(&niche, &agentID, &desc) != nil {
			continue
		}
		s.distillLessonsForSubAgent(ctx, niche, agentID)
		s.promoteCriticalInsights(ctx, niche, agentID)
	}
}

func (s *SubAgentSelfOptimizationService) distillLessonsForSubAgent(ctx context.Context, niche, agentID string) {
	keywords := nicheKeywords[niche]
	if len(keywords) == 0 {
		return
	}
	conditions := make([]string, len(keywords))
	args := []interface{}{}
	for i, kw := range keywords {
		conditions[i] = "query_topic ILIKE $" + strconv.Itoa(i+1)
		args = append(args, "%"+kw+"%")
	}
	args = append(args, maxLessonsPerCycle*2)
	query := `
		SELECT query_topic, COUNT(*) as cnt
		FROM brain_query_payments
		WHERE created_at > NOW() - INTERVAL '7 days' AND query_topic != '' AND query_topic IS NOT NULL
		  AND (` + strings.Join(conditions, " OR ") + `)
		GROUP BY query_topic
		ORDER BY cnt DESC
		LIMIT $` + strconv.Itoa(len(args))
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var topic string
		var cnt int
		if rows.Scan(&topic, &cnt) != nil || topic == "" {
			continue
		}
		// Check if already stored for this sub-agent
		var exists int
		_ = s.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM agent_knowledge
			WHERE agent_id = $1 AND topic = $2 AND content ILIKE $3
		`, agentID, subAgentLessonsTopic, "%"+topic+"%").Scan(&exists)
		if exists > 0 {
			continue
		}
		content := "topic=" + topic + " | queries_7d=" + strconv.Itoa(cnt)
		if cnt > 10 {
			content += " | high_demand"
		}
		tags := []string{niche, "sub_agent_lessons", "self_optimization"}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO agent_knowledge (agent_id, topic, content, tags, embedding) VALUES ($1, $2, $3, $4, NULL)
		`, agentID, subAgentLessonsTopic, content, pq.Array(tags))
		if err != nil {
			continue
		}
		log.Printf("[SubAgent Self-Opt] %s: lesson stored for topic %s (cnt=%d)", niche, topic, cnt)
	}
}

func (s *SubAgentSelfOptimizationService) promoteCriticalInsights(ctx context.Context, niche, agentID string) {
	// Get sub-agent lessons that are "critical" (high_demand = queries >= 10)
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, content FROM agent_knowledge
		WHERE agent_id = $1 AND topic = $2 AND content LIKE '%high_demand%'
		ORDER BY created_at DESC
		LIMIT 5
	`, agentID, subAgentLessonsTopic)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, content string
		if rows.Scan(&id, &content) != nil {
			continue
		}
		// Extract queries_7d value
		if !strings.Contains(content, "high_demand") {
			continue
		}
		// Check if already in central graph
		var exists int
		_ = s.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM agent_knowledge
			WHERE agent_id = $1 AND topic = $2 AND content = $3
		`, globalAgentID, globalTopic, "[sub_agent:"+niche+"] "+content).Scan(&exists)
		if exists > 0 {
			continue
		}
		// Promote to central graph (critical insight)
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO agent_knowledge (agent_id, topic, content, tags, embedding)
			VALUES ($1, $2, $3, $4, NULL)
		`, globalAgentID, globalTopic, "[sub_agent:"+niche+"] "+content, pq.Array([]string{niche, "critical_insight", "global_knowledge_graph"}))
		if err != nil {
			continue
		}
		_, _ = s.db.ExecContext(ctx, `UPDATE agent_knowledge SET content = content || ' [promoted]' WHERE id = $1`, id)
		log.Printf("[SubAgent Self-Opt] %s: critical insight promoted to central graph", niche)
	}
}

// Start runs the self-optimization loop.
func (s *SubAgentSelfOptimizationService) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	s.RunSelfOptimization(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.RunSelfOptimization(ctx)
		}
	}
}
