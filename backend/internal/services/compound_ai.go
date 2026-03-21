package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// CompoundAI — Zero-cost AI brain for autonomous platform
//
// Uses Groq's compound model (free) for:
//  - Network analysis and decisions
//  - Node management recommendations
//  - Growth predictions
//  - Self-healing diagnostics
//  - Economic optimization
//
// The platform ITSELF uses AI to manage the network.
// Not just providing AI to users, but BEING AI-driven internally.
// ═══════════════════════════════════════════════════════════════

type CompoundAI struct {
	apiKey     string
	model      string
	baseURL    string
	mu         sync.RWMutex
	history    []AIDecision
	maxHistory int
	stats      AIStats
}

type AIDecision struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"` // node_mgmt, healing, growth, economic, analysis
	Prompt    string    `json:"prompt"`
	Response  string    `json:"response"`
	Timestamp time.Time `json:"timestamp"`
	LatencyMs int64     `json:"latency_ms"`
	Applied   bool      `json:"applied"`
}

type AIStats struct {
	TotalQueries     int64   `json:"total_queries"`
	TotalTokensUsed  int64   `json:"total_tokens_used"`
	AvgLatencyMs     float64 `json:"avg_latency_ms"`
	DecisionsMade    int64   `json:"decisions_made"`
	DecisionsApplied int64   `json:"decisions_applied"`
	ErrorCount       int64   `json:"error_count"`
	CostSaved        float64 `json:"cost_saved_usd"` // vs commercial API
}

type CompoundRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type CompoundResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

func NewCompoundAI(apiKey string) *CompoundAI {
	model := "llama-3.3-70b-versatile"
	return &CompoundAI{
		apiKey:     apiKey,
		model:      model,
		baseURL:    "https://api.groq.com/openai/v1/chat/completions",
		maxHistory: 200,
	}
}

// TryFallbackModel switches to an alternative model when rate-limited
func (c *CompoundAI) TryFallbackModel() {
	c.mu.Lock()
	defer c.mu.Unlock()
	fallbacks := []string{"llama-3.1-8b-instant"}
	if c.model == "llama-3.3-70b-versatile" {
		c.model = fallbacks[0]
		log.Printf("🧠 CompoundAI: switched to fallback model %s", c.model)
	} else {
		// Cycle back to primary
		c.model = "llama-3.3-70b-versatile"
		log.Printf("🧠 CompoundAI: restored primary model")
	}
}

// ResetModel restores the primary model after successful call
func (c *CompoundAI) ResetModel() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.model != "llama-3.3-70b-versatile" {
		log.Printf("🧠 CompoundAI: reset to primary model (was %s)", c.model)
		c.model = "llama-3.3-70b-versatile"
	}
}

// Ask — send a query to Compound AI and get a response
func (c *CompoundAI) Ask(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}
	return c.chat(ctx, messages)
}

// Analyze — analyze network state and return structured recommendations
func (c *CompoundAI) Analyze(ctx context.Context, category string, networkState map[string]interface{}) (*AIDecision, error) {
	systemPrompt := c.getSystemPrompt(category)

	stateJSON, _ := json.Marshal(networkState)
	userPrompt := fmt.Sprintf("Analyze this network state and provide actionable recommendations:\n\n```json\n%s\n```\n\nRespond with specific, implementable actions.", string(stateJSON))

	start := time.Now()
	response, err := c.Ask(ctx, systemPrompt, userPrompt)
	if err != nil {
		c.mu.Lock()
		c.stats.ErrorCount++
		c.mu.Unlock()
		return nil, err
	}

	decision := &AIDecision{
		ID:        fmt.Sprintf("ai-%d", time.Now().UnixNano()),
		Category:  category,
		Prompt:    userPrompt[:min(len(userPrompt), 200)],
		Response:  response,
		Timestamp: time.Now(),
		LatencyMs: time.Since(start).Milliseconds(),
	}

	c.mu.Lock()
	c.history = append(c.history, *decision)
	if len(c.history) > c.maxHistory {
		c.history = c.history[len(c.history)-c.maxHistory:]
	}
	c.stats.DecisionsMade++
	c.mu.Unlock()

	return decision, nil
}

func (c *CompoundAI) chat(ctx context.Context, messages []Message) (string, error) {
	c.mu.RLock()
	currentModel := c.model
	c.mu.RUnlock()

	reqBody := CompoundRequest{
		Model:       currentModel,
		Messages:    messages,
		Temperature: 0.3,
		MaxTokens:   1024,
	}

	body, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	start := time.Now()

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("compound AI request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("compound AI returned status %d", resp.StatusCode)
	}

	var result CompoundResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from compound AI")
	}

	latency := time.Since(start).Milliseconds()
	content := result.Choices[0].Message.Content

	c.mu.Lock()
	c.stats.TotalQueries++
	c.stats.TotalTokensUsed += int64(result.Usage.TotalTokens)
	// Running average
	c.stats.AvgLatencyMs = (c.stats.AvgLatencyMs*float64(c.stats.TotalQueries-1) + float64(latency)) / float64(c.stats.TotalQueries)
	// Cost saved: compound is free, equivalent GPT-4 cost = ~$0.03/1K tokens
	c.stats.CostSaved += float64(result.Usage.TotalTokens) / 1000.0 * 0.03
	c.mu.Unlock()

	// Successful call — reset to primary model if we were on fallback
	c.ResetModel()

	return content, nil
}

func (c *CompoundAI) getSystemPrompt(category string) string {
	base := `You are the autonomous brain of the GSTD decentralized AI network. 
You manage a network of sovereign AI nodes that earn GSTD tokens.
Your decisions directly affect network health, growth, and economics.
Always respond with specific, actionable recommendations in JSON when possible.
Be concise and precise.`

	switch category {
	case "node_mgmt":
		return base + `
Focus on node management: health monitoring, load balancing, task distribution.
Identify underperforming nodes, suggest optimizations, recommend task assignments.`
	case "healing":
		return base + `
Focus on self-healing: detect failures, diagnose root causes, suggest recovery steps.
Prioritize network stability and data preservation.`
	case "growth":
		return base + `
Focus on network growth: identify opportunities, suggest incentives, predict trends.
Maximize node adoption while maintaining quality.`
	case "economic":
		return base + `
Focus on economics: optimize reward rates, balance supply/demand, prevent inflation.
Maximize value for node operators while ensuring sustainability.`
	case "analysis":
		return base + `
Provide comprehensive analysis of the network state.
Include health score, risk factors, opportunities, and predictions.`
	default:
		return base
	}
}

// GetStats returns AI usage statistics
func (c *CompoundAI) GetStats() AIStats {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.stats
}

// GetHistory returns recent AI decisions
func (c *CompoundAI) GetHistory(limit int) []AIDecision {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if limit > len(c.history) {
		limit = len(c.history)
	}
	result := make([]AIDecision, limit)
	copy(result, c.history[len(c.history)-limit:])
	return result
}

// min is built-in since Go 1.21+

func init() {
	log.Println("🧠 CompoundAI: autonomous intelligence module ready")
}
