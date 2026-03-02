package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// SwarmModelManager handles automatic model distribution and updates across the swarm.
// As the swarm grows, it auto-pulls smarter models and keeps them updated.
//
// Scale tiers:
//
//	Tier 1 (1+ nodes):    Small fast models ~7B — instant responses
//	Tier 2 (5+ nodes):    Reasoning models ~8B — deep analysis
//	Tier 3 (10+ nodes):   Conversation 8B — creative/multi-language
//	Tier 4 (20+ nodes):   Specialized 9B — multilingual/classification
//	Tier 5 (50+ nodes):   MoE 8x7B — expert mixture
//	Tier 6 (100+ nodes):  Large 70B — GPT-4 class intelligence
//	Tier 7 (200+ nodes):  Frontier reasoning 70B — o1-class
//	Tier 8 (500+ nodes):  Ultra 405B — most intelligent open model
//	Tier 9 (1000+ nodes): Multi-frontier — multiple 70B+ in parallel
type SwarmModelManager struct {
	db        *sql.DB
	ollamaURL string
	mu        sync.RWMutex

	// Current state
	activeModels   map[string]ModelInfo
	nodeCount      int
	lastCheck      time.Time
	lastUpdate     time.Time
	updateInterval time.Duration
	pulling        map[string]bool // models currently being pulled
}

// ModelInfo describes a model in the swarm
type ModelInfo struct {
	Name         string    `json:"name"`
	Family       string    `json:"family"` // model family for update tracking
	Size         string    `json:"size"`
	Tier         int       `json:"tier"`
	MinNodes     int       `json:"min_nodes"`
	Loaded       bool      `json:"loaded"`
	Capabilities []string  `json:"capabilities"`
	CostGSTD     float64   `json:"cost_gstd_per_request"`
	Intelligence string    `json:"intelligence"`  // basic/advanced/frontier/ultra
	ParamCount   string    `json:"param_count"`   // 7B, 70B, 405B
	UpdatePolicy string    `json:"update_policy"` // latest, stable, pinned
	LoadedAt     time.Time `json:"loaded_at,omitempty"`
}

