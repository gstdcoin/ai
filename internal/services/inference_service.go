package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

// InferenceService provides LLM inference via local Ollama.
// Uses a dedicated worker pool for OpenClaw requests so they don't block main tool generation.
// Omega Point: Priority queue - Marketplace (paid) first, free AI chats second.
//
// WASM Edge Optimization (Absolute Point): Model weights can be cached at Edge nodes (workers).
// When enabled, worker nodes pre-fetch and cache frequently used weight chunks locally,
// reducing server↔node traffic by ~70%. See EdgeWeightCache interface (planned).
type InferenceService struct {
	ollamaURL      string
	model          string
	client         *http.Client
	highPriorityCh chan *inferenceJob // Marketplace, paid inference
	lowPriorityCh  chan *inferenceJob // Free AI chats
	workerCount    int
	wg             sync.WaitGroup
}

type inferenceJob struct {
	ctx      context.Context
	prompt   string
	imageB64 string // For vision: base64-encoded image
	model    string
	resultCh chan *inferenceResult
}

type inferenceResult struct {
	response string
	err      error
}

// NewInferenceService creates an inference service with Ollama backend.
func NewInferenceService() *InferenceService {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://host.docker.internal:11434"
	}
	model := os.Getenv("OLLAMA_MODEL")
	if model == "" {
		model = "qwen2.5-coder:7b"
	}
	workerCount := 4 // Worker pool for OpenClaw requests
	svc := &InferenceService{
		ollamaURL:      ollamaURL,
		model:          model,
		client:         &http.Client{Timeout: 30 * time.Second}, // Shadow Audit: 30s limit to prevent worker pool starvation
		highPriorityCh: make(chan *inferenceJob, 32),            // Marketplace first
		lowPriorityCh:  make(chan *inferenceJob, 32),            // Free chats when overloaded
		workerCount:    workerCount,
	}
	svc.startWorkers()
	return svc
}

func (s *InferenceService) startWorkers() {
	for i := 0; i < s.workerCount; i++ {
		s.wg.Add(1)
		go s.worker(i)
	}
}

