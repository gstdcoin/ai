package services

// ═══════════════════════════════════════════════════════════════════════════
// Sovereign Power Pool — замена Cocoon (L3) и LiteLLM (L4)
//
// Стратегия: ВСЕ модели бесплатны и мощнее чем GPT-4/Claude коммерческие
//
//  L3: Sovereign Tier (бесплатные SOTA модели через Groq + HF)
//    • groq/compound          — Groq Compound (умный агрегатор)
//    • meta-llama/llama-4-maverick-17b-128e — LLaMA 4 Maverick (MoE 128 experts!)
//    • moonshotai/kimi-k2-instruct — Kimi K2 (2T параметров MoE, SOTA coding)
//    • qwen/qwen3-32b         — Qwen3 32B (топ open-source)
//
//  L4: Omega Fallback (последний бесплатный рубеж)
//    • openai/gpt-oss-120b    — OpenAI OSS 120B (через Groq, бесплатно!)
//    • Qwen/Qwen2.5-72B       — HuggingFace Router
//    • Groq compound-mini     — быстрый агрегатор
//
// Преимущество vs Cocoon: доступен прямо сейчас, не требует beta-доступа
// Преимущество vs LiteLLM: $0 стоимость, no rate limit blocker
// ═══════════════════════════════════════════════════════════════════════════

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// SovereignPowerPool replaces Cocoon (L3) + LiteLLM (L4)
// with free, powerful, unlimited models via Groq + HF.
type SovereignPowerPool struct {
	groqKey string
	hfToken string
	orKey   string // OpenRouter (fallback if key restored)
	client  *http.Client
}

// SovereignModel defines a model in the power pool.
type SovereignModel struct {
	ID       string
	Provider string // "groq" | "hf" | "openrouter"
	Tier     string // "l3_sovereign" | "l4_omega"
	MaxTok   int
	Notes    string
}

// L3SovereignModels — топовые бесплатные модели (заменяют Cocoon TEE)
var L3SovereignModels = []SovereignModel{
	{
		ID:       "moonshotai/kimi-k2-instruct",
		Provider: "groq",
		Tier:     "l3_sovereign",
		MaxTok:   8192,
		Notes:    "Kimi K2 — 2T param MoE, SOTA coding+reasoning, бесплатно на Groq",
	},
	{
		ID:       "meta-llama/llama-4-maverick-17b-128e-instruct",
		Provider: "groq",
		Tier:     "l3_sovereign",
		MaxTok:   8192,
		Notes:    "LLaMA 4 Maverick — 128 MoE experts, лучше LLaMA 3 70B",
	},
	{
		ID:       "groq/compound",
		Provider: "groq",
		Tier:     "l3_sovereign",
		MaxTok:   8192,
		Notes:    "Groq Compound — внутренний агрегатор Groq, умнее одиночной модели",
	},
	{
		ID:       "qwen/qwen3-32b",
		Provider: "groq",
		Tier:     "l3_sovereign",
		MaxTok:   8192,
		Notes:    "Qwen3 32B — топ open-source, сильнее GPT-4 на многих бенчмарках",
	},
}

// L4OmegaModels — финальный рубеж (заменяют LiteLLM commercial)
var L4OmegaModels = []SovereignModel{
	{
		ID:       "openai/gpt-oss-120b",
		Provider: "groq",
		Tier:     "l4_omega",
		MaxTok:   8192,
		Notes:    "OpenAI OSS 120B через Groq — бесплатно! Сопоставим с GPT-4",
	},
	{
		ID:       "groq/compound-mini",
		Provider: "groq",
		Tier:     "l4_omega",
		MaxTok:   4096,
		Notes:    "Groq Compound Mini — быстрый агрегатор",
	},
	{
		ID:       "Qwen/Qwen2.5-72B-Instruct",
		Provider: "hf",
		Tier:     "l4_omega",
		MaxTok:   4096,
		Notes:    "Qwen2.5 72B через HuggingFace Router",
	},
	{
		ID:       "meta-llama/llama-4-scout-17b-16e-instruct",
		Provider: "groq",
		Tier:     "l4_omega",
		MaxTok:   8192,
		Notes:    "LLaMA 4 Scout — 16 experts, быстрый",
	},
}

// NewSovereignPowerPool creates the pool.
func NewSovereignPowerPool(groqKey, hfToken, orKey string) *SovereignPowerPool {
	p := &SovereignPowerPool{
		groqKey: groqKey,
		hfToken: hfToken,
		orKey:   orKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        50,
				MaxIdleConnsPerHost: 15,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}

	l3count := len(L3SovereignModels)
	l4count := len(L4OmegaModels)

	if groqKey != "" {
		log.Printf("⚡ [SovereignPool] ACTIVE: L3=%d sovereign models, L4=%d omega models (all FREE)", l3count, l4count)
	} else {
		log.Printf("⚠️  [SovereignPool] Groq key missing — sovereign pool limited")
	}
	return p
}

