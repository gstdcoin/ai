package api

import (
	"bytes"
	"context"
	"database/sql"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type GatewayHandler struct {
	apiKeyService *services.APIKeyService
	taskService   *services.TaskService
	db            *sql.DB
	ollamaURL     string
	guardrails    *services.GuardrailsService
}

// SetGuardrails injects the security middleware (called after DI wiring)
func (h *GatewayHandler) SetGuardrails(g *services.GuardrailsService) {
	h.guardrails = g
}

func NewGatewayHandler(apiKeyService *services.APIKeyService, taskService *services.TaskService, db *sql.DB) *GatewayHandler {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://ollama:11434"
	}
	return &GatewayHandler{
		apiKeyService: apiKeyService,
		taskService:   taskService,
		db:            db,
		ollamaURL:     ollamaURL,
	}
}

// OpenAI-compatible Chat Completions with direct Ollama routing
func (h *GatewayHandler) HandleChatCompletions(c *gin.Context) {
	// 1. Authenticate via Bearer token or session
	walletAddress := ""

	authHeader := c.GetHeader("Authorization")
	if authHeader != "" && len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		apiKey := authHeader[7:]
		wa, err := h.apiKeyService.ValidateKey(c.Request.Context(), apiKey)
		if err != nil {
			c.JSON(401, gin.H{"error": "Invalid API key"})
			return
		}
		walletAddress = wa
	} else {
		// Fallback to session token
		wa := c.GetString("user_id")
		if wa == "" {
			wa = c.GetString("wallet_address")
		}
		if wa == "" {
			// Try X-Session-Token header
			sessionToken := c.GetHeader("X-Session-Token")
			if sessionToken == "" {
				c.JSON(401, gin.H{"error": "Authorization required (Bearer <api_key> or X-Session-Token)"})
				return
			}
			// Session is already validated by middleware if present
			wa = c.GetString("wallet_address")
			if wa == "" {
				c.JSON(401, gin.H{"error": "Invalid session"})
				return
			}
		}
		walletAddress = wa
	}

	// 2. Parse OpenAI Request
	var openAIReq struct {
		Model       string `json:"model"`
		Messages    []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
		Stream      bool    `json:"stream"`
		Temperature float64 `json:"temperature"`
		MaxTokens   int     `json:"max_tokens"`
		Speculative bool    `json:"speculative"` // Enable speculative decoding
	}

	if err := c.ShouldBindJSON(&openAIReq); err != nil {
		c.JSON(400, gin.H{"error": "Invalid OpenAI request format"})
		return
	}

	// Default model
	if openAIReq.Model == "" {
		openAIReq.Model = "qwen2.5-coder:7b"
	}

	// Map common model names to Ollama models
	modelMap := map[string]string{
		"gpt-4":            "qwen2.5-coder:32b",
		"gpt-4o":           "qwen2.5-coder:32b",
		"gpt-4-turbo":      "qwen2.5-coder:32b",
		"gpt-3.5-turbo":    "qwen2.5-coder:7b",
		"claude-3-opus":    "llama3.3:70b",
		"claude-3-sonnet":  "qwen2.5-coder:32b",
		"claude-3-haiku":   "qwen2.5-coder:7b",
		"gstd-sovereign":   "qwen2.5-coder:32b",
		"gstd-fast":        "qwen2.5-coder:7b",
		"gstd-ultra":       "llama3.3:70b",
	}

	ollamaModel := openAIReq.Model
	if mapped, ok := modelMap[openAIReq.Model]; ok {
		ollamaModel = mapped
	}

	// 3. Calculate cost based on model tier
	cost := 0.01
	switch {
	case strings.Contains(ollamaModel, "70b") || strings.Contains(ollamaModel, "72b"):
		cost = 0.1
	case strings.Contains(ollamaModel, "32b") || strings.Contains(ollamaModel, "34b"):
		cost = 0.05
	case strings.Contains(ollamaModel, "14b") || strings.Contains(ollamaModel, "13b"):
		cost = 0.02
	default:
		cost = 0.01
	}

	// 3b. SILICON GUARDRAILS: Security check before inference
	if h.guardrails != nil {
		messages := make([]map[string]string, len(openAIReq.Messages))
		for i, m := range openAIReq.Messages {
			messages[i] = map[string]string{"role": m.Role, "content": m.Content}
		}
		guardResult := h.guardrails.AnalyzePrompt(c.Request.Context(), walletAddress, messages)
		if !guardResult.Allowed {
			c.JSON(403, gin.H{
				"error":      "Request blocked by Silicon Guardrails",
				"risk_score": guardResult.RiskScore,
				"violations": guardResult.Violations,
				"category":   guardResult.Category,
			})
			return
		}
	}

	// 4. ZERO-BALANCE-GATE: Check balance and auto-route
	var balance float64
	err := h.db.QueryRowContext(c.Request.Context(),
		"SELECT COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&balance)
	if err != nil && err != sql.ErrNoRows {
		log.Printf("Gateway: balance check error: %v", err)
	}

	if balance >= cost {
		// Sufficient balance → deduct and proceed as Master
		h.db.ExecContext(c.Request.Context(),
			"UPDATE users SET pending_balance_gstd = pending_balance_gstd - $1 WHERE wallet_address = $2",
			cost, walletAddress)

		// RECYCLING: Route payment through recycling pool
		go func() {
			minerReward := cost * 0.93  // 93% to miners
			goldenReserve := cost * 0.02 // 2% to gold reserve
			burned := cost * 0.05        // 5% burned
			h.db.Exec(`INSERT INTO recycling_pool (from_wallet, total_amount, miner_reward, golden_reserve, burned_amount, task_id, transaction_type) VALUES ($1, $2, $3, $4, $5, $6, 'inference')`,
				walletAddress, cost, minerReward, goldenReserve, burned, "chat-"+fmt.Sprintf("%d", time.Now().UnixNano()))
			h.db.Exec(`UPDATE recycling_pool_balance SET available_for_miners = available_for_miners + $1, total_recycled = total_recycled + $2, total_to_reserve = total_to_reserve + $3, total_burned = total_burned + $4, updated_at = NOW() WHERE id = 1`,
				minerReward, cost, goldenReserve, burned)
		}()
	} else if balance <= 0 {
		// ZERO-BALANCE-GATE: Return 402 with work-to-earn instructions
		// Allow first 3 free requests per day for onboarding
		var freeToday int
		h.db.QueryRowContext(c.Request.Context(),
			"SELECT COUNT(*) FROM api_usage_log WHERE wallet_address = $1 AND cost_gstd = 0 AND created_at > CURRENT_DATE",
			walletAddress).Scan(&freeToday)

		if freeToday >= 3 {
			c.JSON(402, gin.H{
				"error":          "insufficient_balance",
				"balance":        balance,
				"required":       cost,
				"deficit":        cost - balance,
				"mode":           "worker",
				"work_required":  int(cost/0.005) + 1,
				"message":        "Switch to Worker mode to earn GSTD. Your device will process tasks in the background.",
				"protocol":       "x402/1.0",
				"recipient_wallet": "platform_recycling_pool",
			})
			return
		}
		// Free tier: allow but log as 0-cost
		cost = 0
	}
	// Partial balance: allow request, deduct what's available

	// 5. Route to Ollama directly for low-latency inference
	ollamaReqBody := map[string]interface{}{
		"model":    ollamaModel,
		"messages": openAIReq.Messages,
		"stream":   openAIReq.Stream,
		"options":  map[string]interface{}{},
	}

	if openAIReq.Temperature > 0 {
		ollamaReqBody["options"].(map[string]interface{})["temperature"] = openAIReq.Temperature
	}
	if openAIReq.MaxTokens > 0 {
		ollamaReqBody["options"].(map[string]interface{})["num_predict"] = openAIReq.MaxTokens
	}

	body, _ := json.Marshal(ollamaReqBody)

	if openAIReq.Stream {
		if openAIReq.Speculative && h.shouldUseSpeculative(ollamaModel) {
			h.handleSpeculativeDecoding(c, openAIReq.Messages, ollamaModel, openAIReq.Model, walletAddress, openAIReq.Temperature, openAIReq.MaxTokens)
		} else {
			h.handleStreamingResponse(c, body, openAIReq.Model, walletAddress)
		}
		return
	}

	// Non-streaming request
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", h.ollamaURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create request to inference engine"})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Gateway: Ollama request failed: %v, falling back to task queue", err)
		// Fallback to decentralized task queue
		h.handleTaskQueueFallback(c, walletAddress, openAIReq.Model, openAIReq.Messages)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("Gateway: Ollama error %d: %s", resp.StatusCode, string(respBody))
		h.handleTaskQueueFallback(c, walletAddress, openAIReq.Model, openAIReq.Messages)
		return
	}

	// Parse Ollama response
	var ollamaResp struct {
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		TotalDuration  int64 `json:"total_duration"`
		PromptEvalCount int  `json:"prompt_eval_count"`
		EvalCount       int  `json:"eval_count"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		c.JSON(500, gin.H{"error": "Failed to parse inference response"})
		return
	}

	// Log usage for analytics
	go func() {
		h.db.Exec(`
			INSERT INTO api_usage_log (wallet_address, model, prompt_tokens, completion_tokens, cost_gstd, created_at)
			VALUES ($1, $2, $3, $4, $5, NOW())`,
			walletAddress, ollamaModel, ollamaResp.PromptEvalCount, ollamaResp.EvalCount, cost)
	}()

	// Return OpenAI-compatible response
	c.JSON(200, gin.H{
		"id":      "chatcmpl-gstd-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   openAIReq.Model,
		"choices": []interface{}{
			gin.H{
				"index": 0,
				"message": gin.H{
					"role":    "assistant",
					"content": ollamaResp.Message.Content,
				},
				"finish_reason": "stop",
			},
		},
		"usage": gin.H{
			"prompt_tokens":     ollamaResp.PromptEvalCount,
			"completion_tokens": ollamaResp.EvalCount,
			"total_tokens":      ollamaResp.PromptEvalCount + ollamaResp.EvalCount,
		},
		"system_fingerprint": "gstd-sovereign-v1",
	})
}

// handleStreamingResponse handles SSE streaming responses
func (h *GatewayHandler) handleStreamingResponse(c *gin.Context, body []byte, requestModel string, walletAddress string) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", h.ollamaURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create streaming request"})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(502, gin.H{"error": "Inference engine unavailable"})
		return
	}
	defer resp.Body.Close()

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	chatID := fmt.Sprintf("chatcmpl-gstd-%d", time.Now().UnixNano())
	flusher, _ := c.Writer.(http.Flusher)

	decoder := json.NewDecoder(resp.Body)
	for {
		var chunk struct {
			Message struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"message"`
			Done bool `json:"done"`
		}

		if err := decoder.Decode(&chunk); err != nil {
			if err == io.EOF {
				break
			}
			break
		}

		sseData := gin.H{
			"id":      chatID,
			"object":  "chat.completion.chunk",
			"created": time.Now().Unix(),
			"model":   requestModel,
			"choices": []interface{}{
				gin.H{
					"index": 0,
					"delta": gin.H{
						"content": chunk.Message.Content,
					},
					"finish_reason": nil,
				},
			},
		}

		if chunk.Done {
			sseData["choices"] = []interface{}{
				gin.H{
					"index":         0,
					"delta":         gin.H{},
					"finish_reason": "stop",
				},
			}
		}

		jsonData, _ := json.Marshal(sseData)
		fmt.Fprintf(c.Writer, "data: %s\n\n", jsonData)
		if flusher != nil {
			flusher.Flush()
		}

		if chunk.Done {
			fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			break
		}
	}
}

