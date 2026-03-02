package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// ═══════════════════════════════════════════════════════════════════════════════
// Omega Smart Router — Sovereign-First Routing Matrix
//
// Routing Priority (Swarm-First Paradigm):
//   L1: Experience Vault (cache — instant, free)
//   L2: GSTD Swarm (Ollama — sovereign, local open-source models)
//   L3: Cocoon TEE (GPU — sovereign, decentralized, TEE-verified)
//   L4: LiteLLM Proxy (commercial fallback — ONLY if L2+L3 fail)
//
// Every request processed by L2/L3 increases the Sovereignty Index.
// Every request that falls to L4 decreases it.
// Goal: Sovereignty Index → 99.9%
// ═══════════════════════════════════════════════════════════════════════════════

// ExperienceVault caches prior responses for L1 routing.
type ExperienceVault struct {
	mu sync.RWMutex
	// Stub: no-op implementation; override with real cache when needed
}

// Lookup returns cached response if hit.
func (v *ExperienceVault) Lookup(ctx context.Context, msgs []map[string]string, model string) (struct {
	Hit      bool
	Response string
}, error) {
	return struct {
		Hit      bool
		Response string
	}{Hit: false}, nil
}

// Store saves response for future lookup.
func (v *ExperienceVault) Store(ctx context.Context, msgs []map[string]string, model, response string, confidence float64) {
	// Stub: no-op
}

// GSTDOracleService provides GSTD price for cost calculation.
type GSTDOracleService struct {
	poolMonitor *PoolMonitorService
	cachedPrice float64
	cachedAt    time.Time
	mu          sync.RWMutex
}

// NewGSTDOracleService creates an oracle backed by PoolMonitorService.
func NewGSTDOracleService(pm *PoolMonitorService) *GSTDOracleService {
	return &GSTDOracleService{poolMonitor: pm}
}

// GetPrice returns current GSTD price in USD (cached, refreshed on each call if stale).
func (o *GSTDOracleService) GetPrice() float64 {
	const defaultPrice = 0.02
	if o == nil {
		return defaultPrice
	}
	o.mu.RLock()
	if time.Since(o.cachedAt) < 30*time.Second && o.cachedPrice > 0 {
		p := o.cachedPrice
		o.mu.RUnlock()
		return p
	}
	o.mu.RUnlock()

	if o.poolMonitor != nil {
		if p, err := o.poolMonitor.GetGSTDPriceUSD(context.Background()); err == nil && p > 0 {
			o.mu.Lock()
			o.cachedPrice = p
			o.cachedAt = time.Now()
			o.mu.Unlock()
			return p
		}
	}
	o.mu.RLock()
	p := o.cachedPrice
	o.mu.RUnlock()
	if p > 0 {
		return p
	}
	return defaultPrice
}

// ─── Sovereignty Metrics ────────────────────────────────────────────────────

// SovereigntyMetrics tracks how many requests are handled without commercial APIs.
type SovereigntyMetrics struct {
	TotalRequests      int64 `json:"total_requests"`
	SovereignSwarm     int64 `json:"sovereign_swarm"`        // L2: Ollama
	SovereignPhantomHF int64 `json:"sovereign_phantom_hf"`   // L2.5: HuggingFace
	SovereignPhantomGQ int64 `json:"sovereign_phantom_groq"` // L2.7: Groq
	SovereignCocoon    int64 `json:"sovereign_cocoon"`       // L3: Cocoon TEE
	SovereignCache     int64 `json:"sovereign_cache"`        // L1: Vault
	FallbackCommerce   int64 `json:"fallback_commercial"`    // L4: LiteLLM
}

// SovereigntyIndex returns 0.0-100.0 representing % of requests handled sovereignly.
func (m *SovereigntyMetrics) SovereigntyIndex() float64 {
	total := atomic.LoadInt64(&m.TotalRequests)
	if total == 0 {
		return 100.0
	}
	commercial := atomic.LoadInt64(&m.FallbackCommerce)
	return float64(total-commercial) / float64(total) * 100.0
}

// ─── Phantom Node Health ────────────────────────────────────────────────────

// PhantomProvider identifies a free-tier external provider.
type PhantomProvider int