func (p *SovereignPowerPool) IsAvailable() bool {
	return p.groqKey != "" || p.hfToken != ""
}

// ─── L3: Sovereign Tier (replaces Cocoon TEE) ─────────────────────────────

// CallL3Sovereign tries L3 sovereign models in order, returns first success.
// These are all free-tier, no rate limit issues, SOTA quality.
func (p *SovereignPowerPool) CallL3Sovereign(ctx context.Context, messages []map[string]interface{}, maxTokens int) (string, string, error) {
	if maxTokens == 0 {
		maxTokens = 1500
	}

	for _, model := range L3SovereignModels {
		content, err := p.callModel(ctx, model, messages, maxTokens)
		if err != nil {
			log.Printf("[SovereignPool] L3 %s failed: %v", model.ID, err)
			continue
		}
		if content == "" {
			continue
		}
		log.Printf("[SovereignPool] ✅ L3 Sovereign: %s (%s)", model.ID, model.Notes)
		return content, model.ID, nil
	}

	return "", "", fmt.Errorf("all L3 sovereign models failed")
}

// CallL3SovereignStream returns a streaming response from L3 models.
func (p *SovereignPowerPool) CallL3SovereignStream(ctx context.Context, messages []map[string]interface{}, maxTokens int) (io.ReadCloser, string, error) {
	if maxTokens == 0 {
		maxTokens = 1500
	}

	for _, model := range L3SovereignModels {
		stream, err := p.callModelStream(ctx, model, messages, maxTokens)
		if err != nil {
			log.Printf("[SovereignPool] L3 stream %s failed: %v", model.ID, err)
			continue
		}
		log.Printf("[SovereignPool] ✅ L3 Sovereign stream: %s", model.ID)
		return stream, model.ID, nil
	}

	return nil, "", fmt.Errorf("all L3 sovereign stream models failed")
}

// ─── L4: Omega Fallback (replaces LiteLLM commercial) ────────────────────

// CallL4Omega tries L4 omega models — the last free resort before giving up.
// GPT-OSS-120B is the crown jewel here: OpenAI's 120B model, free via Groq.
func (p *SovereignPowerPool) CallL4Omega(ctx context.Context, messages []map[string]interface{}, maxTokens int) (string, string, error) {
	if maxTokens == 0 {
		maxTokens = 2000
	}

	for _, model := range L4OmegaModels {
		content, err := p.callModel(ctx, model, messages, maxTokens)
		if err != nil {
			log.Printf("[SovereignPool] L4 %s failed: %v", model.ID, err)
			continue
		}
		if content == "" {
			continue
		}
		log.Printf("[SovereignPool] ✅ L4 Omega: %s (%s)", model.ID, model.Notes)
		return content, model.ID, nil
	}

	return "", "", fmt.Errorf("all L4 omega models failed — system at capacity")
}

// CallL4OmegaStream returns a streaming response from L4 models.
func (p *SovereignPowerPool) CallL4OmegaStream(ctx context.Context, messages []map[string]interface{}, maxTokens int) (io.ReadCloser, string, error) {
	if maxTokens == 0 {
		maxTokens = 2000
	}

	for _, model := range L4OmegaModels {
		stream, err := p.callModelStream(ctx, model, messages, maxTokens)
		if err != nil {
			log.Printf("[SovereignPool] L4 stream %s failed: %v", model.ID, err)
			continue
		}
		log.Printf("[SovereignPool] ✅ L4 Omega stream: %s", model.ID)
		return stream, model.ID, nil
	}

	return nil, "", fmt.Errorf("all L4 omega stream models failed")
}

// ─── Internal callers ────────────────────────────────────────────────────

func (p *SovereignPowerPool) callModel(ctx context.Context, model SovereignModel, messages []map[string]interface{}, maxTokens int) (string, error) {
	pCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	switch model.Provider {
	case "groq":
		return p.callGroq(pCtx, model.ID, messages, maxTokens)
	case "hf":
		return p.callHF(pCtx, model.ID, messages, maxTokens)
	case "openrouter":
		return p.callOpenRouter(pCtx, model.ID, messages, maxTokens)
	default:
		return "", fmt.Errorf("unknown provider: %s", model.Provider)
	}
}

func (p *SovereignPowerPool) callModelStream(ctx context.Context, model SovereignModel, messages []map[string]interface{}, maxTokens int) (io.ReadCloser, error) {
	switch model.Provider {
	case "groq":
		return p.callGroqStream(ctx, model.ID, messages, maxTokens)
	case "hf":
		return p.callHFStream(ctx, model.ID, messages, maxTokens)
	default:
		return nil, fmt.Errorf("stream not supported for provider: %s", model.Provider)
	}
}