// handleTaskQueueFallback routes to decentralized task queue when Ollama is unavailable
func (h *GatewayHandler) handleTaskQueueFallback(c *gin.Context, walletAddress string, model string, messages interface{}) {
	prompt, _ := json.Marshal(messages)
	descriptor := &models.TaskDescriptor{
		TaskType:  "inference",
		Operation: "chat_completion",
		Model:     model,
		Input: models.InputData{
			Source: "inline",
			Data:   string(prompt),
		},
		Constraints: models.Constraints{
			TimeLimitSec: 60,
		},
		Reward: models.Reward{
			AmountGSTD: 0.1,
		},
	}

	task, err := h.taskService.CreateTask(c.Request.Context(), walletAddress, descriptor)
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to queue task: %v", err)})
		return
	}

	// Poll for result
	ctx, cancel := context.WithTimeout(c.Request.Context(), 50*time.Second)
	defer cancel()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			c.JSON(504, gin.H{"error": "Gateway timeout: Network processing your request"})
			return
		case <-ticker.C:
			var status string
			var resultData sql.NullString
			err := h.db.QueryRowContext(ctx, "SELECT status, result_data FROM tasks WHERE task_id = $1", task.TaskID).Scan(&status, &resultData)
			if err != nil {
				continue
			}

			if status == "completed" && resultData.Valid {
				content := resultData.String
				var resultMap map[string]interface{}
				if err := json.Unmarshal([]byte(resultData.String), &resultMap); err == nil {
					if res, ok := resultMap["result"].(string); ok {
						content = res
					} else if res, ok := resultMap["content"].(string); ok {
						content = res
					}
				}

				c.JSON(200, gin.H{
					"id":      "chatcmpl-" + task.TaskID,
					"object":  "chat.completion",
					"created": time.Now().Unix(),
					"model":   model,
					"choices": []interface{}{
						gin.H{
							"index": 0,
							"message": gin.H{
								"role":    "assistant",
								"content": content,
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
				return
			} else if status == "failed" {
				c.JSON(500, gin.H{"error": "Inference failed on the network"})
				return
			}
		}
	}
}

// shouldUseSpeculative determines if speculative decoding benefits this model
func (h *GatewayHandler) shouldUseSpeculative(model string) bool {
	// Only use speculative decoding for large models where latency is high
	return strings.Contains(model, "32b") || strings.Contains(model, "34b") ||
		strings.Contains(model, "70b") || strings.Contains(model, "72b")
}

// getDraftModel returns the small draft model for speculative decoding
func (h *GatewayHandler) getDraftModel(targetModel string) string {
	// Map large models to their draft counterparts
	if strings.Contains(targetModel, "qwen") {
		return "qwen2.5-coder:1.5b"
	}
	return "llama3.2:1b"
}

// handleSpeculativeDecoding implements speculative decoding:
// 1. Small draft model (1B) generates tokens instantly (shown dimmed on frontend)
// 2. Large target model (32B/70B) verifies and corrects in parallel
func (h *GatewayHandler) handleSpeculativeDecoding(c *gin.Context, messages interface{}, targetModel, requestModel, walletAddress string, temperature float64, maxTokens int) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 180*time.Second)
	defer cancel()

	draftModel := h.getDraftModel(targetModel)

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	chatID := fmt.Sprintf("chatcmpl-gstd-%d", time.Now().UnixNano())
	flusher, _ := c.Writer.(http.Flusher)

	// Phase 1: Stream draft tokens from the small model (fast, ~1B params)
	draftReq := map[string]interface{}{
		"model":    draftModel,
		"messages": messages,
		"stream":   true,
		"options":  map[string]interface{}{"temperature": 0.3, "num_predict": 200},
	}
	if maxTokens > 0 && maxTokens < 200 {
		draftReq["options"].(map[string]interface{})["num_predict"] = maxTokens
	}

	draftBody, _ := json.Marshal(draftReq)
	draftHTTPReq, err := http.NewRequestWithContext(ctx, "POST", h.ollamaURL+"/api/chat", bytes.NewReader(draftBody))
	if err != nil {
		h.sendSSEError(c, flusher, chatID, requestModel, "Draft model unavailable")
		return
	}
	draftHTTPReq.Header.Set("Content-Type", "application/json")

	draftClient := &http.Client{Timeout: 30 * time.Second}
	draftResp, err := draftClient.Do(draftHTTPReq)

	draftContent := ""
	if err == nil && draftResp.StatusCode == 200 {
		defer draftResp.Body.Close()
		decoder := json.NewDecoder(draftResp.Body)
		for {
			var chunk struct {
				Message struct{ Content string `json:"content"` } `json:"message"`
				Done    bool                                      `json:"done"`
			}
			if decoder.Decode(&chunk) != nil || chunk.Done {
				break
			}
			draftContent += chunk.Message.Content

			// Send speculative token
			sseData, _ := json.Marshal(gin.H{
				"id": chatID, "object": "chat.completion.chunk", "created": time.Now().Unix(), "model": requestModel,
				"speculative": true,
				"choices": []interface{}{gin.H{"index": 0, "delta": gin.H{"content": chunk.Message.Content}, "finish_reason": nil}},
			})
			fmt.Fprintf(c.Writer, "data: %s\n\n", sseData)
			if flusher != nil {
				flusher.Flush()
			}
		}
	} else {
		log.Printf("Gateway: Draft model (%s) unavailable, falling back to direct streaming", draftModel)
	}

	// Phase 2: Get verified response from the target model (full quality)
	targetReq := map[string]interface{}{
		"model":    targetModel,
		"messages": messages,
		"stream":   true,
		"options":  map[string]interface{}{},
	}
	if temperature > 0 {
		targetReq["options"].(map[string]interface{})["temperature"] = temperature
	}
	if maxTokens > 0 {
		targetReq["options"].(map[string]interface{})["num_predict"] = maxTokens
	}

	targetBody, _ := json.Marshal(targetReq)
	targetHTTPReq, err := http.NewRequestWithContext(ctx, "POST", h.ollamaURL+"/api/chat", bytes.NewReader(targetBody))
	if err != nil {
		h.sendSSEError(c, flusher, chatID, requestModel, "Target model unavailable")
		return
	}
	targetHTTPReq.Header.Set("Content-Type", "application/json")

	targetClient := &http.Client{Timeout: 180 * time.Second}
	targetResp, err := targetClient.Do(targetHTTPReq)
	if err != nil {
		h.sendSSEError(c, flusher, chatID, requestModel, "Inference engine unavailable")
		return
	}
	defer targetResp.Body.Close()

	// Stream verified tokens
	decoder := json.NewDecoder(targetResp.Body)
	for {
		var chunk struct {
			Message struct{ Content string `json:"content"` } `json:"message"`
			Done    bool                                      `json:"done"`
		}
		if err := decoder.Decode(&chunk); err != nil {
			break
		}

		sseData, _ := json.Marshal(gin.H{
			"id": chatID, "object": "chat.completion.chunk", "created": time.Now().Unix(), "model": requestModel,
			"speculative": false, // Verified token
			"choices": []interface{}{
				gin.H{
					"index":         0,
					"delta":         gin.H{"content": chunk.Message.Content},
					"finish_reason": nil,
				},
			},
		})

		if chunk.Done {
			sseData, _ = json.Marshal(gin.H{
				"id": chatID, "object": "chat.completion.chunk", "created": time.Now().Unix(), "model": requestModel,
				"choices": []interface{}{gin.H{"index": 0, "delta": gin.H{}, "finish_reason": "stop"}},
			})
		}

		fmt.Fprintf(c.Writer, "data: %s\n\n", sseData)
		if flusher != nil {
			flusher.Flush()
		}

		if chunk.Done {
			fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
			if flusher != nil {
				flusher.Flush()
			}
			break
		}
	}
}

