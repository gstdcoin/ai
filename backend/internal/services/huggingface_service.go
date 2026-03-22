package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// HuggingFaceService provides AI capabilities using HuggingFace Inference API.
// Used for: embeddings, zero-shot classification, toxicity detection, sentiment analysis.
// This replaces regex-based approaches with ML-powered classification.
type HuggingFaceService struct {
	apiKey  string
	baseURL string
	client  *http.Client
	cache   sync.Map // Simple in-memory cache for embeddings
	enabled bool
}

// EmbeddingResult from the sentence-transformers model
type EmbeddingResult struct {
	Vector    []float64 `json:"vector"`
	Model     string    `json:"model"`
	LatencyMs int64     `json:"latency_ms"`
}

// ClassificationResult from zero-shot or toxicity classifier
type ClassificationResult struct {
	Labels    []string  `json:"labels"`
	Scores    []float64 `json:"scores"`
	TopLabel  string    `json:"top_label"`
	TopScore  float64   `json:"top_score"`
	Model     string    `json:"model"`
	LatencyMs int64     `json:"latency_ms"`
}

// SentimentResult from sentiment analysis
type SentimentResult struct {
	Label     string  `json:"label"` // positive, negative, neutral
	Score     float64 `json:"score"`
	Stars     int     `json:"stars"` // 1-5 star rating
	LatencyMs int64   `json:"latency_ms"`
}

// HuggingFace model IDs
const (
	HFModelEmbedding = "sentence-transformers/all-MiniLM-L6-v2"
	HFModelZeroShot  = "facebook/bart-large-mnli"
	HFModelToxicity  = "unitary/toxic-bert"
	HFModelSentiment = "nlptown/bert-base-multilingual-uncased-sentiment"
	HFModelSummarize = "facebook/bart-large-cnn"
	HFModelTranslate = "Helsinki-NLP/opus-mt-ru-en" // Example: Russian→English
)

func NewHuggingFaceService() *HuggingFaceService {
	apiKey := os.Getenv("HUGGINGFACE_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("HF_TOKEN")
	}

	svc := &HuggingFaceService{
		apiKey:  apiKey,
		baseURL: "https://api-inference.huggingface.co/models/",
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		enabled: apiKey != "",
	}

	if svc.enabled {
		log.Printf("🤗 [HuggingFace] Service enabled (API key: %s...)", apiKey[:min(8, len(apiKey))])
	} else {
		log.Printf("🤗 [HuggingFace] Service disabled (no HUGGINGFACE_API_KEY or HF_TOKEN)")
	}

	return svc
}

// IsEnabled returns whether the HF service is available
func (h *HuggingFaceService) IsEnabled() bool {
	return h.enabled
}

// ─── EMBEDDINGS ─────────────────────────────────────────────────────
// Generate vector embeddings for semantic search in Knowledge Base.
// Uses sentence-transformers/all-MiniLM-L6-v2 (384 dimensions, fast).
// This enables semantic similarity search instead of keyword matching.

func (h *HuggingFaceService) GetEmbedding(ctx context.Context, text string) (*EmbeddingResult, error) {
	if !h.enabled {
		return nil, fmt.Errorf("HuggingFace service not enabled")
	}

	// Check cache
	if cached, ok := h.cache.Load("emb:" + text[:min(100, len(text))]); ok {
		if result, ok := cached.(*EmbeddingResult); ok {
			return result, nil
		}
	}

	start := time.Now()

	payload := map[string]interface{}{
		"inputs": text,
		"options": map[string]bool{
			"wait_for_model": true,
		},
	}

	body, err := h.callAPI(ctx, HFModelEmbedding, payload)
	if err != nil {
		return nil, fmt.Errorf("embedding API error: %w", err)
	}

	// Parse embedding vector
	var vector []float64
	if err := json.Unmarshal(body, &vector); err != nil {
		// Sometimes returns nested array
		var nested [][]float64
		if err2 := json.Unmarshal(body, &nested); err2 != nil {
			return nil, fmt.Errorf("parse embedding: %w (body: %s)", err, string(body[:min(200, len(body))]))
		}
		if len(nested) > 0 {
			vector = nested[0]
		}
	}

	result := &EmbeddingResult{
		Vector:    vector,
		Model:     HFModelEmbedding,
		LatencyMs: time.Since(start).Milliseconds(),
	}

	// Cache the result
	h.cache.Store("emb:"+text[:min(100, len(text))], result)

	return result, nil
}

// GetBatchEmbeddings generates embeddings for multiple texts at once
func (h *HuggingFaceService) GetBatchEmbeddings(ctx context.Context, texts []string) ([][]float64, error) {
	if !h.enabled {
		return nil, fmt.Errorf("HuggingFace service not enabled")
	}

	payload := map[string]interface{}{
		"inputs": texts,
		"options": map[string]bool{
			"wait_for_model": true,
		},
	}

	body, err := h.callAPI(ctx, HFModelEmbedding, payload)
	if err != nil {
		return nil, err
	}

	var vectors [][]float64
	if err := json.Unmarshal(body, &vectors); err != nil {
		return nil, fmt.Errorf("parse batch embeddings: %w", err)
	}

	return vectors, nil
}