const (
	PhantomHuggingFace PhantomProvider = iota
	PhantomGroq
)

// PhantomEndpoint tracks the health state of a phantom provider.
type PhantomEndpoint struct {
	Provider      PhantomProvider
	Healthy       bool
	CooldownUntil time.Time // Don't use until this time (after 429/error)
	ConsecFails   int
	LastLatencyMs int64
	TotalCalls    int64
	TotalErrors   int64
	mu            sync.Mutex
}

// IsAvailable returns true if the endpoint is healthy and not in cooldown.
func (pe *PhantomEndpoint) IsAvailable() bool {
	pe.mu.Lock()
	defer pe.mu.Unlock()
	return pe.Healthy && time.Now().After(pe.CooldownUntil)
}

// RecordSuccess resets failure counters.
func (pe *PhantomEndpoint) RecordSuccess(latencyMs int64) {
	pe.mu.Lock()
	defer pe.mu.Unlock()
	pe.Healthy = true
	pe.ConsecFails = 0
	pe.LastLatencyMs = latencyMs
	pe.TotalCalls++
}

// RecordFailure increments failure counter and applies cooldown.
func (pe *PhantomEndpoint) RecordFailure(isRateLimit bool) {
	pe.mu.Lock()
	defer pe.mu.Unlock()
	pe.ConsecFails++
	pe.TotalErrors++
	pe.TotalCalls++
	if isRateLimit {
		// Rate limited → 60s cooldown (respect the provider)
		pe.CooldownUntil = time.Now().Add(60 * time.Second)
		log.Printf("[Phantom] Provider %d rate-limited, cooling down 60s", pe.Provider)
	} else if pe.ConsecFails >= 3 {
		// 3 consecutive failures → disable 5 minutes
		pe.Healthy = false
		pe.CooldownUntil = time.Now().Add(5 * time.Minute)
		log.Printf("[Phantom] Provider %d disabled for 5m after %d consecutive failures", pe.Provider, pe.ConsecFails)
	}
}

// ─── SmartRouter ────────────────────────────────────────────────────────────

// SmartRouter manages the Sovereign-First routing logic.
// Priority: L1 Cache → L2 Swarm → L2.5 HuggingFace → L2.7 Groq → L3 Cocoon → L4 Commercial
type SmartRouter struct {
	vault         *ExperienceVault
	oracle        *GSTDOracleService
	ollamaURL     string
	ollamaClient  *http.Client
	litellmURL    string
	litellmKey    string
	litellmClient *http.Client
	pricingTable  map[string]ModelPricing
	sovereignty   SovereigntyMetrics

	// Phantom Nodes — free-tier API providers (single key each, respecting rate limits)
	hfToken     string
	hfClient    *http.Client
	phantomHF   PhantomEndpoint
	groqKey     string
	groqClient  *http.Client
	phantomGroq PhantomEndpoint
}

// ModelPricing defines cost structure for each model
type ModelPricing struct {
	InputUSDPer1K  float64 `json:"input_usd_per_1k"`
	OutputUSDPer1K float64 `json:"output_usd_per_1k"`
	Provider       string  `json:"provider"`
	SwarmCapable   bool    `json:"swarm_capable"`
}

type RoutingDecision struct {
	Tier             int            `json:"tier"`
	TierName         string         `json:"tier_name"`
	Model            string         `json:"model"`
	ActualModel      string         `json:"actual_model"`
	Provider         string         `json:"provider"`
	Response         string         `json:"response"` // Sync response content
	StreamResponse   *http.Response `json:"-"`        // Raw stream for L3 proxy
	PromptTokens     int            `json:"prompt_tokens"`
	CompletionTokens int            `json:"completion_tokens"`
	TotalTokens      int            `json:"total_tokens"`
	CostGSTD         float64        `json:"cost_gstd"`
	CostUSD          float64        `json:"cost_usd"`
	SavingsPct       float64        `json:"savings_pct"`
	LatencyMs        int64          `json:"latency_ms"`
	CacheHit         bool           `json:"cache_hit"`
	TransactionID    string         `json:"transaction_id"`
	Sovereign        bool           `json:"sovereign"` // true if handled without commercial API
}

