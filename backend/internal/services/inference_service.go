package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// InferenceService provides LLM inference via local Ollama.
// Uses a dedicated worker pool for OpenClaw requests so they don't block main tool generation.
type InferenceService struct {
	ollamaURL   string
	model       string
	client      *http.Client
	openClawCh  chan *inferenceJob
	workerCount int
	wg          sync.WaitGroup
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
		ollamaURL:   ollamaURL,
		model:       model,
		client:      &http.Client{Timeout: 90 * time.Second},
		openClawCh:  make(chan *inferenceJob, 64),
		workerCount: workerCount,
	}
	svc.startWorkers()
	return svc
}

func (s *InferenceService) startWorkers() {
	for i := 0; i < s.workerCount; i++ {
		s.wg.Add(1)
		go s.worker(i)
	}
	log.Printf("🧠 InferenceService: %d OpenClaw workers started (model=%s)", s.workerCount, s.model)
}

func (s *InferenceService) worker(id int) {
	defer s.wg.Done()
	for job := range s.openClawCh {
		res := s.callOllama(job)
		select {
		case job.resultCh <- res:
		case <-job.ctx.Done():
		}
	}
}

// Think queues a think request via worker pool and returns when done.
// Prevents OpenClaw from blocking main tool generation.
func (s *InferenceService) Think(ctx context.Context, prompt string) (string, error) {
	ch := make(chan *inferenceResult, 1)
	job := &inferenceJob{ctx: ctx, prompt: prompt, model: s.model, resultCh: ch}
	select {
	case s.openClawCh <- job:
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
// Uses multimodal if image provided; otherwise falls back to text-only.
func (s *InferenceService) Vision(ctx context.Context, prompt string, imageBase64 string) (string, error) {
	ch := make(chan *inferenceResult, 1)
	job := &inferenceJob{ctx: ctx, prompt: prompt, imageB64: imageBase64, model: s.model, resultCh: ch}
	select {
	case s.openClawCh <- job:
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

// DecodeImageBase64 validates and returns decoded image bytes (helper for vision).
func DecodeImageBase64(b64 string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(b64)
}
