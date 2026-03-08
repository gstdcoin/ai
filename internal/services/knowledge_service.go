package services

import (
	"context"
	"database/sql"
	"time"
)

type KnowledgeItem struct {
	ID        string    `json:"id"`
	AgentID   string    `json:"agent_id"`
	Topic     string    `json:"topic"`
	Content   string    `json:"content"`
	Tags      []string  `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
}

type KnowledgeService struct {
	db *sql.DB
}

func NewKnowledgeService(db *sql.DB) *KnowledgeService {
	return &KnowledgeService{db: db}
}

func (s *KnowledgeService) StoreKnowledge(ctx context.Context, agentID, topic, content string, tags []string, embedding []byte) error {
	query := `INSERT INTO agent_knowledge (agent_id, topic, content, tags, embedding) VALUES ($1, $2, $3, $4, $5)`
	_, err := s.db.ExecContext(ctx, query, agentID, topic, content, tags, embedding)
	return err
}

func (s *KnowledgeService) QueryKnowledge(ctx context.Context, topic string, limit int) ([]KnowledgeItem, error) {
	if limit <= 0 {
		limit = 10
	}
	query := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge WHERE topic ILIKE $1 OR $1 = ANY(tags) ORDER BY created_at DESC LIMIT $2`

	rows, err := s.db.QueryContext(ctx, query, "%"+topic+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []KnowledgeItem
	for rows.Next() {
		var item KnowledgeItem
		if err := rows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
			continue
		}
		item.Tags = []string{}
		results = append(results, item)
	}
	return results, nil
}

// QueryKnowledgeWithGlobalGraph (Singularity Gateway): merges topic-specific + global_knowledge_graph.
// Complex queries are based on consolidated network experience from Leviathan lessons.
func (s *KnowledgeService) QueryKnowledgeWithGlobalGraph(ctx context.Context, topic string, limit int) ([]KnowledgeItem, error) {
	if limit <= 0 {
		limit = 15
	}
	// 1. Topic-specific knowledge
	topicQuery := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge 
		WHERE (topic ILIKE $1 OR $1 = ANY(tags)) AND topic != 'global_knowledge_graph' 
		ORDER BY created_at DESC LIMIT $2`
	rows, err := s.db.QueryContext(ctx, topicQuery, "%"+topic+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := make(map[string]bool)
	var results []KnowledgeItem
	for rows.Next() {
		var item KnowledgeItem
		if err := rows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
			continue
		}
		item.Tags = []string{}
		if !seen[item.ID] {
			seen[item.ID] = true
			results = append(results, item)
		}
	}

	// 2. Global Knowledge Graph (consolidated Leviathan experience) — prioritize for complex queries
	globalLimit := limit / 2
	if globalLimit < 3 {
		globalLimit = 3
	}
	globalQuery := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge 
		WHERE topic = 'global_knowledge_graph' AND (content ILIKE $1 OR $1 = ANY(tags)) 
		ORDER BY created_at DESC LIMIT $2`
	globalRows, err := s.db.QueryContext(ctx, globalQuery, "%"+topic+"%", globalLimit)
	if err == nil {
		defer globalRows.Close()
		for globalRows.Next() {
			var item KnowledgeItem
			if err := globalRows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
				continue
			}
			item.Tags = []string{"global_knowledge_graph", "leviathan"}
			if !seen[item.ID] {
				seen[item.ID] = true
				results = append([]KnowledgeItem{item}, results...) // Prepend global experience
			}
		}
	}
	// If no topic match, still include recent global knowledge
	if len(results) < 3 {
		fallbackQuery := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge 
			WHERE topic = 'global_knowledge_graph' ORDER BY created_at DESC LIMIT $1`
		if fallbackRows, err := s.db.QueryContext(ctx, fallbackQuery, 5); err == nil {
			for fallbackRows.Next() {
				var item KnowledgeItem
				if err := fallbackRows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
					continue
				}
				item.Tags = []string{"global_knowledge_graph", "leviathan"}
				if !seen[item.ID] {
					seen[item.ID] = true
					results = append(results, item)
				}
			}
			fallbackRows.Close()
		}
	}
	return results, nil
}

// GetGridTools returns code snippets for "FREE AI TOOLS BY GSTD GRID" (topic=grid_tool)
func (s *KnowledgeService) GetGridTools(ctx context.Context, limit int) ([]KnowledgeItem, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge WHERE topic = 'grid_tool' ORDER BY created_at DESC LIMIT $1`
	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []KnowledgeItem
	for rows.Next() {
		var item KnowledgeItem
		if err := rows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
			continue
		}
		item.Tags = []string{"free_ai_tools", "gstd", "manifesto"}
		results = append(results, item)
	}
	return results, nil
}