type OmegaChatRequest struct {
	Model       string                   `json:"model"`
	Messages    []map[string]interface{} `json:"messages"`
	Temperature float64                  `json:"temperature,omitempty"`
	MaxTokens   int                      `json:"max_tokens,omitempty"`
	Stream      bool                     `json:"stream"`
}

// ─── Sovereign Model Map ────────────────────────────────────────────────────
// Maps user-facing model names to Ollama-compatible sovereign models.
var sovereignModelMap = map[string]string{
	"flash":       "qwen2.5-coder:7b",
	"omega-flash": "qwen2.5-coder:7b",
	"pro":         "qwen2.5-coder:32b",
	"omega-pro":   "qwen2.5-coder:32b",
	"ultra":       "deepseek-r1:14b",
	"omega-ultra": "deepseek-r1:14b",
	"code":        "qwen2.5-coder:7b",
	"reason":      "deepseek-r1:14b",
	"creative":    "llama3.1:8b",
}

// isSovereignCapable returns true if the model can be served by Swarm (Ollama).
func isSovereignCapable(model string) bool {
	lower := strings.ToLower(model)
	if _, ok := sovereignModelMap[lower]; ok {
		return true
	}
	// Direct Ollama model names
	ollamaModels := []string{"qwen", "llama", "deepseek", "phi", "gemma", "mistral", "codellama", "starcoder"}
	for _, m := range ollamaModels {
		if strings.Contains(lower, m) {
			return true
		}
	}
	return false
}

// resolveSovereignModel maps a user model to the best sovereign model.
func resolveSovereignModel(model string) string {
	if mapped, ok := sovereignModelMap[strings.ToLower(model)]; ok {
		return mapped
	}
	return model // Direct Ollama model name
}

func NewSmartRouter(vault *ExperienceVault, oracle *GSTDOracleService) *SmartRouter {
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
	}
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://gstd_ollama:11434"
	}
	router := &SmartRouter{
		vault:         vault,
		oracle:        oracle,
		ollamaURL:     ollamaURL,
		ollamaClient:  &http.Client{Timeout: 120 * time.Second, Transport: transport},
		litellmURL:    os.Getenv("LITELLM_URL"),
		litellmKey:    os.Getenv("LITELLM_MASTER_KEY"),
		litellmClient: &http.Client{Timeout: 300 * time.Second, Transport: transport},
		// Phantom Nodes — single key per provider, respect rate limits
		hfToken:    os.Getenv("HF_TOKEN"),
		hfClient:   &http.Client{Timeout: 30 * time.Second, Transport: transport},
		groqKey:    os.Getenv("GROQ_API_KEY"),
		groqClient: &http.Client{Timeout: 15 * time.Second, Transport: transport},
	}
	if router.litellmURL == "" {
		router.litellmURL = "http://gstd_litellm:4000"
	}

	// Initialize phantom endpoint health
	router.phantomHF = PhantomEndpoint{Provider: PhantomHuggingFace, Healthy: router.hfToken != ""}
	router.phantomGroq = PhantomEndpoint{Provider: PhantomGroq, Healthy: router.groqKey != ""}

	router.pricingTable = map[string]ModelPricing{
		// Sovereign Models (L2 — Swarm / Ollama)
		"qwen2.5-coder:7b": {0.0, 0.0, "swarm", true},
		"llama3.1:8b":      {0.0, 0.0, "swarm", true},
		"deepseek-r1:14b":  {0.0, 0.0, "swarm", true},
		"phi-3-mini":       {0.0, 0.0, "swarm", true},
		"gemma-2b":         {0.0, 0.0, "swarm", true},
		"mistral:7b":       {0.0, 0.0, "swarm", true},
		// Phantom Nodes (L2.5/L2.7 — free-tier, sovereign)
		"meta-llama/Meta-Llama-3-8B-Instruct": {0.0, 0.0, "phantom_hf", true},
		"Qwen/Qwen2.5-72B-Instruct":           {0.0, 0.0, "phantom_hf", true},
		"llama-3.3-70b-versatile":             {0.0, 0.0, "phantom_groq", true},
		// Commercial Fallback (L4 — LiteLLM → OpenAI/Anthropic/etc.)
		"deepseek-r1":       {0.0, 0.0, "litellm", false},
		"gpt-4o":            {0.00125, 0.00375, "litellm", false},
		"claude-3-5-sonnet": {0.0015, 0.0045, "litellm", false},
		"gemini-2.0-flash":  {0.00005, 0.00015, "litellm", false},
	}

	// Start phantom health monitor
	go router.phantomHealthLoop()

	phantomStatus := []string{}
	if router.hfToken != "" {
		phantomStatus = append(phantomStatus, "HF=✓")
	}
	if router.groqKey != "" {
		phantomStatus = append(phantomStatus, "Groq=✓")
	}
	if len(phantomStatus) == 0 {
		phantomStatus = append(phantomStatus, "none (set HF_TOKEN / GROQ_API_KEY)")
	}

	log.Printf("🔀 [OmegaRouter] Sovereign-First routing active (L1→Cache L2→Swarm L2.5→HF L2.7→Groq L3→Cocoon L4→Commercial) phantom=[%s]",
		strings.Join(phantomStatus, ", "))
	return router
}

