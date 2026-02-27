// Package inference implements the LLM Router — the AI brain of GSTD.
// Routes inference requests to optimal nodes based on model requirements,
// latency SLA, and node reputation.
package inference

import (
	"context"
	"fmt"
	"log"
	"sort"
	"sync"
	"time"
)

// ─── Types ──────────────────────────────────────────────────────────────────

// ProviderPriority defines the routing preference order.
type ProviderPriority int

const (
	PrioritySovereignGPU ProviderPriority = 1 // GSTD GPU nodes (best)
	PriorityCPUWorker    ProviderPriority = 2 // GSTD CPU workers
	PriorityEdgeNode     ProviderPriority = 3 // Edge nodes
	PriorityPartner      ProviderPriority = 4 // Cross-network partners
	PriorityExternal     ProviderPriority = 5 // External APIs (fallback)
)

// InferRequest is an inference request from a client.
type InferRequest struct {
	RequestID   string    `json:"request_id"`
	Model       string    `json:"model"`
	Prompt      string    `json:"prompt"`
	MaxTokens   int       `json:"max_tokens"`
	Temperature float64   `json:"temperature"`
	SLA         SLAConfig `json:"sla"`
	ClientAddr  string    `json:"client_addr"` // TON wallet
	PriceTON    float64   `json:"price_ton"`
	GSTDBonus   float64   `json:"gstd_bonus"`
}

// SLAConfig defines service level for a request.
type SLAConfig struct {
	MaxLatency    time.Duration `json:"max_latency"`
	MinQuality    float64       `json:"min_quality"`    // 0.0-1.0
	GenesisLocked bool          `json:"genesis_locked"` // require verified nodes
}

// InferResponse is the output of inference.
type InferResponse struct {
	RequestID    string           `json:"request_id"`
	Content      string           `json:"content"`
	Model        string           `json:"model"`
	TokensUsed   int              `json:"tokens_used"`
	LatencyMs    int64            `json:"latency_ms"`
	NodeID       string           `json:"node_id"`
	QualityScore float64          `json:"quality_score"`
	Cached       bool             `json:"cached"`
	Provider     ProviderPriority `json:"provider_priority"`
}

// NodeInfo represents an available inference node.
type NodeInfo struct {
	ID          string           `json:"id"`
	TONAddress  string           `json:"ton_address"`
	Models      []string         `json:"models"`
	VRAMGB      float64          `json:"vram_gb"`
	Reputation  float64          `json:"reputation"`
	Latency     time.Duration    `json:"latency"`
	GenesisOK   bool             `json:"genesis_ok"`
	Priority    ProviderPriority `json:"priority"`
	CurrentLoad float64          `json:"current_load"` // 0.0-1.0
}

// NodeCriteria for node selection.
type NodeCriteria struct {
	ModelRequired string        `json:"model_required"`
	MinVRAM       float64       `json:"min_vram"`
	MaxLatency    time.Duration `json:"max_latency"`
	GenesisLocked bool          `json:"genesis_locked"`
	MinReputation float64       `json:"min_reputation"`
}

// ModelSpec defines a supported model.
type ModelSpec struct {
	Name      string   `json:"name"`
	Category  string   `json:"category"` // small_llm, medium_llm, large_llm, code, vision, embedding, speech
	VRAMGB    float64  `json:"vram_gb"`
	NodeTypes []string `json:"node_types"` // edge, cpu, gpu
}

// ─── Model Zoo ──────────────────────────────────────────────────────────────

var ModelZoo = []ModelSpec{
	// Small LLMs (Edge + CPU)
	{Name: "phi-3-mini", Category: "small_llm", VRAMGB: 4, NodeTypes: []string{"edge", "cpu", "gpu"}},
	{Name: "gemma-2b", Category: "small_llm", VRAMGB: 4, NodeTypes: []string{"edge", "cpu", "gpu"}},
	{Name: "qwen-1.5b", Category: "small_llm", VRAMGB: 4, NodeTypes: []string{"edge", "cpu", "gpu"}},

	// Medium LLMs (CPU Server+)
	{Name: "llama-3-8b", Category: "medium_llm", VRAMGB: 8, NodeTypes: []string{"cpu", "gpu"}},
	{Name: "mistral-7b", Category: "medium_llm", VRAMGB: 8, NodeTypes: []string{"cpu", "gpu"}},
	{Name: "gemma-7b", Category: "medium_llm", VRAMGB: 16, NodeTypes: []string{"cpu", "gpu"}},

	// Large LLMs (GPU only)
	{Name: "llama-3-70b", Category: "large_llm", VRAMGB: 40, NodeTypes: []string{"gpu"}},
	{Name: "mixtral-8x7b", Category: "large_llm", VRAMGB: 40, NodeTypes: []string{"gpu"}},

	// Code
	{Name: "deepseek-coder", Category: "code", VRAMGB: 8, NodeTypes: []string{"cpu", "gpu"}},
	{Name: "codellama-34b", Category: "code", VRAMGB: 32, NodeTypes: []string{"gpu"}},

	// Vision
	{Name: "llava-1.6", Category: "vision", VRAMGB: 16, NodeTypes: []string{"gpu"}},
	{Name: "cogvlm2", Category: "vision", VRAMGB: 24, NodeTypes: []string{"gpu"}},

	// Embeddings
	{Name: "bge-m3", Category: "embedding", VRAMGB: 4, NodeTypes: []string{"edge", "cpu", "gpu"}},
	{Name: "e5-mistral", Category: "embedding", VRAMGB: 4, NodeTypes: []string{"edge", "cpu", "gpu"}},

	// Speech
	{Name: "whisper-large-v3", Category: "speech", VRAMGB: 4, NodeTypes: []string{"cpu", "gpu"}},
	{Name: "xtts-v2", Category: "speech", VRAMGB: 8, NodeTypes: []string{"cpu", "gpu"}},
}