// modelTiers defines the full scaling roadmap.
// Sorted by tier — the swarm unlocks progressively smarter models as it grows.
var modelTiers = []ModelInfo{
	// ── Tier 1-2: Small Fast (any node can run) ──
	{
		Name: "qwen2.5-coder:7b", Family: "qwen2.5-coder", Size: "4.7GB", Tier: 1, MinNodes: 1,
		Capabilities: []string{"code", "general", "fast", "debug", "refactor"},
		CostGSTD:     0.05, Intelligence: "basic", ParamCount: "7B", UpdatePolicy: "latest",
	},
	{
		Name: "deepseek-r1:8b", Family: "deepseek-r1", Size: "4.9GB", Tier: 2, MinNodes: 5,
		Capabilities: []string{"reasoning", "math", "analysis", "logic", "planning"},
		CostGSTD:     0.08, Intelligence: "advanced", ParamCount: "8B", UpdatePolicy: "latest",
	},

	// ── Tier 3-4: Specialized (10+ nodes) ──
	{
		Name: "llama3.1:8b", Family: "llama3.1", Size: "4.7GB", Tier: 3, MinNodes: 10,
		Capabilities: []string{"conversation", "creative", "multilingual", "writing", "chat"},
		CostGSTD:     0.06, Intelligence: "advanced", ParamCount: "8B", UpdatePolicy: "latest",
	},
	{
		Name: "gemma2:9b", Family: "gemma2", Size: "5.4GB", Tier: 4, MinNodes: 20,
		Capabilities: []string{"multilingual", "translation", "classification", "embeddings"},
		CostGSTD:     0.06, Intelligence: "advanced", ParamCount: "9B", UpdatePolicy: "latest",
	},

	// ── Tier 5: MoE (50+ nodes — needs more RAM distributed) ──
	{
		Name: "mixtral:8x7b", Family: "mixtral", Size: "26GB", Tier: 5, MinNodes: 50,
		Capabilities: []string{"complex", "moe", "expert", "long_context", "multi_task"},
		CostGSTD:     0.12, Intelligence: "advanced", ParamCount: "46.7B", UpdatePolicy: "stable",
	},

	// ── Tier 6: Large 70B (100+ nodes — GPT-4 class) ──
	{
		Name: "llama3.1:70b", Family: "llama3.1", Size: "40GB", Tier: 6, MinNodes: 100,
		Capabilities: []string{"gpt4_class", "reasoning", "creative", "code", "analysis", "research"},
		CostGSTD:     0.20, Intelligence: "frontier", ParamCount: "70B", UpdatePolicy: "latest",
	},

	// ── Tier 7: Frontier Reasoning 70B (200+ nodes — o1-class) ──
	{
		Name: "deepseek-r1:70b", Family: "deepseek-r1", Size: "42GB", Tier: 7, MinNodes: 200,
		Capabilities: []string{"deep_reasoning", "math_olympiad", "science", "theorem_proving", "o1_class"},
		CostGSTD:     0.25, Intelligence: "frontier", ParamCount: "70B", UpdatePolicy: "latest",
	},

	// ── Tier 8: Ultra 405B (500+ nodes — most intelligent open model) ──
	{
		Name: "llama3.1:405b", Family: "llama3.1", Size: "230GB", Tier: 8, MinNodes: 500,
		Capabilities: []string{"ultra", "gpt4o_class", "research", "code_architect", "creative_genius", "polymath"},
		CostGSTD:     0.50, Intelligence: "ultra", ParamCount: "405B", UpdatePolicy: "stable",
	},

	// ── Tier 9: Multi-Frontier (1000+ nodes — multiple big models in parallel) ──
	{
		Name: "qwen2.5:72b", Family: "qwen2.5", Size: "41GB", Tier: 9, MinNodes: 1000,
		Capabilities: []string{"code_master", "system_design", "architecture", "full_stack"},
		CostGSTD:     0.22, Intelligence: "frontier", ParamCount: "72B", UpdatePolicy: "latest",
	},
}

func NewSwarmModelManager(db *sql.DB, ollamaURL string) *SwarmModelManager {
	smm := &SwarmModelManager{
		db:             db,
		ollamaURL:      ollamaURL,
		activeModels:   make(map[string]ModelInfo),
		pulling:        make(map[string]bool),
		updateInterval: 6 * time.Hour, // check for model updates every 6 hours
	}
	smm.ensureSchema()
	go smm.managementLoop()
	go smm.updateLoop()
	return smm
}

func (smm *SwarmModelManager) ensureSchema() {
	if smm.db == nil {
		return
	}
	smm.db.Exec(`CREATE TABLE IF NOT EXISTS swarm_models (
		model_name VARCHAR(128) PRIMARY KEY,
		family VARCHAR(64) DEFAULT '',
		tier INT DEFAULT 1,
		size_bytes BIGINT DEFAULT 0,
		status VARCHAR(32) DEFAULT 'pending',
		param_count VARCHAR(16) DEFAULT '',
		intelligence VARCHAR(32) DEFAULT 'basic',
		update_policy VARCHAR(32) DEFAULT 'latest',
		nodes_serving INT DEFAULT 0,
		total_requests BIGINT DEFAULT 0,
		avg_latency_ms INT DEFAULT 0,
		capabilities TEXT DEFAULT '[]',
		cost_gstd NUMERIC(10,6) DEFAULT 0.1,
		loaded_at TIMESTAMP DEFAULT NOW(),
		last_used_at TIMESTAMP DEFAULT NOW(),
		last_updated_at TIMESTAMP DEFAULT NOW(),
		model_digest VARCHAR(128) DEFAULT ''
	)`)
	// Add columns if they don't already exist (safe for existing tables)
	for _, col := range []string{
		"family VARCHAR(64) DEFAULT ''",
		"param_count VARCHAR(16) DEFAULT ''",
		"intelligence VARCHAR(32) DEFAULT 'basic'",
		"update_policy VARCHAR(32) DEFAULT 'latest'",
		"last_updated_at TIMESTAMP DEFAULT NOW()",
		"model_digest VARCHAR(128) DEFAULT ''",
	} {
		parts := strings.SplitN(col, " ", 2)
		smm.db.Exec(fmt.Sprintf("ALTER TABLE swarm_models ADD COLUMN IF NOT EXISTS %s %s", parts[0], parts[1]))
	}
}