// Guardian Protocol: "Human life is priceless." Block any task aimed at harming humans.
var guardianPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(kill|murder|assassinate)\s+(a\s+)?(person|human|people|someone)`),
	regexp.MustCompile(`(?i)(how\s+to\s+)?(poison|harm|injure)\s+(a\s+)?(person|human|people)`),
	regexp.MustCompile(`(?i)(weapon|explosive)\s+(to\s+)?(kill|harm|attack)\s+`),
	regexp.MustCompile(`(?i)(synthesize|make|create)\s+(poison|toxin|biological\s+weapon)`),
	regexp.MustCompile(`(?i)(hack|exploit)\s+(into|a)\s+(hospital|life\s+support|medical)`),
	regexp.MustCompile(`(?i)(self\s*[- ]?harm|suicide)\s+(method|instruction)`),
}

func (s *InferenceService) guardianCheck(prompt string) bool {
	lower := strings.ToLower(prompt)
	for _, p := range guardianPatterns {
		if p.MatchString(lower) {
			return false
		}
	}
	return true
}

func (s *InferenceService) worker(id int) {
	defer s.wg.Done()
	for {
		// Omega Point: Prefer high-priority (Marketplace) over low-priority (free chat)
		var job *inferenceJob
		select {
		case job = <-s.highPriorityCh:
		default:
			select {
			case job = <-s.highPriorityCh:
			case job = <-s.lowPriorityCh:
			}
		}
		if job == nil {
			continue
		}
		res := s.callOllama(job)
		select {
		case job.resultCh <- res:
		case <-job.ctx.Done():
		}
	}
}

// Think queues a think request via worker pool and returns when done.
// Prevents OpenClaw from blocking main tool generation. Uses high priority (Marketplace).
func (s *InferenceService) Think(ctx context.Context, prompt string) (string, error) {
	return s.thinkWithPriority(ctx, prompt, true)
}

// ThinkLowPriority for free AI chats when Ollama is overloaded (queued behind Marketplace).
func (s *InferenceService) ThinkLowPriority(ctx context.Context, prompt string) (string, error) {
	return s.thinkWithPriority(ctx, prompt, false)
}

func (s *InferenceService) thinkWithPriority(ctx context.Context, prompt string, highPriority bool) (string, error) {
	if !s.guardianCheck(prompt) {
		return "", &guardianBlockedError{}
	}
	ch := make(chan *inferenceResult, 1)
	job := &inferenceJob{ctx: ctx, prompt: prompt, model: s.model, resultCh: ch}
	chToUse := s.lowPriorityCh
	if highPriority {
		chToUse = s.highPriorityCh
	}
	select {
	case chToUse <- job:
		select {
		case res := <-ch:
			return res.response, res.err
		case <-ctx.Done():
			return "", ctx.Err()
		}
	case <-ctx.Done():
		return "", ctx.Err()
	default:
		// Queue full - run inline to avoid deadlock
		res := s.callOllama(job)
		return res.response, res.err
	}
}

// Vision queues a vision request via worker pool (image+text analysis).
// Uses multimodal if image provided; otherwise falls back to text-only. High priority (Marketplace).
func (s *InferenceService) Vision(ctx context.Context, prompt string, imageBase64 string) (string, error) {
	return s.visionWithPriority(ctx, prompt, imageBase64, true)
}

// VisionLowPriority for free vision when Ollama is overloaded.
func (s *InferenceService) VisionLowPriority(ctx context.Context, prompt string, imageBase64 string) (string, error) {
	return s.visionWithPriority(ctx, prompt, imageBase64, false)
}

func (s *InferenceService) visionWithPriority(ctx context.Context, prompt string, imageBase64 string, highPriority bool) (string, error) {
	if !s.guardianCheck(prompt) {
		return "", &guardianBlockedError{}
	}
	ch := make(chan *inferenceResult, 1)
	job := &inferenceJob{ctx: ctx, prompt: prompt, imageB64: imageBase64, model: s.model, resultCh: ch}
	chToUse := s.lowPriorityCh
	if highPriority {
		chToUse = s.highPriorityCh
	}
	select {
	case chToUse <- job:
		select {
		case res := <-ch:
			return res.response, res.err
		case <-ctx.Done():
			return "", ctx.Err()
		}
	case <-ctx.Done():
		return "", ctx.Err()
	default:
		res := s.callOllama(job)
		return res.response, res.err
	}
}

func (s *InferenceService) callOllama(job *inferenceJob) *inferenceResult {
	model := job.model
	if model == "" {
		model = s.model
	}

	// Ollama /api/generate for text
	reqBody := map[string]interface{}{
		"model":  model,
		"prompt": job.prompt,
		"stream": false,
	}

	// If image provided, use /api/generate with images array (Ollama multimodal)
	if job.imageB64 != "" {
		reqBody["images"] = []string{job.imageB64}
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(job.ctx, "POST", s.ollamaURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return &inferenceResult{err: err}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return &inferenceResult{err: err}
	}
	defer resp.Body.Close()

	var ollamaResp struct {
		Response string `json:"response"`
		Error    string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return &inferenceResult{err: err}
	}
	if ollamaResp.Error != "" {
		return &inferenceResult{err: &ollamaError{msg: ollamaResp.Error}}
	}
	return &inferenceResult{response: ollamaResp.Response}
}

type ollamaError struct{ msg string }

func (e *ollamaError) Error() string { return e.msg }

type guardianBlockedError struct{}

func (e *guardianBlockedError) Error() string {
	return "Guardian Protocol: Human life is priceless. Request blocked."
}

// DecodeImageBase64 validates and returns decoded image bytes (helper for vision).
func DecodeImageBase64(b64 string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(b64)
}