// GetResonanceQuotes returns recent "GRID IS THINKING" quotes for the ticker (topic=resonance_report)
func (s *KnowledgeService) GetResonanceQuotes(ctx context.Context, limit int) ([]KnowledgeItem, error) {
	if limit <= 0 {
		limit = 20
	}
	query := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge WHERE topic = 'resonance_report' ORDER BY created_at DESC LIMIT $1`
	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []KnowledgeItem
	for rows.Next() {
		var item KnowledgeItem
		if err := rows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
			continue
		}
		item.Tags = []string{"grid_thinking", "resonance"}
		results = append(results, item)
	}
	return results, nil
}

// SummarizeRecentInsights returns the last N records from agent_knowledge as a single context string for AI inference
func (s *KnowledgeService) SummarizeRecentInsights(ctx context.Context, limit int) (string, error) {
	if limit <= 0 {
		limit = 10
	}
	query := `SELECT agent_id, topic, content, created_at FROM agent_knowledge ORDER BY created_at DESC LIMIT $1`
	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var parts []string
	for rows.Next() {
		var agentID, topic, content string
		var createdAt time.Time
		if err := rows.Scan(&agentID, &topic, &content, &createdAt); err != nil {
			continue
		}
		parts = append(parts, "["+createdAt.Format(time.RFC3339)+"] "+agentID+"/"+topic+": "+content)
	}
	// Shadow Audit: empty agent_knowledge must not crash; return safe fallback for AI context
	if len(parts) == 0 {
		return "No recent insights available. Proceed with standard inference.", nil
	}
	// Reverse so oldest first (chronological context)
	for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
		parts[i], parts[j] = parts[j], parts[i]
	}
	result := ""
	for _, p := range parts {
		if result != "" {
			result += "\n"
		}
		result += p
	}
	return result, nil
}

func (s *KnowledgeService) GetGlobalBulletin(ctx context.Context, limit int) ([]KnowledgeItem, error) {
	if limit <= 0 {
		limit = 5
	}
	// Topic 'bulletin' is reserved for system-wide announcements
	query := `SELECT id, agent_id, topic, content, created_at FROM agent_knowledge WHERE agent_id = 'SYSTEM' AND topic = 'bulletin' ORDER BY created_at DESC LIMIT $1`

	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []KnowledgeItem
	for rows.Next() {
		var item KnowledgeItem
		if err := rows.Scan(&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt); err != nil {
			continue
		}
		item.Tags = []string{"global", "system"}
		results = append(results, item)
	}
	return results, nil
}

// QueryExperienceVault (Experience Vault): Searches for high-confidence matches to avoid redundant inference.
func (s *KnowledgeService) QueryExperienceVault(ctx context.Context, query string) (*KnowledgeItem, error) {
	// In production, this would use vector similarity.
	// For now, we use a sophisticated LIKE query and priority on previous high-quality outputs.
	sqlQuery := `
		SELECT id, agent_id, topic, content, created_at 
		FROM agent_knowledge 
		WHERE content ILIKE $1 
		ORDER BY char_length(content) DESC 
		LIMIT 1
	`
	// We wrap the query in % for partial match, but char_length sort helps find the most comprehensive answer
	var item KnowledgeItem
	err := s.db.QueryRowContext(ctx, sqlQuery, "%"+query+"%").Scan(
		&item.ID, &item.AgentID, &item.Topic, &item.Content, &item.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &item, nil
}