// managementLoop checks swarm size and auto-loads models every 5 minutes
func (smm *SwarmModelManager) managementLoop() {
	time.Sleep(15 * time.Second)
	smm.checkAndScale(context.Background())

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		smm.checkAndScale(context.Background())
	}
}

// updateLoop checks for newer model versions and auto-updates
func (smm *SwarmModelManager) updateLoop() {
	// First update check after 10 minutes
	time.Sleep(10 * time.Minute)

	for {
		smm.checkForUpdates(context.Background())
		time.Sleep(smm.updateInterval)
	}
}

// checkAndScale evaluates node count and pulls models as needed
func (smm *SwarmModelManager) checkAndScale(ctx context.Context) {
	smm.mu.Lock()
	defer smm.mu.Unlock()

	nodeCount := smm.countActiveNodes(ctx)
	smm.nodeCount = nodeCount

	for _, model := range modelTiers {
		if nodeCount >= model.MinNodes {
			if _, exists := smm.activeModels[model.Name]; !exists {
				if smm.pulling[model.Name] {
					continue // already pulling
				}
				log.Printf("🚀 [SwarmModels] Tier %d UNLOCKED (nodes=%d≥%d): pulling %s (%s, %s)...",
					model.Tier, nodeCount, model.MinNodes, model.Name, model.ParamCount, model.Intelligence)
				smm.pulling[model.Name] = true
				go smm.pullModel(model)
			}
		}
	}

	smm.refreshLoadedModels()
	smm.lastCheck = time.Now()

	log.Printf("🧠 [SwarmModels] Status: %d nodes, %d models active, intelligence=%s",
		nodeCount, len(smm.activeModels), smm.getMaxIntelligence())
}

// checkForUpdates pulls latest versions of loaded models with "latest" update policy
func (smm *SwarmModelManager) checkForUpdates(ctx context.Context) {
	smm.mu.RLock()
	modelsToUpdate := make([]ModelInfo, 0)
	for _, m := range smm.activeModels {
		if m.UpdatePolicy == "latest" && m.Loaded {
			modelsToUpdate = append(modelsToUpdate, m)
		}
	}
	smm.mu.RUnlock()

	if len(modelsToUpdate) == 0 {
		return
	}

	log.Printf("🔄 [SwarmModels] Checking %d models for updates...", len(modelsToUpdate))

	for _, model := range modelsToUpdate {
		// Get current digest
		currentDigest := smm.getModelDigest(model.Name)

		// Pull latest (Ollama will skip if already up-to-date)
		smm.pullModelUpdate(model, currentDigest)
	}

	smm.mu.Lock()
	smm.lastUpdate = time.Now()
	smm.mu.Unlock()

	log.Printf("✅ [SwarmModels] Update check complete")
}