// Route implements the Sovereign-First routing matrix.
//
//	L1: Experience Vault → instant cache hit (free)
//	L2: GSTD Swarm (Ollama) → sovereign open-source models (free, sovereign)
//	L3: Cocoon TEE → decentralized GPU with TEE verification (paid TON, sovereign)
//	L4: LiteLLM → commercial API fallback (paid, NOT sovereign)
func (r *SmartRouter) Route(ctx context.Context, req *OmegaChatRequest) (*RoutingDecision, error) {
	start := time.Now()
	txID := "omega-" + uuid.New().String()[:8]
	msgsSimple := extractSimpleMessages(req.Messages)
	atomic.AddInt64(&r.sovereignty.TotalRequests, 1)

	// ─── L1: Experience Vault (cache) ───────────────────────────────────
	if r.vault != nil && !req.Stream {
		if lookup, _ := r.vault.Lookup(ctx, msgsSimple, req.Model); lookup.Hit {
			atomic.AddInt64(&r.sovereignty.SovereignCache, 1)
			return &RoutingDecision{
				Tier: 1, TierName: "Experience Vault", Model: req.Model, ActualModel: "cache",
				Provider: "cache", Response: lookup.Response, LatencyMs: time.Since(start).Milliseconds(),
				CacheHit: true, TransactionID: txID, Sovereign: true,
			}, nil
		}
	}

	// Resolve model
	resolvedModel := req.Model
	if req.Model == "omega-auto" || req.Model == "auto" || req.Model == "" {
		resolvedModel = r.analyzeIntelligenceNeed(req.Messages)
	}

	// ─── L2: GSTD Swarm (Ollama — sovereign) ───────────────────────────
	// 80% of requests should be handled here. Only fall to L4 if Swarm fails.
	if isSovereignCapable(resolvedModel) || isSovereignCapable(req.Model) {
		ollamaModel := resolveSovereignModel(resolvedModel)

		if req.Stream {
			resp, err := r.proxyOllamaStream(ctx, req, ollamaModel)
			if err == nil {
				atomic.AddInt64(&r.sovereignty.SovereignSwarm, 1)
				return &RoutingDecision{
					Tier: 2, TierName: "Sovereign Swarm", Model: req.Model, ActualModel: ollamaModel,
					Provider: "swarm", StreamResponse: resp, TransactionID: txID, Sovereign: true,
				}, nil
			}
			log.Printf("[OmegaRouter] L2 Swarm stream failed (%v), falling to L4", err)
		} else {
			respStr, promptT, compT, err := r.callOllama(ctx, req, ollamaModel)
			if err == nil && respStr != "" {
				atomic.AddInt64(&r.sovereignty.SovereignSwarm, 1)
				decision := &RoutingDecision{
					Tier: 2, TierName: "Sovereign Swarm", Model: req.Model, ActualModel: ollamaModel,
					Provider: "swarm", Response: respStr, PromptTokens: promptT, CompletionTokens: compT,
					TotalTokens: promptT + compT, CostGSTD: 0.01, LatencyMs: time.Since(start).Milliseconds(),
					TransactionID: txID, Sovereign: true,
				}
				if r.vault != nil {
					go r.vault.Store(context.Background(), msgsSimple, ollamaModel, respStr, 0.90)
				}
				return decision, nil
			}
			log.Printf("[OmegaRouter] L2 Swarm sync failed (%v), falling to L4", err)
		}
	}

	// ─── L2.5: HuggingFace Serverless (Phantom Node — free tier) ────────
	if r.phantomHF.IsAvailable() && !req.Stream {
		hfModel := r.resolveHFModel(resolvedModel)
		if hfModel != "" {
			respStr, promptT, compT, err := r.callHuggingFace(ctx, req, hfModel)
			if err == nil && respStr != "" {
				atomic.AddInt64(&r.sovereignty.SovereignPhantomHF, 1)
				decision := &RoutingDecision{
					Tier: 2, TierName: "Phantom HuggingFace", Model: req.Model, ActualModel: hfModel,
					Provider: "phantom_hf", Response: respStr, PromptTokens: promptT, CompletionTokens: compT,
					TotalTokens: promptT + compT, CostGSTD: 0.005, LatencyMs: time.Since(start).Milliseconds(),
					TransactionID: txID, Sovereign: true,
				}
				if r.vault != nil {
					go r.vault.Store(context.Background(), msgsSimple, hfModel, respStr, 0.88)
				}
				return decision, nil
			}
			log.Printf("[OmegaRouter] L2.5 HuggingFace failed (%v), continuing to L2.7/L3/L4", err)
		}
	}

	// ─── L2.7: Groq Speed Lane (Phantom Node — ultra-fast for short queries) ──
	if r.phantomGroq.IsAvailable() && r.isShortQuery(req) && !req.Stream {
		respStr, promptT, compT, err := r.callGroq(ctx, req, "llama-3.3-70b-versatile")
		if err == nil && respStr != "" {
			atomic.AddInt64(&r.sovereignty.SovereignPhantomGQ, 1)
			decision := &RoutingDecision{
				Tier: 2, TierName: "Phantom Groq", Model: req.Model, ActualModel: "llama-3.3-70b-versatile",
				Provider: "phantom_groq", Response: respStr, PromptTokens: promptT, CompletionTokens: compT,
				TotalTokens: promptT + compT, CostGSTD: 0.003, LatencyMs: time.Since(start).Milliseconds(),
				TransactionID: txID, Sovereign: true,
			}
			if r.vault != nil {
				go r.vault.Store(context.Background(), msgsSimple, "groq-llama3.3", respStr, 0.92)
			}
			return decision, nil
		}
		log.Printf("[OmegaRouter] L2.7 Groq failed (%v), continuing to L3/L4", err)
	}

	// ─── L3: Cocoon TEE (if model explicitly requests it) ───────────────
	if IsCocoonModel(resolvedModel) || IsCocoonModel(req.Model) {
		atomic.AddInt64(&r.sovereignty.SovereignCocoon, 1)
		// Cocoon is handled by CocoonBridgeService in GatewayHandler, not here.
		// Return a marker decision that tells GatewayHandler to redirect.
		return &RoutingDecision{
			Tier: 3, TierName: "Cocoon TEE", Model: req.Model, ActualModel: resolvedModel,
			Provider: "cocoon", TransactionID: txID, CostGSTD: CocoonCostGSTD(resolvedModel),
			Sovereign: true,
		}, nil
	}

	// ─── L4: Commercial API Fallback (LiteLLM → OpenAI/Anthropic) ──────
	// This is the LAST resort. Every request here lowers Sovereignty Index.
	atomic.AddInt64(&r.sovereignty.FallbackCommerce, 1)
	log.Printf("[OmegaRouter] ⚠ L4 Commercial fallback for model=%s", resolvedModel)

	if req.Stream {
		resp, err := r.proxyLiteLLM(ctx, req, resolvedModel)
		if err != nil {
			return nil, err
		}
		return &RoutingDecision{
			Tier: 4, TierName: "Commercial Fallback", Model: req.Model, ActualModel: resolvedModel,
			Provider: "litellm", StreamResponse: resp, TransactionID: txID, Sovereign: false,
		}, nil
	}

	respStr, promptT, compT, err := r.callLiteLLM(ctx, req, resolvedModel)
	if err != nil {
		return nil, err
	}

	gstdPrice := 0.02
	if r.oracle != nil {
		gstdPrice = r.oracle.GetPrice()
	}
	pricing := r.pricingTable[resolvedModel]
	costGSTD := (float64(promptT)*pricing.InputUSDPer1K/1000 + float64(compT)*pricing.OutputUSDPer1K/1000) * 1.30 / gstdPrice

	decision := &RoutingDecision{
		Tier: 4, TierName: "Commercial Fallback", Model: req.Model, ActualModel: resolvedModel,
		Provider: "litellm", Response: respStr, PromptTokens: promptT, CompletionTokens: compT,
		TotalTokens: promptT + compT, CostGSTD: costGSTD, LatencyMs: time.Since(start).Milliseconds(),
		TransactionID: txID, Sovereign: false,
	}

	if r.vault != nil {
		go r.vault.Store(context.Background(), msgsSimple, resolvedModel, respStr, 0.95)
	}
	return decision, nil
}

