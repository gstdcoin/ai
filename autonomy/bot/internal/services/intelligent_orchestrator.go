package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// IntelligentOrchestrator is the central brain that coordinates all autonomous operations
type IntelligentOrchestrator struct {
	autoFix        *AutoFixEngine
	ollamaHost     string
	ollamaKey      string
	model          string
	platformState  *PlatformState
	decisionLog    []Decision
	config         *OrchestratorConfig
}

// PlatformState represents the current state of the entire platform
type PlatformState struct {
	BackendHealthy    bool      `json:"backend_healthy"`
	DatabaseHealthy   bool      `json:"database_healthy"`
	OllamaHealthy     bool      `json:"ollama_healthy"`
	ActiveNodes       int       `json:"active_nodes"`
	PendingTasks      int       `json:"pending_tasks"`
	ErrorsLastHour    int       `json:"errors_last_hour"`
	LastCheck         time.Time `json:"last_check"`
	CPUUsage          float64   `json:"cpu_usage"`
	MemoryUsage       float64   `json:"memory_usage"`
}

// Decision represents an autonomous decision made by the orchestrator
type Decision struct {
	Timestamp   time.Time `json:"timestamp"`
	Type        string    `json:"type"`        // scaling, healing, optimization, security
	Description string    `json:"description"`
	Action      string    `json:"action"`
	Success     bool      `json:"success"`
	Reasoning   string    `json:"reasoning"`
}

// OrchestratorConfig defines operational parameters
type OrchestratorConfig struct {
	AutoScaleEnabled     bool    `json:"auto_scale_enabled"`
	AutoHealEnabled      bool    `json:"auto_heal_enabled"`
	AutoOptimizeEnabled  bool    `json:"auto_optimize_enabled"`
	MaxDecisionsPerHour  int     `json:"max_decisions_per_hour"`
	HealthCheckInterval  time.Duration `json:"health_check_interval"`
	ErrorThreshold       int     `json:"error_threshold"` // Errors before escalation
}

func NewIntelligentOrchestrator() *IntelligentOrchestrator {
	host := os.Getenv("OLLAMA_HOST")
	if host == "" {
		host = "http://gstd_ollama:11434"
	}

	model := os.Getenv("OLLAMA_ORCHESTRATOR_MODEL")
	if model == "" {
		model = "qwen2.5:1.5b" // Larger model for complex decisions
	}

	return &IntelligentOrchestrator{
		autoFix:    NewAutoFixEngine(),
		ollamaHost: host,
		ollamaKey:  os.Getenv("OLLAMA_API_KEY"),
		model:      model,
		platformState: &PlatformState{},
		decisionLog: make([]Decision, 0),
		config: &OrchestratorConfig{
			AutoScaleEnabled:    true,
			AutoHealEnabled:     true,
			AutoOptimizeEnabled: true,
			MaxDecisionsPerHour: 20,
			HealthCheckInterval: 60 * time.Second,
			ErrorThreshold:      5,
		},
	}
}

// Start begins the autonomous orchestration loop
func (o *IntelligentOrchestrator) Start(ctx context.Context) {
	log.Println("🧠 Intelligent Orchestrator started - Full Autonomy Mode")
	
	// Start sub-systems
	go o.autoFix.MonitorAndFix(ctx)
	
	healthTicker := time.NewTicker(o.config.HealthCheckInterval)
	optimizeTicker := time.NewTicker(4 * time.Hour) // Strategic optimization every 4 hours
	
	defer healthTicker.Stop()
	defer optimizeTicker.Stop()

	// Initial assessment
	o.assessPlatform(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("🧠 Orchestrator shutting down...")
			return
		case <-healthTicker.C:
			o.assessPlatform(ctx)
			o.makeDecisions(ctx)
		case <-optimizeTicker.C:
			o.strategicOptimization(ctx)
		}
	}
}

// assessPlatform checks all platform components
func (o *IntelligentOrchestrator) assessPlatform(ctx context.Context) {
	state := &PlatformState{
		LastCheck: time.Now(),
	}

	// Check Backend
	resp, err := http.Get("http://localhost:8080/api/v1/health")
	state.BackendHealthy = err == nil && resp.StatusCode == 200

	// Check Ollama
	resp, err = http.Get(o.ollamaHost + "/api/tags")
	state.OllamaHealthy = err == nil && resp.StatusCode == 200

	// Check Database (via backend health)
	state.DatabaseHealthy = state.BackendHealthy // Simplified - backend health includes DB

	o.platformState = state
	
	if !state.BackendHealthy || !state.OllamaHealthy {
		log.Printf("⚠️ Platform Health Issue Detected: Backend=%v, Ollama=%v", 
			state.BackendHealthy, state.OllamaHealthy)
	}
}