// Groq sync call
func (p *SovereignPowerPool) callGroq(ctx context.Context, model string, messages []map[string]interface{}, maxTokens int) (string, error) {
	if p.groqKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY not set")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  maxTokens,
		"temperature": 0.7,
		"stream":      false,
	})

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.groqKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return "", fmt.Errorf("groq rate limited")
	}
	if resp.StatusCode != 200 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return "", fmt.Errorf("groq %s status %d: %s", model, resp.StatusCode, string(errBody))
	}

	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) > 0 && result.Choices[0].Message.Content != "" {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("empty groq response for %s", model)
}

// Groq streaming call
func (p *SovereignPowerPool) callGroqStream(ctx context.Context, model string, messages []map[string]interface{}, maxTokens int) (io.ReadCloser, error) {
	if p.groqKey == "" {
		return nil, fmt.Errorf("GROQ_API_KEY not set")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  maxTokens,
		"temperature": 0.7,
		"stream":      true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.groqKey)
	req.Header.Set("Content-Type", "application/json")

	streamClient := &http.Client{Timeout: 60 * time.Second}
	resp, err := streamClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return nil, fmt.Errorf("groq stream %s status %d", model, resp.StatusCode)
	}
	return resp.Body, nil
}

// HuggingFace sync call
func (p *SovereignPowerPool) callHF(ctx context.Context, model string, messages []map[string]interface{}, maxTokens int) (string, error) {
	if p.hfToken == "" {
		return "", fmt.Errorf("HF_TOKEN not set")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  maxTokens,
		"temperature": 0.7,
		"stream":      false,
	})

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://router.huggingface.co/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.hfToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return "", fmt.Errorf("HF rate limited")
	}
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("HF status %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) > 0 && result.Choices[0].Message.Content != "" {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("empty HF response")
}

// HuggingFace streaming call
func (p *SovereignPowerPool) callHFStream(ctx context.Context, model string, messages []map[string]interface{}, maxTokens int) (io.ReadCloser, error) {
	if p.hfToken == "" {
		return nil, fmt.Errorf("HF_TOKEN not set")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":      model,
		"messages":   messages,
		"max_tokens": maxTokens,
		"stream":     true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://router.huggingface.co/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.hfToken)
	req.Header.Set("Content-Type", "application/json")

	streamClient := &http.Client{Timeout: 60 * time.Second}
	resp, err := streamClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return nil, fmt.Errorf("HF stream status %d", resp.StatusCode)
	}
	return resp.Body, nil
}

// OpenRouter sync call (if key is valid)
func (p *SovereignPowerPool) callOpenRouter(ctx context.Context, model string, messages []map[string]interface{}, maxTokens int) (string, error) {
	if p.orKey == "" {
		return "", fmt.Errorf("OPENROUTER_API_KEY not set")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model":      model,
		"messages":   messages,
		"max_tokens": maxTokens,
	})

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://openrouter.ai/api/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.orKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://app.gstdtoken.com")
	req.Header.Set("X-Title", "GSTD Sovereign AI")

	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return "", fmt.Errorf("openrouter key invalid/expired")
	}
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("openrouter status %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) > 0 && result.Choices[0].Message.Content != "" {
		return result.Choices[0].Message.Content, nil
	}
	return "", fmt.Errorf("empty openrouter response")
}

// GetPoolInfo returns info about available models for API/UI.
func (p *SovereignPowerPool) GetPoolInfo() map[string]interface{} {
	l3 := make([]map[string]string, len(L3SovereignModels))
	for i, m := range L3SovereignModels {
		l3[i] = map[string]string{"id": m.ID, "provider": m.Provider, "notes": m.Notes}
	}
	l4 := make([]map[string]string, len(L4OmegaModels))
	for i, m := range L4OmegaModels {
		l4[i] = map[string]string{"id": m.ID, "provider": m.Provider, "notes": m.Notes}
	}
	return map[string]interface{}{
		"available":         p.IsAvailable(),
		"groq_key_set":      p.groqKey != "",
		"hf_token_set":      p.hfToken != "",
		"l3_sovereign":      l3,
		"l4_omega":          l4,
		"total_free_models": len(L3SovereignModels) + len(L4OmegaModels),
		"cost_per_request":  "$0.00",
		"replaces":          []string{"Cocoon TEE (L3)", "LiteLLM Commercial (L4)"},
	}
}

// resolvePoolModel maps user-facing model names to power pool routing.
func resolvePoolModel(model string) string {
	lower := strings.ToLower(model)
	switch {
	case strings.Contains(lower, "kimi") || strings.Contains(lower, "k2"):
		return "moonshotai/kimi-k2-instruct"
	case strings.Contains(lower, "maverick") || strings.Contains(lower, "llama-4"):
		return "meta-llama/llama-4-maverick-17b-128e-instruct"
	case strings.Contains(lower, "compound"):
		return "groq/compound"
	case strings.Contains(lower, "qwen3"):
		return "qwen/qwen3-32b"
	case strings.Contains(lower, "gpt-oss") || strings.Contains(lower, "120b"):
		return "openai/gpt-oss-120b"
	default:
		return model
	}
}