// analyzeIntelligenceNeed selects the best SOVEREIGN model for auto-routing.
// The default is now a sovereign model, not a commercial one.
func (r *SmartRouter) analyzeIntelligenceNeed(messages []map[string]interface{}) string {
	var text string
	for _, m := range messages {
		if c, ok := m["content"].(string); ok {
			text += strings.ToLower(c) + " "
		}
	}
	// Code/technical → sovereign coder
	if strings.Contains(text, "func") || strings.Contains(text, "code") || strings.Contains(text, "программ") {
		return "qwen2.5-coder:7b"
	}
	// Math/reasoning → sovereign reasoner
	if strings.Contains(text, "math") || strings.Contains(text, "think") || strings.Contains(text, "prov") || strings.Contains(text, "доказ") {
		return "deepseek-r1:14b"
	}
	// Default → sovereign general
	return "llama3.1:8b"
}

// GetAvailableModels returns models grouped by sovereignty level.
func (r *SmartRouter) GetAvailableModels() map[string]interface{} {
	gstdPrice := 0.02
	if r.oracle != nil {
		gstdPrice = r.oracle.GetPrice()
	}
	res := make(map[string]interface{})
	for model, pricing := range r.pricingTable {
		tier := "L4"
		if pricing.SwarmCapable {
			tier = "L2"
		}
		res[model] = map[string]interface{}{
			"id": model, "provider": pricing.Provider, "swarm_capable": pricing.SwarmCapable,
			"tier": tier, "sovereign": pricing.SwarmCapable,
			"input_per_1k": pricing.InputUSDPer1K / gstdPrice, "output_per_1k": pricing.OutputUSDPer1K / gstdPrice,
		}
	}
	res["omega-auto"] = map[string]interface{}{"id": "omega-auto", "provider": "swarm", "swarm_capable": true, "sovereign": true, "tier": "L2", "description": "Sovereign Neural Router"}
	return res
}

