package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SmartRouter manages the Tri-Tier routing logic
type SmartRouter struct {
	vault         *ExperienceVault
	oracle        *GSTDOracleService
	ollamaURL     string
	ollamaClient  *http.Client
	litellmURL    string
	litellmKey    string
	litellmClient *http.Client
	pricingTable  map[string]ModelPricing
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
}

type OmegaChatRequest struct {
	Model       string                   `json:"model"`
	Messages    []map[string]interface{} `json:"messages"`
	Temperature float64                  `json:"temperature,omitempty"`
	MaxTokens   int                      `json:"max_tokens,omitempty"`
	Stream      bool                     `json:"stream"`
}

func NewSmartRouter(vault *ExperienceVault, oracle *GSTDOracleService) *SmartRouter {
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
	}
	router := &SmartRouter{
		vault:         vault,
		oracle:        oracle,
		ollamaClient:  &http.Client{Timeout: 5 * time.Second, Transport: transport},
		litellmURL:    os.Getenv("LITELLM_URL"),
		litellmKey:    os.Getenv("LITELLM_MASTER_KEY"),
		litellmClient: &http.Client{Timeout: 300 * time.Second, Transport: transport},
	}
	if router.litellmURL == "" {
		router.litellmURL = "http://gstd_litellm:4000"
	}

	router.pricingTable = map[string]ModelPricing{
		"qwen2.5-coder:7b":  {0.00001, 0.00002, "swarm", true},
		"llama3.1:8b":       {0.00001, 0.00002, "swarm", true},
		"deepseek-r1":       {0.0, 0.0, "litellm", false},
		"gpt-4o":            {0.00125, 0.00375, "litellm", false},
		"claude-3-5-sonnet": {0.0015, 0.0045, "litellm", false},
		"gemini-2.0-flash":  {0.00005, 0.00015, "litellm", false},
	}
	return router
}

func (r *SmartRouter) Route(ctx context.Context, req *OmegaChatRequest) (*RoutingDecision, error) {
	start := time.Now()
	txID := "omega-" + uuid.New().String()[:8]
	msgsSimple := extractSimpleMessages(req.Messages)

	// L1: Vault (always sync)
	if r.vault != nil && !req.Stream {
		if lookup, _ := r.vault.Lookup(ctx, msgsSimple, req.Model); lookup.Hit {
			return &RoutingDecision{
				Tier: 1, TierName: "Experience Vault", Model: req.Model, ActualModel: "cache",
				Provider: "cache", Response: lookup.Response, LatencyMs: time.Since(start).Milliseconds(),
				CacheHit: true, TransactionID: txID,
			}, nil
		}
	}

	resolvedModel := req.Model
	if req.Model == "omega-auto" || req.Model == "auto" || req.Model == "" {
		resolvedModel = r.analyzeIntelligenceNeed(req.Messages)
	}

	// L3 Proxy Execution
	if req.Stream {
		resp, err := r.proxyLiteLLM(ctx, req, resolvedModel)
		if err != nil {
			return nil, err
		}
		return &RoutingDecision{
			Tier: 3, TierName: "SOTA Proxy (Stream)", Model: req.Model, ActualModel: resolvedModel,
			Provider: "litellm", StreamResponse: resp, TransactionID: txID,
		}, nil
	}

	// Sync Execution
	respStr, promptT, compT, err := r.callLiteLLM(ctx, req, resolvedModel)
	if err != nil {
		return nil, err
	}

	gstdPrice := r.oracle.GetPrice()
	pricing := r.pricingTable[resolvedModel]
	costGSTD := (float64(promptT)*pricing.InputUSDPer1K/1000 + float64(compT)*pricing.OutputUSDPer1K/1000) * 1.30 / gstdPrice

	decision := &RoutingDecision{
		Tier: 3, TierName: "SOTA Proxy", Model: req.Model, ActualModel: resolvedModel,
		Provider: "litellm", Response: respStr, PromptTokens: promptT, CompletionTokens: compT,
		TotalTokens: promptT + compT, CostGSTD: costGSTD, LatencyMs: time.Since(start).Milliseconds(),
		TransactionID: txID,
	}

	if r.vault != nil {
		go r.vault.Store(context.Background(), msgsSimple, resolvedModel, respStr, 0.95)
	}
	return decision, nil
}

func (r *SmartRouter) analyzeIntelligenceNeed(messages []map[string]interface{}) string {
	var text string
	for _, m := range messages {
		if c, ok := m["content"].(string); ok {
			text += strings.ToLower(c) + " "
		}
	}
	if strings.Contains(text, "func") || strings.Contains(text, "code") {
		return "claude-3-5-sonnet"
	}
	if strings.Contains(text, "math") || strings.Contains(text, "think") {
		return "deepseek-r1"
	}
	return "gpt-4o"
}

func (r *SmartRouter) GetAvailableModels() map[string]interface{} {
	gstdPrice := r.oracle.GetPrice()
	res := make(map[string]interface{})
	for model, pricing := range r.pricingTable {
		res[model] = map[string]interface{}{
			"id": model, "provider": pricing.Provider, "swarm_capable": pricing.SwarmCapable,
			"input_per_1k": pricing.InputUSDPer1K / gstdPrice, "output_per_1k": pricing.OutputUSDPer1K / gstdPrice,
		}
	}
	res["omega-auto"] = map[string]interface{}{"id": "omega-auto", "provider": "platform", "swarm_capable": true, "description": "Neural Router"}
	return res
}

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

func extractSimpleMessages(messages []map[string]interface{}) []map[string]string {
	var res []map[string]string
	for _, m := range messages {
		r, _ := m["role"].(string)
		c, _ := m["content"].(string)
		res = append(res, map[string]string{"role": r, "content": c})
	}
	return res
}
