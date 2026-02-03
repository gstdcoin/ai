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
		item.Tags = []string{} // Not scanning tags to simplify for now
		results = append(results, item)
	}
	return results, nil
}
