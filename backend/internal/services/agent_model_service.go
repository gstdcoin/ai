package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
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
	Loss       float64                `json:"loss,omitempty"`
	Accuracy   float64                `json:"accuracy,omitempty"`
	Epochs     int                    `json:"epochs,omitempty"`
	BaseModel  string                 `json:"base_model,omitempty"`
	CustomData map[string]interface{} `json:"-"`
}

// SubmitModelUpdate records an agent's LoRA adapter submission
func (s *AgentModelService) SubmitModelUpdate(ctx context.Context, agentID, weightsURL string, metrics map[string]interface{}) error {
	// Shadow Audit: validate URL format (https only) and reachability
	u, err := url.Parse(weightsURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("weights_url must be a valid https URL")
	}
	if !strings.HasPrefix(weightsURL, "https://") {
		return fmt.Errorf("weights_url must use https protocol")
	}
	// HEAD request to verify URL is reachable (10s timeout)
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, weightsURL, nil)
	if err != nil {
		return fmt.Errorf("invalid weights_url: %w", err)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("weights_url unreachable: %w", err)
	}
	resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("weights_url returned status %d", resp.StatusCode)
	}

	metricsJSON := "{}"
	if metrics != nil {
		b, _ := json.Marshal(metrics)
		metricsJSON = string(b)
	}
	_, err = s.db.ExecContext(ctx, `
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