// CosineSimilarity calculates similarity between two embedding vectors
func CosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dotProduct, normA, normB float64
	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dotProduct / (math.Sqrt(normA) * math.Sqrt(normB))
}

// ─── ZERO-SHOT CLASSIFICATION ───────────────────────────────────────
// Classify text into categories without training. Uses facebook/bart-large-mnli.
// This replaces regex-based skill detection with ML-based intent classification.

func (h *HuggingFaceService) ClassifyZeroShot(ctx context.Context, text string, candidateLabels []string) (*ClassificationResult, error) {
	if !h.enabled {
		return nil, fmt.Errorf("HuggingFace service not enabled")
	}

	start := time.Now()

	payload := map[string]interface{}{
		"inputs": text,
		"parameters": map[string]interface{}{
			"candidate_labels": candidateLabels,
			"multi_label":      false,
		},
	}

	body, err := h.callAPI(ctx, HFModelZeroShot, payload)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Labels []string  `json:"labels"`
		Scores []float64 `json:"scores"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("parse zero-shot: %w", err)
	}

	result := &ClassificationResult{
		Labels:    resp.Labels,
		Scores:    resp.Scores,
		Model:     HFModelZeroShot,
		LatencyMs: time.Since(start).Milliseconds(),
	}
	if len(resp.Labels) > 0 {
		result.TopLabel = resp.Labels[0]
		result.TopScore = resp.Scores[0]
	}

	return result, nil
}

// ClassifyIntent classifies user intent into GSTD-specific categories.
// Used for smart routing: which skill/model to activate.
func (h *HuggingFaceService) ClassifyIntent(ctx context.Context, userMessage string) (*ClassificationResult, error) {
	gstdIntents := []string{
		"coding and programming",
		"mathematics and calculations",
		"cryptocurrency and blockchain",
		"translation and language",
		"creative writing and content",
		"research and analysis",
		"image generation",
		"general knowledge question",
		"GSTD platform help",
		"DeFi and trading",
	}
	return h.ClassifyZeroShot(ctx, userMessage, gstdIntents)
}

// ─── TOXICITY DETECTION ─────────────────────────────────────────────
// ML-based content moderation using unitary/toxic-bert.
// Replaces LayerSLM classification with a purpose-trained toxicity model.

func (h *HuggingFaceService) DetectToxicity(ctx context.Context, text string) (float64, []string, error) {
	if !h.enabled {
		return 0, nil, fmt.Errorf("HuggingFace service not enabled")
	}

	start := time.Now()

	payload := map[string]interface{}{
		"inputs": text[:min(512, len(text))], // Truncate for efficiency
		"options": map[string]bool{
			"wait_for_model": true,
		},
	}

	body, err := h.callAPI(ctx, HFModelToxicity, payload)
	if err != nil {
		return 0, nil, err
	}

	// toxic-bert returns [[{label, score}, ...]]
	var results [][]struct {
		Label string  `json:"label"`
		Score float64 `json:"score"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		return 0, nil, fmt.Errorf("parse toxicity: %w", err)
	}

	maxScore := 0.0
	var toxicLabels []string
	if len(results) > 0 {
		for _, r := range results[0] {
			if r.Label == "toxic" && r.Score > 0.5 {
				maxScore = r.Score
				toxicLabels = append(toxicLabels, fmt.Sprintf("%s (%.2f)", r.Label, r.Score))
			}
		}
	}

	log.Printf("🤗 [Toxicity] Score: %.3f (%dms)", maxScore, time.Since(start).Milliseconds())
	return maxScore, toxicLabels, nil
}

// ─── SENTIMENT ANALYSIS ─────────────────────────────────────────────
// Analyze user sentiment to adapt response tone.
// Uses nlptown/bert-base-multilingual-uncased-sentiment (supports 6 languages).