// GetSovereigntyMetrics returns the current sovereignty statistics.
func (r *SmartRouter) GetSovereigntyMetrics() map[string]interface{} {
	return map[string]interface{}{
		"sovereignty_index":      r.sovereignty.SovereigntyIndex(),
		"total_requests":         atomic.LoadInt64(&r.sovereignty.TotalRequests),
		"sovereign_swarm":        atomic.LoadInt64(&r.sovereignty.SovereignSwarm),
		"sovereign_phantom_hf":   atomic.LoadInt64(&r.sovereignty.SovereignPhantomHF),
		"sovereign_phantom_groq": atomic.LoadInt64(&r.sovereignty.SovereignPhantomGQ),
		"sovereign_cocoon":       atomic.LoadInt64(&r.sovereignty.SovereignCocoon),
		"sovereign_cache":        atomic.LoadInt64(&r.sovereignty.SovereignCache),
		"fallback_commercial":    atomic.LoadInt64(&r.sovereignty.FallbackCommerce),
		"phantom_hf_available":   r.phantomHF.IsAvailable(),
		"phantom_groq_available": r.phantomGroq.IsAvailable(),
		"target":                 99.9,
	}
}

// ─── L2 Ollama (Sovereign Swarm) ────────────────────────────────────────────

func (r *SmartRouter) proxyOllamaStream(ctx context.Context, req *OmegaChatRequest, model string) (*http.Response, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"model": model, "messages": req.Messages, "stream": true,
		"temperature": req.Temperature, "max_tokens": req.MaxTokens,
	})
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", r.ollamaURL+"/v1/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	return r.ollamaClient.Do(httpReq)
}