// makeDecisions uses AI to make platform management decisions
func (o *IntelligentOrchestrator) makeDecisions(ctx context.Context) {
	if !o.config.AutoHealEnabled && !o.config.AutoScaleEnabled {
		return
	}

	// If critical issues, take immediate action
	if !o.platformState.BackendHealthy {
		o.executeDecision(ctx, Decision{
			Type:        "healing",
			Description: "Backend is unhealthy",
			Action:      "docker restart ubuntu-backend-blue-1",
		})
	}

	if !o.platformState.OllamaHealthy {
		o.executeDecision(ctx, Decision{
			Type:        "healing", 
			Description: "AI Brain (Ollama) is unhealthy",
			Action:      "docker restart gstd_ollama",
		})
	}
}

// strategicOptimization asks AI for strategic improvements
func (o *IntelligentOrchestrator) strategicOptimization(ctx context.Context) {
	if !o.config.AutoOptimizeEnabled {
		return
	}

	prompt := o.buildStrategicPrompt()
	
	response, err := o.callLLM(ctx, prompt)
	if err != nil {
		log.Printf("Strategic optimization failed: %v", err)
		return
	}

	var suggestions []Decision
	if err := json.Unmarshal([]byte(response), &suggestions); err != nil {
		log.Printf("Failed to parse optimization suggestions: %v", err)
		return
	}

	log.Printf("🧠 Received %d strategic optimization suggestions", len(suggestions))
	for _, suggestion := range suggestions {
		if suggestion.Type == "optimization" {
			// Only log for now, don't auto-execute strategic changes
			log.Printf("📋 Suggestion: %s - %s", suggestion.Description, suggestion.Reasoning)
		}
	}
}

// buildStrategicPrompt creates prompt for strategic AI consultation
func (o *IntelligentOrchestrator) buildStrategicPrompt() string {
	return fmt.Sprintf(`You are the GSTD Platform Strategic AI Advisor.

Current Platform State:
- Backend Healthy: %v
- Database Healthy: %v
- AI Brain Healthy: %v
- Active Nodes: %d
- Pending Tasks: %d
- Last Check: %v

Recent Decisions Made:
%v

Analyze the platform state and suggest 1-3 strategic optimizations.
Focus on:
1. Performance improvements
2. Cost optimization
3. Reliability enhancements
4. User experience improvements

Respond with JSON array of decisions:
[
  {
    "type": "optimization",
    "description": "What to optimize",
    "action": "Specific action to take",
    "reasoning": "Why this will help"
  }
]`,
		o.platformState.BackendHealthy,
		o.platformState.DatabaseHealthy,
		o.platformState.OllamaHealthy,
		o.platformState.ActiveNodes,
		o.platformState.PendingTasks,
		o.platformState.LastCheck,
		o.getRecentDecisions(5))
}

func (o *IntelligentOrchestrator) getRecentDecisions(n int) string {
	if len(o.decisionLog) == 0 {
		return "No recent decisions"
	}
	
	start := len(o.decisionLog) - n
	if start < 0 {
		start = 0
	}
	
	var lines []string
	for _, d := range o.decisionLog[start:] {
		lines = append(lines, fmt.Sprintf("- %s: %s (success=%v)", d.Type, d.Description, d.Success))
	}
	return strings.Join(lines, "\n")
}

// executeDecision performs an autonomous decision
func (o *IntelligentOrchestrator) executeDecision(ctx context.Context, decision Decision) {
	decision.Timestamp = time.Now()
	
	log.Printf("🤖 Executing Decision: %s - %s", decision.Type, decision.Description)
	
	if strings.HasPrefix(decision.Action, "docker") {
		output, err := o.autoFix.execCommand(decision.Action)
		decision.Success = err == nil
		if err != nil {
			log.Printf("❌ Decision failed: %v - %s", err, output)
		} else {
			log.Printf("✅ Decision executed successfully")
		}
	}
	
	o.decisionLog = append(o.decisionLog, decision)
	
	// Keep only last 100 decisions
	if len(o.decisionLog) > 100 {
		o.decisionLog = o.decisionLog[len(o.decisionLog)-100:]
	}
}

// callLLM calls the Ollama API
func (o *IntelligentOrchestrator) callLLM(ctx context.Context, prompt string) (string, error) {
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":  o.model,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.4,
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", o.ollamaHost+"/api/generate", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if o.ollamaKey != "" {
		req.Header.Set("Authorization", "Bearer "+o.ollamaKey)
	}

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LLM error %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if response, ok := result["response"].(string); ok {
		return response, nil
	}
	return "", fmt.Errorf("no response in LLM output")
}

// GetStats returns orchestrator statistics
func (o *IntelligentOrchestrator) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"status":         "active",
		"platform_state": o.platformState,
		"decisions_made": len(o.decisionLog),
		"auto_fix_stats": o.autoFix.GetStats(),
		"config":         o.config,
	}
}

// SubmitFeedback allows external systems to provide feedback on decisions
func (o *IntelligentOrchestrator) SubmitFeedback(decisionIndex int, wasSuccessful bool) {
	if decisionIndex >= 0 && decisionIndex < len(o.decisionLog) {
		o.decisionLog[decisionIndex].Success = wasSuccessful
	}
}