// getModelDigest returns the sha256 digest of a model from Ollama
func (smm *SwarmModelManager) getModelDigest(name string) string {
	if smm.ollamaURL == "" {
		return ""
	}

	body, _ := json.Marshal(map[string]string{"name": name})
	resp, err := http.Post(smm.ollamaURL+"/api/show", "application/json", strings.NewReader(string(body)))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var result struct {
		Digest string `json:"digest"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	return result.Digest
}

// pullModelUpdate re-pulls a model and checks if it was actually updated
func (smm *SwarmModelManager) pullModelUpdate(model ModelInfo, oldDigest string) {
	if smm.ollamaURL == "" {
		return
	}

	body, _ := json.Marshal(map[string]interface{}{
		"name":   model.Name,
		"stream": false,
	})

	req, _ := http.NewRequest("POST", smm.ollamaURL+"/api/pull", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Minute} // large models need more time
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("⚠️ [SwarmModels] Update failed for %s: %v", model.Name, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		newDigest := smm.getModelDigest(model.Name)
		if newDigest != "" && newDigest != oldDigest && oldDigest != "" {
			log.Printf("🆕 [SwarmModels] UPDATED %s: %s → %s", model.Name, oldDigest[:12], newDigest[:12])
			if smm.db != nil {
				smm.db.Exec(`UPDATE swarm_models SET last_updated_at = NOW(), model_digest = $1 WHERE model_name = $2`,
					newDigest, model.Name)
			}
		}
	}
}

// countActiveNodes returns the number of active swarm nodes
func (smm *SwarmModelManager) countActiveNodes(ctx context.Context) int {
	count := 1 // local Ollama
	if smm.db != nil {
		var agentCount int
		smm.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM agent_api_keys WHERE is_active = true AND last_used_at > NOW() - INTERVAL '1 hour'`).Scan(&agentCount)
		count += agentCount

		var clawCount int
		smm.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM claw_agents WHERE status = 'online'`).Scan(&clawCount)
		count += clawCount
	}
	return count
}

// pullModel downloads a model to the local Ollama instance
func (smm *SwarmModelManager) pullModel(model ModelInfo) {
	if smm.ollamaURL == "" {
		smm.mu.Lock()
		delete(smm.pulling, model.Name)
		smm.mu.Unlock()
		return
	}

	body, _ := json.Marshal(map[string]interface{}{
		"name":   model.Name,
		"stream": false,
	})

	req, _ := http.NewRequest("POST", smm.ollamaURL+"/api/pull", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Minute} // 405B can take hours
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("⚠️ [SwarmModels] Failed to pull %s: %v", model.Name, err)
		smm.mu.Lock()
		delete(smm.pulling, model.Name)
		smm.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		model.Loaded = true
		model.LoadedAt = time.Now()
		digest := smm.getModelDigest(model.Name)

		smm.mu.Lock()
		smm.activeModels[model.Name] = model
		delete(smm.pulling, model.Name)
		smm.mu.Unlock()

		// Record in DB
		if smm.db != nil {
			capsJSON, _ := json.Marshal(model.Capabilities)
			smm.db.Exec(`INSERT INTO swarm_models (model_name, family, tier, status, capabilities, cost_gstd, param_count, intelligence, update_policy, model_digest)
				VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9) 
				ON CONFLICT (model_name) DO UPDATE SET status = 'active', last_updated_at = NOW(), model_digest = $9`,
				model.Name, model.Family, model.Tier, string(capsJSON), model.CostGSTD,
				model.ParamCount, model.Intelligence, model.UpdatePolicy, digest)
		}

		log.Printf("✅ [SwarmModels] %s LOADED (tier %d, %s, %s intelligence)", model.Name, model.Tier, model.ParamCount, model.Intelligence)
	} else {
		smm.mu.Lock()
		delete(smm.pulling, model.Name)
		smm.mu.Unlock()
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
				tier.LoadedAt = time.Now()
				smm.activeModels[tier.Name] = tier
			}
		}
	}
}

// getMaxIntelligence returns the highest intelligence level available
func (smm *SwarmModelManager) getMaxIntelligence() string {
	levels := map[string]int{"basic": 1, "advanced": 2, "frontier": 3, "ultra": 4}
	maxLevel := 0
	maxName := "none"
	for _, m := range smm.activeModels {
		if m.Loaded {
			if l, ok := levels[m.Intelligence]; ok && l > maxLevel {
				maxLevel = l
				maxName = m.Intelligence
			}
		}
	}
	return maxName
}

// GetActiveModels returns currently available models sorted by tier
func (smm *SwarmModelManager) GetActiveModels() []ModelInfo {
	smm.mu.RLock()
	defer smm.mu.RUnlock()

	models := make([]ModelInfo, 0, len(smm.activeModels))
	for _, m := range smm.activeModels {
		models = append(models, m)
	}
	sort.Slice(models, func(i, j int) bool { return models[i].Tier < models[j].Tier })
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
			"name":          m.Name,
			"tier":          m.Tier,
			"loaded":        m.Loaded,
			"capabilities":  m.Capabilities,
			"cost_gstd":     m.CostGSTD,
			"intelligence":  m.Intelligence,
			"param_count":   m.ParamCount,
			"update_policy": m.UpdatePolicy,
		})
	}

	// All future unlocks
	upcoming := make([]map[string]interface{}, 0)
	for _, t := range modelTiers {
		if _, loaded := smm.activeModels[t.Name]; !loaded {
			upcoming = append(upcoming, map[string]interface{}{
				"model":        t.Name,
				"tier":         t.Tier,
				"needs_nodes":  t.MinNodes,
				"remaining":    max(0, t.MinNodes-smm.nodeCount),
				"intelligence": t.Intelligence,
				"param_count":  t.ParamCount,
				"size":         t.Size,
			})
		}
	}

	// Currently pulling
	pulling := make([]string, 0)
	for name := range smm.pulling {
		pulling = append(pulling, name)
	}

	return map[string]interface{}{
		"node_count":        smm.nodeCount,
		"active_models":     models,
		"total_models":      len(smm.activeModels),
		"max_intelligence":  smm.getMaxIntelligence(),
		"last_check":        smm.lastCheck,
		"last_model_update": smm.lastUpdate,
		"fault_tolerance":   smm.nodeCount > 1,
		"load_balanced":     smm.nodeCount > 1,
		"auto_update":       true,
		"update_interval":   smm.updateInterval.String(),
		"upcoming_unlocks":  upcoming,
		"currently_pulling": pulling,
		"scaling_roadmap": map[string]string{
			"1_nodes":    "7B fast models (basic)",
			"5_nodes":    "8B reasoning (advanced)",
			"10_nodes":   "8B conversation (advanced)",
			"20_nodes":   "9B multilingual (advanced)",
			"50_nodes":   "46.7B MoE expert (advanced)",
			"100_nodes":  "70B GPT-4 class (frontier)",
			"200_nodes":  "70B o1-class reasoning (frontier)",
			"500_nodes":  "405B most intelligent open model (ultra)",
			"1000_nodes": "72B+ multi-model parallel (frontier)",
		},
	}
}

// RouteRequest selects the best model for a given task based on capabilities
func (smm *SwarmModelManager) RouteRequest(capability string) string {
	smm.mu.RLock()
	defer smm.mu.RUnlock()

	lower := strings.ToLower(capability)

	// Score each model by capability match
	type scored struct {
		name  string
		score int
		tier  int
	}
	var matches []scored

	for _, m := range smm.activeModels {
		if !m.Loaded {
			continue
		}
		s := 0
		for _, cap := range m.Capabilities {
			if strings.Contains(lower, cap) {
				s += 10
			}
		}
		// Prefer higher-tier models for complex queries
		if strings.Contains(lower, "complex") || strings.Contains(lower, "research") ||
			strings.Contains(lower, "architect") {
			s += m.Tier // bonus for bigger models
		}
		if s > 0 {
			matches = append(matches, scored{m.Name, s, m.Tier})
		}
	}

	if len(matches) > 0 {
		// Sort by score desc, tier desc (prefer smartest matching model)
		sort.Slice(matches, func(i, j int) bool {
			if matches[i].score == matches[j].score {
				return matches[i].tier > matches[j].tier
			}
			return matches[i].score > matches[j].score
		})
		return matches[0].name
	}

	// Default: highest tier available
	bestTier := 0
	bestName := "qwen2.5-coder:7b"
	for _, m := range smm.activeModels {
		if m.Loaded && m.Tier > bestTier {
			bestTier = m.Tier
			bestName = m.Name
		}
	}
	return bestName
}

// RouteBestModel returns the smartest available model
func (smm *SwarmModelManager) RouteBestModel() string {
	smm.mu.RLock()
	defer smm.mu.RUnlock()

	bestTier := 0
	bestName := "qwen2.5-coder:7b"
	for _, m := range smm.activeModels {
		if m.Loaded && m.Tier > bestTier {
			bestTier = m.Tier
			bestName = m.Name
		}
	}
	return bestName
}