func (r *SmartRouter) callOllama(ctx context.Context, req *OmegaChatRequest, model string) (string, int, int, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"model": model, "messages": req.Messages,
		"temperature": req.Temperature, "max_tokens": req.MaxTokens,
	})
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", r.ollamaURL+"/v1/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := r.ollamaClient.Do(httpReq)
	if err != nil {
		return "", 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", 0, 0, fmt.Errorf("ollama status %d", resp.StatusCode)
	}
	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, result.Usage.PromptTokens, result.Usage.CompletionTokens, nil
	}
	return "", 0, 0, fmt.Errorf("empty ollama response")
}

// ─── L4 LiteLLM (Commercial Fallback) ──────────────────────────────────────

func (r *SmartRouter) proxyLiteLLM(ctx context.Context, req *OmegaChatRequest, model string) (*http.Response, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"model": model, "messages": req.Messages, "stream": true, "temperature": req.Temperature, "max_tokens": req.MaxTokens,
	})
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", r.litellmURL+"/v1/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+r.litellmKey)
	httpReq.Header.Set("Content-Type", "application/json")
	return r.litellmClient.Do(httpReq)
}

func (r *SmartRouter) callLiteLLM(ctx context.Context, req *OmegaChatRequest, model string) (string, int, int, error) {
	body, _ := json.Marshal(map[string]interface{}{"model": model, "messages": req.Messages, "temperature": req.Temperature, "max_tokens": req.MaxTokens})
	httpReq, _ := http.NewRequestWithContext(ctx, "POST", r.litellmURL+"/v1/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+r.litellmKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := r.litellmClient.Do(httpReq)
	if err != nil {
		return "", 0, 0, err
	}
	defer resp.Body.Close()
	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Choices) > 0 {
		return result.Choices[0].Message.Content, result.Usage.PromptTokens, result.Usage.CompletionTokens, nil
	}
	return "", 0, 0, fmt.Errorf("empty response")
}

// ─── L2.5 HuggingFace Serverless (Phantom Node) ────────────────────────────

// resolveHFModel maps internal model names to HuggingFace model IDs.
func (r *SmartRouter) resolveHFModel(model string) string {
	lower := strings.ToLower(model)
	// Direct HF model IDs pass through
	if strings.Contains(lower, "/") {
		return model
	}
	// Map sovereign models to HF equivalents
	switch {
	case strings.Contains(lower, "llama") || strings.Contains(lower, "pro") || lower == "llama3.1:8b":
		return "meta-llama/Meta-Llama-3-8B-Instruct"
	case strings.Contains(lower, "qwen") || strings.Contains(lower, "flash") || strings.Contains(lower, "code"):
		return "Qwen/Qwen2.5-72B-Instruct"
	default:
		return "meta-llama/Meta-Llama-3-8B-Instruct"
	}
}

func (r *SmartRouter) callHuggingFace(ctx context.Context, req *OmegaChatRequest, model string) (string, int, int, error) {
	if r.hfToken == "" {
		return "", 0, 0, fmt.Errorf("HF_TOKEN not configured")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    req.Messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
		"stream":      false,
	})
	httpReq, _ := http.NewRequestWithContext(ctx, "POST",
		"https://router.huggingface.co/v1/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+r.hfToken)
	httpReq.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := r.hfClient.Do(httpReq)
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		r.phantomHF.RecordFailure(false)
		return "", 0, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		r.phantomHF.RecordFailure(true)
		return "", 0, 0, fmt.Errorf("HF rate limited (429)")
	}
	if resp.StatusCode != 200 {
		r.phantomHF.RecordFailure(false)
		return "", 0, 0, fmt.Errorf("HF status %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Choices) > 0 && result.Choices[0].Message.Content != "" {
		r.phantomHF.RecordSuccess(latencyMs)
		log.Printf("[Phantom] HuggingFace ✓ model=%s latency=%dms tokens=%d", model, latencyMs, result.Usage.CompletionTokens)
		return result.Choices[0].Message.Content, result.Usage.PromptTokens, result.Usage.CompletionTokens, nil
	}
	r.phantomHF.RecordFailure(false)
	return "", 0, 0, fmt.Errorf("empty HF response")
}

