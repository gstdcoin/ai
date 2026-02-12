package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// GatewayHandler handles OpenAI-compatible chat completions and API key management.
type GatewayHandler struct {
	apiKeyService *services.APIKeyService
	taskService   *services.TaskService
	db            *sql.DB
	guardrails    *services.GuardrailsService
	ollamaURL     string
	client        *http.Client
}

// NewGatewayHandler creates a new gateway handler.
func NewGatewayHandler(apiKeyService *services.APIKeyService, taskService *services.TaskService, db *sql.DB) *GatewayHandler {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://host.docker.internal:11434"
	}
	// 90s timeout for LLM generation (Qwen can take time)
	ollamaClient := &http.Client{Timeout: 90 * time.Second}
	return &GatewayHandler{
		apiKeyService: apiKeyService,
		taskService:   taskService,
		db:            db,
		ollamaURL:     ollamaURL,
		client:        ollamaClient,
	}
}

// SetGuardrails wires the guardrails service for prompt filtering.
func (h *GatewayHandler) SetGuardrails(g *services.GuardrailsService) {
	h.guardrails = g
}

// HandleChatCompletions handles OpenAI-compatible chat completions and proxies to Ollama.
func (h *GatewayHandler) HandleChatCompletions(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid_request"})
		return
	}

	var req struct {
		Model    string        `json:"model"`
		Messages []interface{} `json:"messages"`
		Stream   bool          `json:"stream"`
	}
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_json"})
		return
	}
	if req.Model == "" {
		req.Model = "gpt-3.5-turbo"
	}
	if len(req.Messages) == 0 {
		c.JSON(400, gin.H{"error": "messages required"})
		return
	}

	// Extract messages for guardrails
	var promptMsgs []map[string]string
	for _, m := range req.Messages {
		if mm, ok := m.(map[string]interface{}); ok {
			role, _ := mm["role"].(string)
			content, _ := mm["content"].(string)
			promptMsgs = append(promptMsgs, map[string]string{"role": role, "content": content})
		}
	}

	wallet := c.GetString("wallet_address")
	if wallet == "" {
		wallet = c.GetHeader("X-GSTD-Target-Wallet")
	}

	// Guardrails check
	if h.guardrails != nil {
		result := h.guardrails.AnalyzePrompt(c.Request.Context(), wallet, promptMsgs)
		if !result.Allowed {
			c.JSON(403, gin.H{"error": "blocked", "reason": result.Violations})
			return
		}
	}

	// Map to Ollama format
	ollamaModel := "qwen2.5-coder:7b"
	if strings.HasPrefix(req.Model, "gpt") || strings.HasPrefix(req.Model, "gpt-") {
		ollamaModel = "qwen2.5-coder:7b"
	} else if req.Model != "" {
		ollamaModel = req.Model
	}

	prompt := ""
	for _, m := range promptMsgs {
		prompt += m["role"] + ": " + m["content"] + "\n"
	}
	prompt += "assistant: "

	ollamaReq := map[string]interface{}{
		"model":  ollamaModel,
		"prompt": prompt,
		"stream": false,
	}
	ollamaBody, _ := json.Marshal(ollamaReq)

	resp, err := h.client.Post(h.ollamaURL+"/api/generate", "application/json", bytes.NewReader(ollamaBody))
	if err != nil {
		log.Printf("Ollama proxy error: %v", err)
		c.JSON(500, gin.H{"error": "inference_unavailable", "message": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var ollamaResp struct {
		Response string `json:"response"`
	}
	_ = json.Unmarshal(respBody, &ollamaResp)

	// OpenAI-compatible response
	c.JSON(200, gin.H{
		"id":      "chatcmpl-gstd",
		"object":  "chat.completion",
		"model":   req.Model,
		"choices": []gin.H{
			{
				"index": 0,
				"message": gin.H{
					"role":    "assistant",
					"content": strings.TrimSpace(ollamaResp.Response),
				},
				"finish_reason": "stop",
			},
		},
		"usage": gin.H{
			"prompt_tokens":     0,
			"completion_tokens": 0,
			"total_tokens":      0,
		},
	})
}

// ListModels returns available models for the gateway.
func (h *GatewayHandler) ListModels(c *gin.Context) {
	// Query Ollama for models
	resp, err := h.client.Get(h.ollamaURL + "/api/tags")
	models := []gin.H{
		{"id": "gpt-3.5-turbo", "object": "model"},
		{"id": "gpt-4", "object": "model"},
		{"id": "qwen2.5-coder:7b", "object": "model"},
		{"id": "llama3.1:8b", "object": "model"},
	}
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var data struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			for _, m := range data.Models {
				models = append(models, gin.H{"id": m.Name, "object": "model"})
			}
		}
	}
	c.JSON(200, gin.H{"object": "list", "data": models})
}

// GetUserKeys returns API keys for the authenticated user.
func (h *GatewayHandler) GetUserKeys(c *gin.Context) {
	wallet := c.GetString("wallet_address")
	if wallet == "" {
		c.JSON(401, gin.H{"error": "wallet required"})
		return
	}
	keys, err := h.apiKeyService.GetKeys(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"keys": keys})
}

// CreateUserKey creates a new API key for the authenticated user.
func (h *GatewayHandler) CreateUserKey(c *gin.Context) {
	wallet := c.GetString("wallet_address")
	if wallet == "" {
		c.JSON(401, gin.H{"error": "wallet required"})
		return
	}
	var req struct {
		Label string `json:"label"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid_request"})
		return
	}
	if req.Label == "" {
		req.Label = "default"
	}
	key, err := h.apiKeyService.GenerateKey(c.Request.Context(), wallet, req.Label)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"api_key": key, "label": req.Label})
}
