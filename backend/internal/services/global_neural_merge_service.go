package services

import (
	"context"
	"database/sql"
	"log"
	"time"

	leviathan "distributed-computing-platform/internal/services/leviathan"
)

const (
	globalAgentID = "__leviathan__"
	globalTopic   = "global_knowledge_graph"
)

// GlobalNeuralMergeService consolidates Leviathan long_term_lessons into agent_knowledge (Global Knowledge Graph).
// Runs on a 15-minute cycle when Leviathan is enabled.
type GlobalNeuralMergeService struct {
	db       *sql.DB
	interval time.Duration
}

// NewGlobalNeuralMergeService creates the consolidation service.
func NewGlobalNeuralMergeService(db *sql.DB) *GlobalNeuralMergeService {
	return &GlobalNeuralMergeService{
		db:       db,
		interval: 15 * time.Minute,
	}
}

// RunConsolidation merges new lessons from Leviathan SQLite into PostgreSQL agent_knowledge.
func (s *GlobalNeuralMergeService) RunConsolidation(ctx context.Context) (synced int, err error) {
	shadow := leviathan.GetGlobalShadow()
	if shadow == nil {
		return 0, nil
	}

	var lastID int64
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(last_synced_lesson_id, 0) FROM global_merge_checkpoint WHERE source = 'leviathan_long_term_lessons' LIMIT 1`).Scan(&lastID); err != nil {
		_, _ = s.db.ExecContext(ctx, `INSERT INTO global_merge_checkpoint (source, last_synced_lesson_id) VALUES ('leviathan_long_term_lessons', 0) ON CONFLICT DO NOTHING`)
	}

	lessons, err := shadow.ExportLessonsForMerge(lastID, 500)
	if err != nil || len(lessons) == 0 {
		return 0, err
	}

	for _, l := range lessons {
		content := "sector=" + l.Sector + " | " + l.Keywords + " | correct=" + boolStr(l.Correct) + " | source=" + l.SourceUsed
		if l.Reasoning != "" {
			content += " | reasoning=" + l.Reasoning
		}
		if l.MetaCause != "" {
			content += " | meta_cause=" + l.MetaCause
		}
		tags := []string{l.Sector, "leviathan", "global_knowledge_graph"}
		if l.MetaCause != "" {
			tags = append(tags, l.MetaCause)
		}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO agent_knowledge (agent_id, topic, content, tags, embedding) VALUES ($1, $2, $3, $4, NULL)
		`, globalAgentID, globalTopic, content, tags)
		if err != nil {
			log.Printf("[Global Neural Merge] Insert error: %v", err)
			continue
		}
		lastID = l.ID
		synced++
	}

	if synced > 0 {
		_, _ = s.db.ExecContext(ctx, `
			UPDATE global_merge_checkpoint SET last_synced_lesson_id = $1, last_synced_at = NOW(), lessons_synced_count = lessons_synced_count + $2 WHERE source = 'leviathan_long_term_lessons'
		`, lastID, synced)
		log.Printf("[Global Neural Merge] Consolidated %d lessons into Global Knowledge Graph (checkpoint: %d)", synced, lastID)
	}
	return synced, nil
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// Start runs the consolidation loop.
func (s *GlobalNeuralMergeService) Start(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	s.RunConsolidation(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.RunConsolidation(ctx)
		}
	}
}