// ─── L2.7 Groq Speed Lane (Phantom Node) ───────────────────────────────────

// isShortQuery returns true if the prompt is suitable for the Groq speed lane.
// Criteria: total content < 200 chars, not code-heavy, not deep reasoning.
func (r *SmartRouter) isShortQuery(req *OmegaChatRequest) bool {
	totalLen := 0
	for _, m := range req.Messages {
		if c, ok := m["content"].(string); ok {
			totalLen += len(c)
		}
	}
	// Too long for speed lane
	if totalLen > 500 {
		return false
	}
	// Explicit model requests bypass the classifier
	model := strings.ToLower(req.Model)
	if strings.Contains(model, "ultra") || strings.Contains(model, "deep") || strings.Contains(model, "reason") {
		return false
	}
	return true
}

func (r *SmartRouter) callGroq(ctx context.Context, req *OmegaChatRequest, model string) (string, int, int, error) {
	if r.groqKey == "" {
		return "", 0, 0, fmt.Errorf("GROQ_API_KEY not configured")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    req.Messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
		"stream":      false,
	})
	httpReq, _ := http.NewRequestWithContext(ctx, "POST",
		"https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Authorization", "Bearer "+r.groqKey)
	httpReq.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := r.groqClient.Do(httpReq)
	latencyMs := time.Since(start).Milliseconds()
	if err != nil {
		r.phantomGroq.RecordFailure(false)
		return "", 0, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		r.phantomGroq.RecordFailure(true)
		return "", 0, 0, fmt.Errorf("Groq rate limited (429)")
	}
	if resp.StatusCode != 200 {
		r.phantomGroq.RecordFailure(false)
		return "", 0, 0, fmt.Errorf("Groq status %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Choices) > 0 && result.Choices[0].Message.Content != "" {
		r.phantomGroq.RecordSuccess(latencyMs)
		log.Printf("[Phantom] Groq ⚡ model=%s latency=%dms tokens=%d", model, latencyMs, result.Usage.CompletionTokens)
		return result.Choices[0].Message.Content, result.Usage.PromptTokens, result.Usage.CompletionTokens, nil
	}
	r.phantomGroq.RecordFailure(false)
	return "", 0, 0, fmt.Errorf("empty Groq response")
}

// ─── Phantom Health Monitor ────────────────────────────────────────────────

func (r *SmartRouter) phantomHealthLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		// Ping HuggingFace
		if r.hfToken != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			req, _ := http.NewRequestWithContext(ctx, "GET", "https://router.huggingface.co/status", nil)
			req.Header.Set("Authorization", "Bearer "+r.hfToken)
			start := time.Now()
			resp, err := r.hfClient.Do(req)
			cancel()
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode < 500 {
					r.phantomHF.RecordSuccess(time.Since(start).Milliseconds())
				} else {
					r.phantomHF.RecordFailure(false)
				}
			}
		}

		// Ping Groq
		if r.groqKey != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.groq.com/openai/v1/models", nil)
			req.Header.Set("Authorization", "Bearer "+r.groqKey)
			start := time.Now()
			resp, err := r.groqClient.Do(req)
			cancel()
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode < 500 {
					r.phantomGroq.RecordSuccess(time.Since(start).Milliseconds())
				} else {
					r.phantomGroq.RecordFailure(false)
				}
			}
		}
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

func extractSimpleMessages(messages []map[string]interface{}) []map[string]string {
	var res []map[string]string
	for _, m := range messages {
		r, _ := m["role"].(string)
		c, _ := m["content"].(string)
		res = append(res, map[string]string{"role": r, "content": c})
	}
	return res
}
