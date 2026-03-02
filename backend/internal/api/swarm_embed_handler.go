package api

import (
	"database/sql"
	"io"
	"log"
	"strings"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SwarmEmbedHandler handles the universal embeddable AI swarm API.
// This is a simplified, CORS-open endpoint designed for external embedding.
//
// Uses:
//   - Websites (via <script> widget or iframe)
//   - Mobile apps (via REST API)
//   - IoT devices (via cURL-like HTTP)
//   - Telegram bots, Discord bots, CLI tools
//   - Raspberry Pi, Arduino (via HTTP client)
//
// Endpoint: POST /api/v1/swarm/infer
// Auth: Bearer token (API key) OR anonymous (rate-limited, short responses)
type SwarmEmbedHandler struct {
	db          *sql.DB
	smartRouter *services.SmartRouter
	apiKeys     *services.APIKeyService
}

// NewSwarmEmbedHandler creates the universal swarm handler.
func NewSwarmEmbedHandler(db *sql.DB, smartRouter *services.SmartRouter, apiKeys *services.APIKeyService) *SwarmEmbedHandler {
	return &SwarmEmbedHandler{
		db:          db,
		smartRouter: smartRouter,
		apiKeys:     apiKeys,
	}
}

// SwarmInferRequest is the simplified inference request.
type SwarmInferRequest struct {
	// Required: the prompt or message
	Prompt string `json:"prompt" binding:"required"`
	// Optional: system prompt for context
	System string `json:"system,omitempty"`
	// Optional: model selection (default: auto — sovereign routing)
	Model string `json:"model,omitempty"`
	// Optional: response creativity (0.0 = deterministic, 1.0 = creative)
	Temperature float64 `json:"temperature,omitempty"`
	// Optional: max response length in tokens
	MaxTokens int `json:"max_tokens,omitempty"`
	// Optional: enable SSE streaming
	Stream bool `json:"stream,omitempty"`
	// Optional: conversation context (previous messages)
	Context []SwarmMessage `json:"context,omitempty"`
}

// SwarmMessage represents a conversation message.
type SwarmMessage struct {
	Role    string `json:"role"` // "user", "assistant", "system"
	Content string `json:"content"`
}

// SwarmInferResponse is the simplified inference response.
type SwarmInferResponse struct {
	// The AI response text
	Response string `json:"response"`
	// Model that was used
	Model string `json:"model"`
	// Routing tier (1=cache, 2=swarm, 3=cocoon, 4=commercial)
	Tier int `json:"tier"`
	// Whether the response was served by sovereign infrastructure
	Sovereign bool `json:"sovereign"`
	// Token usage
	Usage SwarmUsage `json:"usage"`
	// Cost in GSTD tokens
	CostGSTD float64 `json:"cost_gstd"`
	// Latency in milliseconds
	LatencyMs int64 `json:"latency_ms"`
	// Unique transaction ID
	TransactionID string `json:"transaction_id"`
}

// SwarmUsage tracks token consumption.
type SwarmUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// HandleInfer processes a universal inference request.
// POST /api/v1/swarm/infer
func (h *SwarmEmbedHandler) HandleInfer(c *gin.Context) {
	var req SwarmInferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{
			"error":   "invalid_request",
			"message": "A 'prompt' field is required. Example: {\"prompt\": \"Hello, GSTD!\"}",
		})
		return
	}

	// Validate prompt length (security: prevent abuse)
	if len(req.Prompt) > 10000 {
		c.JSON(400, gin.H{"error": "prompt_too_long", "message": "Maximum prompt length is 10,000 characters"})
		return
	}

	// Default model
	if req.Model == "" {
		req.Model = "omega-auto"
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 1024
	}
	if req.Temperature <= 0 {
		req.Temperature = 0.7
	}

	// Check for anonymous vs authenticated
	isAnonymous := true
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		isAnonymous = false
	}
	// Also check API key header
	if c.GetHeader("X-API-Key") != "" {
		isAnonymous = false
	}

	// Anonymous limits: shorter response, no streaming
	if isAnonymous {
		if req.MaxTokens > 512 {
			req.MaxTokens = 512
		}
		if req.Stream {
			req.Stream = false // Anonymous users can't stream
		}
		if len(req.Context) > 3 {
			req.Context = req.Context[len(req.Context)-3:] // Keep last 3 messages
		}
	}

	// Build OpenAI-compatible messages array
	messages := []map[string]interface{}{}

	// System prompt
	system := req.System
	if system == "" {
		system = "You are GSTD Swarm AI — a sovereign, decentralized AI assistant powered by the GSTD network. Be helpful, concise, and accurate."
	}
	messages = append(messages, map[string]interface{}{
		"role":    "system",
		"content": system,
	})

	// Context messages
	for _, msg := range req.Context {
		messages = append(messages, map[string]interface{}{
			"role":    msg.Role,
			"content": msg.Content,
		})
	}

	// User prompt
	messages = append(messages, map[string]interface{}{
		"role":    "user",
		"content": req.Prompt,
	})

	// Build SmartRouter request
	chatReq := &services.OmegaChatRequest{
		Model:       req.Model,
		Messages:    messages,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
		Stream:      req.Stream,
	}

	// Route through SmartRouter
	if h.smartRouter == nil {
		c.JSON(503, gin.H{"error": "swarm_unavailable", "message": "AI swarm is starting up. Try again in a moment."})
		return
	}

	decision, err := h.smartRouter.Route(c.Request.Context(), chatReq)
	if err != nil {
		log.Printf("[SwarmEmbed] Error: %v", err)
		c.JSON(502, gin.H{"error": "inference_failed", "message": "The swarm could not process your request. Please try again."})
		return
	}

	// Handle streaming response
	if req.Stream && decision.StreamResponse != nil {
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Swarm-Tier", decision.TierName)
		c.Header("X-Swarm-Model", decision.ActualModel)
		c.Header("X-Transaction-ID", decision.TransactionID)

		c.Stream(func(w io.Writer) bool {
			buf := make([]byte, 4096)
			n, err := decision.StreamResponse.Body.Read(buf)
			if n > 0 {
				w.Write(buf[:n])
			}
			return err == nil
		})
		decision.StreamResponse.Body.Close()
		return
	}

	// Non-streaming response
	c.JSON(200, SwarmInferResponse{
		Response:      decision.Response,
		Model:         decision.ActualModel,
		Tier:          decision.Tier,
		Sovereign:     decision.Sovereign,
		CostGSTD:      decision.CostGSTD,
		LatencyMs:     decision.LatencyMs,
		TransactionID: decision.TransactionID,
		Usage: SwarmUsage{
			PromptTokens:     decision.PromptTokens,
			CompletionTokens: decision.CompletionTokens,
			TotalTokens:      decision.TotalTokens,
		},
	})
}

