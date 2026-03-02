package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// SwarmModelManager handles automatic model distribution across the swarm.
// As the swarm grows, it auto-pulls new models and distributes workload.
//
// Model tiers:
//
//	Tier 1 (always): qwen2.5-coder:7b — code/general
//	Tier 2 (5+ nodes): deepseek-r1:8b — reasoning
//	Tier 3 (10+ nodes): llama3.1:8b — conversation
//	Tier 4 (20+ nodes): gemma2:9b — multilingual
//	Tier 5 (50+ nodes): mixtral:8x7b — MoE for complex tasks
type SwarmModelManager struct {
	db        *sql.DB
	ollamaURL string
	mu        sync.RWMutex

	// Current state
	activeModels map[string]ModelInfo
	nodeCount    int
	lastCheck    time.Time
}

// ModelInfo describes a model in the swarm
type ModelInfo struct {
	Name         string   `json:"name"`
	Size         string   `json:"size"`
	Tier         int      `json:"tier"`
	MinNodes     int      `json:"min_nodes"`
	Loaded       bool     `json:"loaded"`
	Capabilities []string `json:"capabilities"`
	CostGSTD     float64  `json:"cost_gstd_per_request"`
}

// ModelTier defines when models become available
var modelTiers = []ModelInfo{
	{Name: "qwen2.5-coder:7b", Size: "4.7GB", Tier: 1, MinNodes: 1, Capabilities: []string{"code", "general", "fast"}, CostGSTD: 0.05},
	{Name: "deepseek-r1:8b", Size: "4.9GB", Tier: 2, MinNodes: 5, Capabilities: []string{"reasoning", "math", "analysis"}, CostGSTD: 0.10},
	{Name: "llama3.1:8b", Size: "4.7GB", Tier: 3, MinNodes: 10, Capabilities: []string{"conversation", "creative", "multilingual"}, CostGSTD: 0.08},
	{Name: "gemma2:9b", Size: "5.4GB", Tier: 4, MinNodes: 20, Capabilities: []string{"multilingual", "translation", "classification"}, CostGSTD: 0.08},
	{Name: "mixtral:8x7b", Size: "26GB", Tier: 5, MinNodes: 50, Capabilities: []string{"complex", "moe", "expert"}, CostGSTD: 0.15},
}

func NewSwarmModelManager(db *sql.DB, ollamaURL string) *SwarmModelManager {
	smm := &SwarmModelManager{
		db:           db,
		ollamaURL:    ollamaURL,
		activeModels: make(map[string]ModelInfo),
	}
	smm.ensureSchema()
	go smm.managementLoop()
	return smm
}

func (smm *SwarmModelManager) ensureSchema() {
	if smm.db == nil {
		return
	}
	smm.db.Exec(`CREATE TABLE IF NOT EXISTS swarm_models (
		model_name VARCHAR(128) PRIMARY KEY,
		tier INT DEFAULT 1,
		size_bytes BIGINT DEFAULT 0,
		status VARCHAR(32) DEFAULT 'pending',
		nodes_serving INT DEFAULT 0,
		total_requests BIGINT DEFAULT 0,
		avg_latency_ms INT DEFAULT 0,
		capabilities TEXT DEFAULT '[]',
		cost_gstd NUMERIC(10,6) DEFAULT 0.1,
		loaded_at TIMESTAMP DEFAULT NOW(),
		last_used_at TIMESTAMP DEFAULT NOW()
	)`)
}

// managementLoop checks swarm health and auto-loads models
func (smm *SwarmModelManager) managementLoop() {
	// Initial check after startup
	time.Sleep(15 * time.Second)
	smm.checkAndScale(context.Background())

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		smm.checkAndScale(context.Background())
	}
}

// checkAndScale evaluates node count and pulls models as needed
func (smm *SwarmModelManager) checkAndScale(ctx context.Context) {
	smm.mu.Lock()
	defer smm.mu.Unlock()

	// Count active nodes
	nodeCount := smm.countActiveNodes(ctx)
	smm.nodeCount = nodeCount

	// Check which models should be available
	for _, model := range modelTiers {
		if nodeCount >= model.MinNodes {
			if _, exists := smm.activeModels[model.Name]; !exists {
				// New tier unlocked! Pull model
				log.Printf("🚀 [SwarmModels] Tier %d unlocked (nodes=%d): pulling %s...", model.Tier, nodeCount, model.Name)
				go smm.pullModel(model)
			}
		}
	}

	// Update loaded models from Ollama
	smm.refreshLoadedModels()

	smm.lastCheck = time.Now()
	log.Printf("🧠 [SwarmModels] Check: %d nodes, %d models active", nodeCount, len(smm.activeModels))
}