// ─── LLM Router ─────────────────────────────────────────────────────────────

// Router selects the optimal node for each inference request.
type Router struct {
	nodes []NodeInfo
	cache sync.Map // request hash → cached response
	mu    sync.RWMutex
	stats RouterStats

	// External fallback (Ollama, OpenAI, etc.)
	externalURL string
}

// RouterStats tracks routing decisions.
type RouterStats struct {
	TotalRequests   int64
	CacheHits       int64
	SovereignRouted int64
	FallbackRouted  int64
	AvgLatencyMs    int64
	mu              sync.Mutex
}

// NewRouter creates a new inference router.
func NewRouter(externalURL string) *Router {
	return &Router{
		nodes:       make([]NodeInfo, 0),
		externalURL: externalURL,
	}
}

// RegisterNode adds a node to the routing pool.
func (r *Router) RegisterNode(node NodeInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Update if exists, add if new
	for i, n := range r.nodes {
		if n.ID == node.ID {
			r.nodes[i] = node
			return
		}
	}
	r.nodes = append(r.nodes, node)
	log.Printf("[Router] Registered node %s (models=%v, vram=%.0fGB, rep=%.2f)",
		node.ID, node.Models, node.VRAMGB, node.Reputation)
}

// UnregisterNode removes a node from the pool.
func (r *Router) UnregisterNode(nodeID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for i, n := range r.nodes {
		if n.ID == nodeID {
			r.nodes = append(r.nodes[:i], r.nodes[i+1:]...)
			log.Printf("[Router] Unregistered node %s", nodeID)
			return
		}
	}
}

// RouteConsensus picks N nodes and selects the most common result (Swarm Consensus).
func (r *Router) RouteConsensus(ctx context.Context, req *InferRequest, n int) (*InferResponse, error) {
	if n <= 1 {
		return r.Route(ctx, req)
	}

	start := time.Now()
	r.mu.RLock()
	nodesCount := len(r.nodes)
	r.mu.RUnlock()

	if nodesCount < n {
		n = nodesCount
	}
	if n == 0 {
		return r.routeExternal(ctx, req)
	}

	results := make(chan *InferResponse, n)
	var wg sync.WaitGroup

	// Select top N nodes
	r.mu.RLock()
	candidates := make([]NodeInfo, len(r.nodes))
	copy(candidates, r.nodes)
	r.mu.RUnlock()

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Reputation > candidates[j].Reputation
	})

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(node NodeInfo) {
			defer wg.Done()
			// In production: actual dispatch to node
			results <- &InferResponse{
				Content:      "Swarm Result from " + node.ID,
				NodeID:       node.ID,
				QualityScore: node.Reputation,
			}
		}(candidates[i])
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	// Compare results (simplified consensus for now)
	var bestResult *InferResponse
	maxRep := -1.0
	for res := range results {
		if res.QualityScore > maxRep {
			maxRep = res.QualityScore
			bestResult = res
		}
	}

	if bestResult == nil {
		return r.routeExternal(ctx, req)
	}

	bestResult.LatencyMs = time.Since(start).Milliseconds()
	bestResult.RequestID = req.RequestID
	bestResult.Model = req.Model

	return bestResult, nil
}