func (h *HuggingFaceService) AnalyzeSentiment(ctx context.Context, text string) (*SentimentResult, error) {
	if !h.enabled {
		return nil, fmt.Errorf("HuggingFace service not enabled")
	}

	start := time.Now()

	payload := map[string]interface{}{
		"inputs": text[:min(512, len(text))],
	}

	body, err := h.callAPI(ctx, HFModelSentiment, payload)
	if err != nil {
		return nil, err
	}

	var results [][]struct {
		Label string  `json:"label"`
		Score float64 `json:"score"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		return nil, fmt.Errorf("parse sentiment: %w", err)
	}

	result := &SentimentResult{
		LatencyMs: time.Since(start).Milliseconds(),
	}

	if len(results) > 0 && len(results[0]) > 0 {
		// Find highest scoring label
		best := results[0][0]
		for _, r := range results[0] {
			if r.Score > best.Score {
				best = r
			}
		}
		result.Label = best.Label
		result.Score = best.Score

		// Convert "1 star" ... "5 stars" to numeric
		switch {
		case strings.Contains(best.Label, "5"):
			result.Stars = 5
			result.Label = "very_positive"
		case strings.Contains(best.Label, "4"):
			result.Stars = 4
			result.Label = "positive"
		case strings.Contains(best.Label, "3"):
			result.Stars = 3
			result.Label = "neutral"
		case strings.Contains(best.Label, "2"):
			result.Stars = 2
			result.Label = "negative"
		case strings.Contains(best.Label, "1"):
			result.Stars = 1
			result.Label = "very_negative"
		}
	}

	return result, nil
}

// ─── TEXT SUMMARIZATION ─────────────────────────────────────────────
// Summarize long text using facebook/bart-large-cnn.
// Used for: condensing long chat histories, summarizing Knowledge Base entries.

func (h *HuggingFaceService) Summarize(ctx context.Context, text string, maxLength int) (string, error) {
	if !h.enabled {
		return "", fmt.Errorf("HuggingFace service not enabled")
	}
	if maxLength <= 0 {
		maxLength = 150
	}

	payload := map[string]interface{}{
		"inputs": text[:min(1024, len(text))],
		"parameters": map[string]interface{}{
			"max_length": maxLength,
			"min_length": 30,
			"do_sample":  false,
		},
	}

	body, err := h.callAPI(ctx, HFModelSummarize, payload)
	if err != nil {
		return "", err
	}

	var results []struct {
		SummaryText string `json:"summary_text"`
	}
	if err := json.Unmarshal(body, &results); err != nil {
		return "", fmt.Errorf("parse summary: %w", err)
	}

	if len(results) > 0 {
		return results[0].SummaryText, nil
	}
	return "", fmt.Errorf("no summary generated")
}

// ─── SEMANTIC SEARCH ────────────────────────────────────────────────
// Find semantically similar content using embedding comparison.
// This is the core upgrade: from keyword matching → semantic understanding.

func (h *HuggingFaceService) SemanticSearch(ctx context.Context, query string, documents []string) ([]SemanticMatch, error) {
	if !h.enabled || len(documents) == 0 {
		return nil, fmt.Errorf("HuggingFace service not enabled or no documents")
	}

	// Get query embedding
	queryEmb, err := h.GetEmbedding(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query embedding: %w", err)
	}

	// Get document embeddings (batch)
	docEmbs, err := h.GetBatchEmbeddings(ctx, documents)
	if err != nil {
		return nil, fmt.Errorf("doc embeddings: %w", err)
	}

	// Calculate similarities
	var matches []SemanticMatch
	for i, docEmb := range docEmbs {
		sim := CosineSimilarity(queryEmb.Vector, docEmb)
		matches = append(matches, SemanticMatch{
			Index:      i,
			Text:       documents[i],
			Similarity: sim,
		})
	}

	// Sort by similarity (descending)
	for i := 0; i < len(matches); i++ {
		for j := i + 1; j < len(matches); j++ {
			if matches[j].Similarity > matches[i].Similarity {
				matches[i], matches[j] = matches[j], matches[i]
			}
		}
	}

	return matches, nil
}

// SemanticMatch represents a document match with similarity score
type SemanticMatch struct {
	Index      int     `json:"index"`
	Text       string  `json:"text"`
	Similarity float64 `json:"similarity"`
}

// ─── API Call Helper ────────────────────────────────────────────────

func (h *HuggingFaceService) callAPI(ctx context.Context, model string, payload interface{}) ([]byte, error) {
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	url := h.baseURL + model
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.apiKey)

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HF API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 200 {
		// Handle model loading (503)
		if resp.StatusCode == 503 {
			log.Printf("🤗 [HuggingFace] Model %s loading, retrying in 5s...", model)
			time.Sleep(5 * time.Second)
			return h.callAPI(ctx, model, payload) // Retry once
		}
		return nil, fmt.Errorf("HF API %d: %s", resp.StatusCode, string(body[:min(200, len(body))]))
	}

	return body, nil
}

// ─── STATS ──────────────────────────────────────────────────────────

func (h *HuggingFaceService) GetStats() map[string]interface{} {
	cacheSize := 0
	h.cache.Range(func(_, _ interface{}) bool {
		cacheSize++
		return true
	})

	return map[string]interface{}{
		"enabled":    h.enabled,
		"cache_size": cacheSize,
		"models": map[string]string{
			"embedding": HFModelEmbedding,
			"zero_shot": HFModelZeroShot,
			"toxicity":  HFModelToxicity,
			"sentiment": HFModelSentiment,
			"summarize": HFModelSummarize,
		},
	}
}