// countActiveNodes returns the number of active swarm nodes
func (smm *SwarmModelManager) countActiveNodes(ctx context.Context) int {
	count := 1 // at minimum local Ollama
	if smm.db != nil {
		// Count active agent nodes
		var agentCount int
		smm.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_api_keys WHERE is_active = true AND last_used_at > NOW() - INTERVAL '1 hour'`).Scan(&agentCount)
		count += agentCount

		// Count claw agents
		var clawCount int
		smm.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM claw_agents WHERE status = 'online'`).Scan(&clawCount)
		count += clawCount
	}
	return count
}

// pullModel downloads a model to the local Ollama instance
func (smm *SwarmModelManager) pullModel(model ModelInfo) {
	if smm.ollamaURL == "" {
		return
	}

	body, _ := json.Marshal(map[string]interface{}{
		"name":   model.Name,
		"stream": false,
	})

	req, _ := http.NewRequest("POST", smm.ollamaURL+"/api/pull", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("⚠️ [SwarmModels] Failed to pull %s: %v", model.Name, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		smm.mu.Lock()
		model.Loaded = true
		smm.activeModels[model.Name] = model
		smm.mu.Unlock()

		// Record in DB
		if smm.db != nil {
			capsJSON, _ := json.Marshal(model.Capabilities)
			smm.db.Exec(`INSERT INTO swarm_models (model_name, tier, status, capabilities, cost_gstd)
				VALUES ($1, $2, 'active', $3, $4) ON CONFLICT (model_name) DO UPDATE SET status = 'active'`,
				model.Name, model.Tier, string(capsJSON), model.CostGSTD)
		}

		log.Printf("✅ [SwarmModels] Model %s loaded successfully (tier %d)", model.Name, model.Tier)
	}
}

// refreshLoadedModels checks Ollama for currently loaded models
func (smm *SwarmModelManager) refreshLoadedModels() {
	if smm.ollamaURL == "" {
		return
	}

	resp, err := http.Get(smm.ollamaURL + "/api/tags")
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if json.NewDecoder(resp.Body).Decode(&result) != nil {
		return
	}

	for _, m := range result.Models {
		for _, tier := range modelTiers {
			if strings.HasPrefix(m.Name, strings.Split(tier.Name, ":")[0]) {
				tier.Loaded = true
				smm.activeModels[tier.Name] = tier
			}
		}
	}
}

// GetActiveModels returns currently available models
func (smm *SwarmModelManager) GetActiveModels() []ModelInfo {
	smm.mu.RLock()
	defer smm.mu.RUnlock()

	models := make([]ModelInfo, 0, len(smm.activeModels))
	for _, m := range smm.activeModels {
		models = append(models, m)
	}
	return models
}

// GetNodeCount returns current node count
func (smm *SwarmModelManager) GetNodeCount() int {
	smm.mu.RLock()
	defer smm.mu.RUnlock()
	return smm.nodeCount
}

// GetSwarmStatus returns full swarm status for API
func (smm *SwarmModelManager) GetSwarmStatus() map[string]interface{} {
	smm.mu.RLock()
	defer smm.mu.RUnlock()

	models := make([]map[string]interface{}, 0)
	for _, m := range smm.activeModels {
		models = append(models, map[string]interface{}{
			"name":         m.Name,
			"tier":         m.Tier,
			"loaded":       m.Loaded,
			"capabilities": m.Capabilities,
			"cost_gstd":    m.CostGSTD,
		})
	}

	// Next tier info
	var nextTier *ModelInfo
	for _, t := range modelTiers {
		if _, loaded := smm.activeModels[t.Name]; !loaded {
			nextTier = &t
			break
		}
	}

	status := map[string]interface{}{
		"node_count":      smm.nodeCount,
		"active_models":   models,
		"total_models":    len(smm.activeModels),
		"last_check":      smm.lastCheck,
		"fault_tolerance": smm.nodeCount > 1,
		"load_balanced":   smm.nodeCount > 1,
	}

	if nextTier != nil {
		status["next_unlock"] = map[string]interface{}{
			"model":       nextTier.Name,
			"tier":        nextTier.Tier,
			"needs_nodes": nextTier.MinNodes,
			"current":     smm.nodeCount,
			"remaining":   fmt.Sprintf("%d more nodes needed", max(0, nextTier.MinNodes-smm.nodeCount)),
		}
	}

	return status
}

// RouteRequest selects the best model for a given task
func (smm *SwarmModelManager) RouteRequest(capability string) string {
	smm.mu.RLock()
	defer smm.mu.RUnlock()

	for _, m := range smm.activeModels {
		if !m.Loaded {
			continue
		}
		for _, cap := range m.Capabilities {
			if strings.Contains(strings.ToLower(capability), cap) {
				return m.Name
			}
		}
	}

	// Default to first available
	for _, m := range smm.activeModels {
		if m.Loaded {
			return m.Name
		}
	}
	return "qwen2.5-coder:7b"
}