// HandleInfo returns swarm capabilities and available models.
// GET /api/v1/swarm/info
func (h *SwarmEmbedHandler) HandleInfo(c *gin.Context) {
	models := []map[string]interface{}{
		{"id": "omega-auto", "name": "Auto (Sovereign Router)", "tier": "L2", "sovereign": true, "description": "Automatically routes to the best sovereign model"},
		{"id": "flash", "name": "Flash", "tier": "L2", "sovereign": true, "description": "Fast coding & general tasks (Qwen 2.5)"},
		{"id": "pro", "name": "Pro", "tier": "L2", "sovereign": true, "description": "Balanced intelligence (Llama 3.1)"},
		{"id": "ultra", "name": "Ultra", "tier": "L2", "sovereign": true, "description": "Deep reasoning (DeepSeek R1)"},
	}

	var sovereignty map[string]interface{}
	if h.smartRouter != nil {
		sovereignty = h.smartRouter.GetSovereigntyMetrics()
	}

	c.JSON(200, gin.H{
		"name":        "GSTD Swarm AI",
		"version":     "1.0.0",
		"description": "Universal, sovereign AI swarm — embed anywhere, run everywhere",
		"models":      models,
		"endpoints": map[string]string{
			"infer":     "POST /api/v1/swarm/infer",
			"info":      "GET  /api/v1/swarm/info",
			"widget_js": "GET  /api/v1/swarm/widget.js",
			"models":    "GET  /api/v1/models",
		},
		"protocols": []string{"REST", "SSE (streaming)", "WebSocket"},
		"embed": map[string]string{
			"html":   `<script src="https://api.gstdtoken.com/api/v1/swarm/widget.js"></script>`,
			"iframe": `<iframe src="https://chat.gstdtoken.com/embed" width="400" height="600"></iframe>`,
			"curl":   `curl -X POST https://api.gstdtoken.com/api/v1/swarm/infer -H "Content-Type: application/json" -d '{"prompt":"Hello!"}'`,
		},
		"sovereignty": sovereignty,
		"limits": map[string]interface{}{
			"anonymous": map[string]interface{}{
				"max_tokens":     512,
				"max_prompt":     10000,
				"rate_limit":     "10 req/min",
				"streaming":      false,
				"context_length": 3,
			},
			"authenticated": map[string]interface{}{
				"max_tokens":     4096,
				"max_prompt":     100000,
				"rate_limit":     "60 req/min",
				"streaming":      true,
				"context_length": "unlimited",
			},
		},
	})
}