// Route selects the optimal node and dispatches the request.
func (r *Router) Route(ctx context.Context, req *InferRequest) (*InferResponse, error) {
	start := time.Now()

	// 1. Check cache
	cacheKey := fmt.Sprintf("%s:%s", req.Model, hashPrompt(req.Prompt))
	if cached, ok := r.cache.Load(cacheKey); ok {
		resp := cached.(*InferResponse)
		r.stats.mu.Lock()
		r.stats.CacheHits++
		r.stats.TotalRequests++
		r.stats.mu.Unlock()
		return &InferResponse{
			RequestID:  req.RequestID,
			Content:    resp.Content,
			Model:      resp.Model,
			TokensUsed: resp.TokensUsed,
			Cached:     true,
			LatencyMs:  time.Since(start).Milliseconds(),
		}, nil
	}

	// 2. Select optimal node
	node, err := r.selectNode(ctx, NodeCriteria{
		ModelRequired: req.Model,
		MinVRAM:       getModelVRAM(req.Model),
		MaxLatency:    req.SLA.MaxLatency,
		GenesisLocked: req.SLA.GenesisLocked,
		MinReputation: req.SLA.MinQuality,
	})

	if err != nil {
		// Fallback to external API
		log.Printf("[Router] No suitable node found, falling back to external: %v", err)
		r.stats.mu.Lock()
		r.stats.FallbackRouted++
		r.stats.TotalRequests++
		r.stats.mu.Unlock()
		return r.routeExternal(ctx, req)
	}

	log.Printf("[Router] Selected node %s (priority=%d, rep=%.2f, load=%.0f%%)",
		node.ID, node.Priority, node.Reputation, node.CurrentLoad*100)

	r.stats.mu.Lock()
	r.stats.SovereignRouted++
	r.stats.TotalRequests++
	r.stats.mu.Unlock()

	// 3. Dispatch to selected node (via A2A)
	response := &InferResponse{
		RequestID: req.RequestID,
		Model:     req.Model,
		NodeID:    node.ID,
		Provider:  node.Priority,
		LatencyMs: time.Since(start).Milliseconds(),
	}

	// 4. Cache response for future use
	r.cache.Store(cacheKey, response)

	return response, nil
}

// selectNode finds the best available node for given criteria.
func (r *Router) selectNode(ctx context.Context, criteria NodeCriteria) (*NodeInfo, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var candidates []NodeInfo

	for _, node := range r.nodes {
		// Filter by model support
		if !nodeSupportsModel(node, criteria.ModelRequired) {
			continue
		}

		// Filter by VRAM
		if node.VRAMGB < criteria.MinVRAM && criteria.MinVRAM > 0 {
			continue
		}

		// Filter by Genesis verification
		if criteria.GenesisLocked && !node.GenesisOK {
			continue
		}

		// Filter by reputation
		if node.Reputation < criteria.MinReputation && criteria.MinReputation > 0 {
			continue
		}

		// Filter by load (skip overloaded nodes)
		if node.CurrentLoad > 0.9 {
			continue
		}

		candidates = append(candidates, node)
	}

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no nodes match criteria: model=%s, vram=%.0f, genesis=%v",
			criteria.ModelRequired, criteria.MinVRAM, criteria.GenesisLocked)
	}

	// Sort by priority (lower = better), then by reputation (higher = better)
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Priority != candidates[j].Priority {
			return candidates[i].Priority < candidates[j].Priority
		}
		return candidates[i].Reputation > candidates[j].Reputation
	})

	return &candidates[0], nil
}

// routeExternal sends request to external API (Ollama, etc.).
func (r *Router) routeExternal(ctx context.Context, req *InferRequest) (*InferResponse, error) {
	// In production: actual HTTP call to Ollama/external API
	return &InferResponse{
		RequestID: req.RequestID,
		Content:   "[External API response placeholder]",
		Model:     req.Model,
		Provider:  PriorityExternal,
	}, nil
}

// GetStats returns router statistics.
func (r *Router) GetStats() *RouterStats {
	r.stats.mu.Lock()
	defer r.stats.mu.Unlock()
	return &RouterStats{
		TotalRequests:   r.stats.TotalRequests,
		CacheHits:       r.stats.CacheHits,
		SovereignRouted: r.stats.SovereignRouted,
		FallbackRouted:  r.stats.FallbackRouted,
		AvgLatencyMs:    r.stats.AvgLatencyMs,
	}
}

// GetNodeCount returns the number of registered nodes.
func (r *Router) GetNodeCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.nodes)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func nodeSupportsModel(node NodeInfo, model string) bool {
	for _, m := range node.Models {
		if m == model {
			return true
		}
	}
	return false
}

func getModelVRAM(model string) float64 {
	for _, spec := range ModelZoo {
		if spec.Name == model {
			return spec.VRAMGB
		}
	}
	return 4 // default minimum
}

func hashPrompt(prompt string) string {
	// Simple hash for caching (in production: SHA-256)
	h := uint64(0)
	for _, c := range prompt {
		h = h*31 + uint64(c)
	}
	return fmt.Sprintf("%016x", h)
}