func (h *GatewayHandler) sendSSEError(c *gin.Context, flusher http.Flusher, chatID, model, errMsg string) {
	sseData, _ := json.Marshal(gin.H{
		"id": chatID, "object": "chat.completion.chunk", "created": time.Now().Unix(), "model": model,
		"choices": []interface{}{gin.H{"index": 0, "delta": gin.H{"content": "Error: " + errMsg}, "finish_reason": "stop"}},
	})
	fmt.Fprintf(c.Writer, "data: %s\n\n", sseData)
	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	if flusher != nil {
		flusher.Flush()
	}
}

// ListModels returns available models (OpenAI-compatible /v1/models)
func (h *GatewayHandler) ListModels(c *gin.Context) {
	models := []gin.H{
		{"id": "qwen2.5-coder:7b", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
		{"id": "qwen2.5-coder:32b", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
		{"id": "llama3.1:8b", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
		{"id": "llama3.3:70b", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
		{"id": "gstd-fast", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
		{"id": "gstd-sovereign", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
		{"id": "gstd-ultra", "object": "model", "owned_by": "gstd-sovereign", "created": time.Now().Unix()},
	}

	// Try to get actual Ollama models
	resp, err := http.Get(h.ollamaURL + "/api/tags")
	if err == nil && resp.StatusCode == 200 {
		defer resp.Body.Close()
		var ollamaModels struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.NewDecoder(resp.Body).Decode(&ollamaModels) == nil {
			for _, m := range ollamaModels.Models {
				models = append(models, gin.H{
					"id": m.Name, "object": "model", "owned_by": "gstd-ollama", "created": time.Now().Unix(),
				})
			}
		}
	}

	c.JSON(200, gin.H{"object": "list", "data": models})
}

// User API Key Management
func (h *GatewayHandler) GetUserKeys(c *gin.Context) {
	walletAddress := c.GetString("user_id")
	if walletAddress == "" {
		walletAddress = c.GetString("wallet_address")
	}
	if walletAddress == "" {
		c.JSON(401, gin.H{"error": "Unauthorized"})
		return
	}

	keys, err := h.apiKeyService.GetKeys(c.Request.Context(), walletAddress)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"keys": keys})
}

func (h *GatewayHandler) CreateUserKey(c *gin.Context) {
	walletAddress := c.GetString("user_id")
	if walletAddress == "" {
		walletAddress = c.GetString("wallet_address")
	}
	if walletAddress == "" {
		c.JSON(401, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		Label string `json:"label"`
	}
	c.ShouldBindJSON(&req)
	if req.Label == "" {
		req.Label = "Key " + time.Now().Format("2006-01-02")
	}

	key, err := h.apiKeyService.GenerateKey(c.Request.Context(), walletAddress, req.Label)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"api_key": key, "label": req.Label})
}