// HandleWidgetJS serves the embeddable JavaScript widget.
// GET /api/v1/swarm/widget.js
func (h *SwarmEmbedHandler) HandleWidgetJS(c *gin.Context) {
	c.Header("Content-Type", "application/javascript; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600")
	c.Header("Access-Control-Allow-Origin", "*")
	c.String(200, swarmWidgetJS)
}

// SetupSwarmEmbedRoutes registers the universal swarm API routes.
func SetupSwarmEmbedRoutes(router *gin.RouterGroup, handler *SwarmEmbedHandler) {
	swarm := router.Group("/swarm")
	{
		// Public CORS-open endpoints
		swarm.OPTIONS("/infer", func(c *gin.Context) {
			c.Header("Access-Control-Allow-Origin", "*")
			c.Header("Access-Control-Allow-Methods", "POST, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
			c.Header("Access-Control-Max-Age", "86400")
			c.Status(204)
		})
		swarm.POST("/infer", swarmCORSMiddleware(), handler.HandleInfer)
		swarm.GET("/info", swarmCORSMiddleware(), handler.HandleInfo)
		swarm.GET("/widget.js", handler.HandleWidgetJS)
	}
	log.Printf("🌐 Swarm Embed API registered: /swarm/infer, /swarm/info, /swarm/widget.js")
}

// swarmCORSMiddleware allows requests from any origin for embedding.
func swarmCORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			origin = "*"
		}
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Vary", "Origin")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// extractAPIKey extracts API key from various sources.
func extractSwarmAPIKey(c *gin.Context) string {
	// 1. Authorization: Bearer <key>
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	// 2. X-API-Key header
	if key := c.GetHeader("X-API-Key"); key != "" {
		return key
	}
	// 3. Query parameter
	if key := c.Query("api_key"); key != "" {
		return key
	}
	return ""
}

