package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
)

// AgentModelService allows agents to submit trained LoRA adapter links
type AgentModelService struct {
	db *sql.DB
}

// NewAgentModelService creates a new agent model service
func NewAgentModelService(db *sql.DB) *AgentModelService {
	return &AgentModelService{db: db}
}

// ModelUpdateMetrics holds optional training metrics
type ModelUpdateMetrics struct {
	Loss       float64 `json:"loss,omitempty"`
	Accuracy   float64 `json:"accuracy,omitempty"`
	Epochs     int     `json:"epochs,omitempty"`
	BaseModel  string  `json:"base_model,omitempty"`
	CustomData map[string]interface{} `json:"-"`
}

// SubmitModelUpdate records an agent's LoRA adapter submission
func (s *AgentModelService) SubmitModelUpdate(ctx context.Context, agentID, weightsURL string, metrics map[string]interface{}) error {
	metricsJSON := "{}"
	if metrics != nil {
		b, _ := json.Marshal(metrics)
		metricsJSON = string(b)
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_model_updates (agent_id, weights_url, metrics)
		VALUES ($1, $2, $3::jsonb)
	`, agentID, weightsURL, metricsJSON)
	if err != nil {
		return err
	}
	preview := agentID
	if len(agentID) > 12 {
		preview = agentID[:12]
	}
	log.Printf("🧠 Agent %s submitted model update: %s", preview, weightsURL)
	return nil
}