// swarmWidgetJS is the embeddable JavaScript widget source.
const swarmWidgetJS = `/**
 * GSTD Swarm AI — Universal Embeddable Widget
 * Drop this script on any site to add sovereign AI chat.
 *
 * Usage:
 *   <script src="https://api.gstdtoken.com/api/v1/swarm/widget.js"></script>
 *
 * Or with options:
 *   <script src="https://api.gstdtoken.com/api/v1/swarm/widget.js"
 *     data-api-key="gstd_sk_..."
 *     data-theme="dark"
 *     data-position="bottom-right"
 *     data-title="AI Assistant">
 *   </script>
 *
 * Web Component:
 *   <gstd-swarm api-key="..." theme="dark"></gstd-swarm>
 *
 * JavaScript API:
 *   const response = await GSTDSwarm.infer("Hello!");
 *   console.log(response.response);
 */
(function() {
  'use strict';

  const SWARM_API = (document.currentScript && document.currentScript.getAttribute('data-api-url'))
    || 'https://api.gstdtoken.com/api/v1/swarm';

  const CONFIG = {
    apiKey: document.currentScript?.getAttribute('data-api-key') || '',
    theme: document.currentScript?.getAttribute('data-theme') || 'dark',
    position: document.currentScript?.getAttribute('data-position') || 'bottom-right',
    title: document.currentScript?.getAttribute('data-title') || 'GSTD AI',
    autoOpen: document.currentScript?.getAttribute('data-auto-open') === 'true',
  };

  // ═══ Core API ═══

  class GSTDSwarmAPI {
    constructor(apiKey) {
      this.apiKey = apiKey || '';
      this.apiUrl = SWARM_API;
    }

    async infer(prompt, options = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = 'Bearer ' + this.apiKey;

      const body = {
        prompt: prompt,
        model: options.model || 'omega-auto',
        system: options.system || '',
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1024,
        context: options.context || [],
      };

      const resp = await fetch(this.apiUrl + '/infer', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || 'Swarm inference failed');
      }

      return resp.json();
    }

    async info() {
      const resp = await fetch(this.apiUrl + '/info');
      return resp.json();
    }
  }

  // ═══ Chat Widget UI ═══

  class GSTDSwarmWidget {
    constructor(config) {
      this.config = config;
      this.api = new GSTDSwarmAPI(config.apiKey);
      this.isOpen = config.autoOpen || false;
      this.messages = [];
      this.context = [];
      this.render();
    }

    render() {
      const isDark = this.config.theme === 'dark';
      const pos = this.config.position;

      // Inject styles
      const style = document.createElement('style');
      style.textContent = ` + "`" + `
        .gstd-swarm-fab {
          position: fixed;
          ${pos.includes('right') ? 'right: 20px' : 'left: 20px'};
          ${pos.includes('top') ? 'top: 20px' : 'bottom: 20px'};
          width: 56px; height: 56px; border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
          border: none; cursor: pointer; box-shadow: 0 4px 20px rgba(99,102,241,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 99999; transition: all 0.3s ease;
        }
        .gstd-swarm-fab:hover { transform: scale(1.1); box-shadow: 0 6px 30px rgba(99,102,241,0.6); }
        .gstd-swarm-fab svg { width: 28px; height: 28px; fill: white; }

        .gstd-swarm-panel {
          position: fixed;
          ${pos.includes('right') ? 'right: 20px' : 'left: 20px'};
          ${pos.includes('top') ? 'top: 80px' : 'bottom: 80px'};
          width: 380px; max-height: 520px;
          background: ${isDark ? '#0f0f23' : '#ffffff'};
          border: 1px solid ${isDark ? 'rgba(99,102,241,0.3)' : '#e5e7eb'};
          border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.3);
          display: flex; flex-direction: column; z-index: 99998;
          font-family: 'Inter', -apple-system, sans-serif;
          overflow: hidden; transition: all 0.3s ease;
        }
        .gstd-swarm-panel.hidden { opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none; }

        .gstd-swarm-header {
          padding: 14px 16px; display: flex; align-items: center; gap: 10px;
          background: ${isDark ? 'rgba(99,102,241,0.1)' : '#f3f4ff'};
          border-bottom: 1px solid ${isDark ? 'rgba(99,102,241,0.2)' : '#e5e7eb'};
        }
        .gstd-swarm-header .dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; animation: gstd-pulse 2s infinite; }
        .gstd-swarm-header .title { font-weight: 600; font-size: 14px; color: ${isDark ? '#e2e8f0' : '#1e293b'}; flex: 1; }
        .gstd-swarm-header .badge { font-size: 10px; background: rgba(99,102,241,0.2); color: #818cf8; padding: 2px 8px; border-radius: 10px; }

        .gstd-swarm-messages {
          flex: 1; overflow-y: auto; padding: 12px; min-height: 200px; max-height: 340px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .gstd-swarm-msg {
          max-width: 85%; padding: 10px 14px; border-radius: 14px;
          font-size: 13px; line-height: 1.5; word-break: break-word;
        }
        .gstd-swarm-msg.user {
          align-self: flex-end;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white; border-bottom-right-radius: 4px;
        }
        .gstd-swarm-msg.assistant {
          align-self: flex-start;
          background: ${isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'};
          color: ${isDark ? '#e2e8f0' : '#1e293b'}; border-bottom-left-radius: 4px;
        }
        .gstd-swarm-msg .meta { font-size: 10px; color: ${isDark ? '#64748b' : '#94a3b8'}; margin-top: 4px; }

        .gstd-swarm-input-area {
          padding: 12px; display: flex; gap: 8px;
          border-top: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'};
        }
        .gstd-swarm-input-area input {
          flex: 1; padding: 10px 14px; border-radius: 12px;
          border: 1px solid ${isDark ? 'rgba(99,102,241,0.3)' : '#d1d5db'};
          background: ${isDark ? 'rgba(255,255,255,0.04)' : '#fff'};
          color: ${isDark ? '#e2e8f0' : '#1e293b'}; font-size: 13px; outline: none;
        }
        .gstd-swarm-input-area input:focus { border-color: #6366f1; }
        .gstd-swarm-input-area button {
          padding: 10px 16px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white; font-weight: 600; cursor: pointer; font-size: 13px;
          transition: all 0.2s;
        }
        .gstd-swarm-input-area button:hover { transform: scale(1.05); }
        .gstd-swarm-input-area button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .gstd-swarm-footer {
          padding: 6px 12px; text-align: center; font-size: 10px;
          color: ${isDark ? '#475569' : '#94a3b8'};
        }
        .gstd-swarm-footer a { color: #818cf8; text-decoration: none; }

        @keyframes gstd-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes gstd-typing { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }
        .gstd-typing-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #818cf8; margin: 0 2px; animation: gstd-typing 1.4s infinite; }
        .gstd-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .gstd-typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @media (max-width: 480px) {
          .gstd-swarm-panel { width: calc(100vw - 32px); left: 16px; right: 16px; max-height: 70vh; }
        }
      ` + "`" + `;
      document.head.appendChild(style);

      // FAB button
      this.fab = document.createElement('button');
      this.fab.className = 'gstd-swarm-fab';
      this.fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
      this.fab.onclick = () => this.toggle();
      document.body.appendChild(this.fab);

      // Chat panel
      this.panel = document.createElement('div');
      this.panel.className = 'gstd-swarm-panel' + (this.isOpen ? '' : ' hidden');
      this.panel.innerHTML = ` + "`" + `
        <div class="gstd-swarm-header">
          <div class="dot"></div>
          <div class="title">${this.config.title}</div>
          <div class="badge">Sovereign AI</div>
        </div>
        <div class="gstd-swarm-messages" id="gstd-messages">
          <div class="gstd-swarm-msg assistant">
            👋 Hi! I'm GSTD Swarm AI — a sovereign, decentralized AI. Ask me anything!
          </div>
        </div>
        <div class="gstd-swarm-input-area">
          <input type="text" id="gstd-input" placeholder="Ask the Swarm..." autocomplete="off" />
          <button id="gstd-send">Send</button>
        </div>
        <div class="gstd-swarm-footer">
          Powered by <a href="https://gstdtoken.com" target="_blank">GSTD Swarm</a> · Sovereign AI
        </div>
      ` + "`" + `;
      document.body.appendChild(this.panel);

      // Event handlers
      const input = this.panel.querySelector('#gstd-input');
      const sendBtn = this.panel.querySelector('#gstd-send');
      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        this.sendMessage(text);
      };
      sendBtn.onclick = send;
      input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
    }

    toggle() {
      this.isOpen = !this.isOpen;
      this.panel.classList.toggle('hidden', !this.isOpen);
      if (this.isOpen) {
        this.panel.querySelector('#gstd-input').focus();
      }
    }

    addMessage(role, content, meta) {
      const messagesEl = this.panel.querySelector('#gstd-messages');
      const msg = document.createElement('div');
      msg.className = 'gstd-swarm-msg ' + role;
      msg.textContent = content;
      if (meta) {
        const metaEl = document.createElement('div');
        metaEl.className = 'meta';
        metaEl.textContent = meta;
        msg.appendChild(metaEl);
      }
      messagesEl.appendChild(msg);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return msg;
    }

    addTypingIndicator() {
      const messagesEl = this.panel.querySelector('#gstd-messages');
      const indicator = document.createElement('div');
      indicator.className = 'gstd-swarm-msg assistant';
      indicator.id = 'gstd-typing';
      indicator.innerHTML = '<span class="gstd-typing-dot"></span><span class="gstd-typing-dot"></span><span class="gstd-typing-dot"></span>';
      messagesEl.appendChild(indicator);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    removeTypingIndicator() {
      const el = this.panel.querySelector('#gstd-typing');
      if (el) el.remove();
    }

    async sendMessage(text) {
      this.addMessage('user', text);
      this.context.push({ role: 'user', content: text });

      const sendBtn = this.panel.querySelector('#gstd-send');
      sendBtn.disabled = true;
      this.addTypingIndicator();

      try {
        const result = await this.api.infer(text, { context: this.context.slice(-6) });
        this.removeTypingIndicator();
        const meta = result.sovereign ? '🛡️ Sovereign' : '☁️ Cloud';
        this.addMessage('assistant', result.response, meta + ' · ' + result.model + ' · ' + result.latency_ms + 'ms');
        this.context.push({ role: 'assistant', content: result.response });
      } catch (err) {
        this.removeTypingIndicator();
        this.addMessage('assistant', '⚠️ ' + (err.message || 'Something went wrong. Please try again.'));
      }

      sendBtn.disabled = false;
      this.panel.querySelector('#gstd-input').focus();
    }
  }

  // ═══ Web Component ═══

  class GSTDSwarmElement extends HTMLElement {
    connectedCallback() {
      const config = {
        apiKey: this.getAttribute('api-key') || '',
        theme: this.getAttribute('theme') || 'dark',
        position: this.getAttribute('position') || 'bottom-right',
        title: this.getAttribute('title') || 'GSTD AI',
        autoOpen: this.getAttribute('auto-open') === 'true',
      };
      this._widget = new GSTDSwarmWidget(config);
    }
  }

  if (typeof customElements !== 'undefined') {
    customElements.define('gstd-swarm', GSTDSwarmElement);
  }

  // ═══ Global API ═══

  window.GSTDSwarm = new GSTDSwarmAPI(CONFIG.apiKey);
  window.GSTDSwarmWidget = GSTDSwarmWidget;

  // Auto-initialize widget if script tag has data attributes
  if (document.currentScript && document.currentScript.hasAttribute('data-theme')) {
    document.addEventListener('DOMContentLoaded', () => {
      new GSTDSwarmWidget(CONFIG);
    });
  }
})();
`
