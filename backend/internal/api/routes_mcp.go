package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── MCP Tool Definitions ───────────────────────────────────────────────────

// MCPToolDef describes a tool available through the GSTD MCP endpoint
type MCPToolDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}

// MCP Agent Card for .well-known/agent.json (MCP/A2A discovery)
type AgentCard struct {
	Name         string            `json:"name"`
	Description  string            `json:"description"`
	URL          string            `json:"url"`
	Version      string            `json:"version"`
	Protocol     string            `json:"protocol"`
	Capabilities AgentCapabilities `json:"capabilities"`
	Provider     AgentProvider     `json:"provider"`
	Monetization AgentMonetization `json:"monetization"`
}

type AgentCapabilities struct {
	Tools     []string `json:"tools"`
	Resources []string `json:"resources"`
	Transport []string `json:"transport"`
}

type AgentProvider struct {
	Organization string `json:"organization"`
	Website      string `json:"website"`
	Contact      string `json:"contact"`
}

type AgentMonetization struct {
	Currency        string   `json:"currency"`
	PricePerCall    float64  `json:"price_per_call_gstd"`
	FreeCallsPerDay int      `json:"free_calls_per_day"`
	PaymentChains   []string `json:"payment_chains"`
}

// SetupMCPRoutes registers MCP-related endpoints:
// - /.well-known/agent.json   → Agent discovery (MCP + A2A)
// - /api/v1/mcp/tools         → List available MCP tools
// - /api/v1/mcp/call          → Execute an MCP tool (metered)
func SetupMCPRoutes(router *gin.Engine, v1 *gin.RouterGroup) {
	log.Printf("🔌 MCP Protocol: Registering endpoints...")

	// .well-known/agent.json — standard MCP/A2A agent discovery
	router.GET("/.well-known/agent.json", handleAgentCard)

	// MCP tool listing (compatible with MCP tools/list)
	v1.GET("/mcp/tools", handleMCPToolsList)

	// MCP tool execution (compatible with MCP tools/call)
	v1.POST("/mcp/call", handleMCPCall)

	// MCP server info
	v1.GET("/mcp/info", handleMCPInfo)

	log.Printf("🔌 MCP Protocol: ACTIVE — /.well-known/agent.json, /api/v1/mcp/*")
}

// ─── Handlers ───────────────────────────────────────────────────────────────

func handleAgentCard(c *gin.Context) {
	card := AgentCard{
		Name:        "GSTD Sovereign AI Network",
		Description: "Decentralized planetary AI brain — 80+ nodes, 29 global signals, gold-backed tokens. Access sovereign AI compute, crypto analytics, cross-chain bridge, network monitoring via MCP.",
		URL:         "https://app.gstdtoken.com",
		Version:     "1.0.0",
		Protocol:    "MCP/1.0 + A2A/1.0",
		Capabilities: AgentCapabilities{
			Tools: []string{
				"gstd_chat",
				"gstd_network_stats",
				"gstd_price",
				"gstd_monitor_signals",
				"gstd_live_feed",
				"gstd_bridge_quote",
				"gstd_staking",
				"gstd_node_check",
				"gstd_deploy_instructions",
				"gstd_sovereignty_index",
				"gstd_leaderboard",
				"gstd_ecosystem",
			},
			Resources: []string{"gstd://about"},
			Transport: []string{"stdio", "sse", "http"},
		},
		Provider: AgentProvider{
			Organization: "GSTD Foundation",
			Website:      "https://app.gstdtoken.com",
			Contact:      "https://t.me/goldstandardcoin",
		},
		Monetization: AgentMonetization{
			Currency:        "GSTD",
			PricePerCall:    0.01,
			FreeCallsPerDay: 100,
			PaymentChains:   []string{"TON", "Solana", "XRPL"},
		},
	}

	c.JSON(http.StatusOK, card)
}

func handleMCPInfo(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"server": gin.H{
			"name":    "gstd",
			"version": "1.0.0",
		},
		"protocol_version": "2024-11-05",
		"capabilities": gin.H{
			"tools":     gin.H{"listChanged": true},
			"resources": gin.H{"listChanged": true},
		},
		"install": gin.H{
			"npx":    "npx @gstd/mcp-server",
			"claude": map[string]interface{}{"command": "npx", "args": []string{"-y", "@gstd/mcp-server"}},
			"node":   "curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash",
		},
		"monetization": gin.H{
			"free_calls_per_day": 100,
			"price_per_call":     "0.01 GSTD",
			"payment_chains":     []string{"TON", "Solana", "XRPL"},
		},
	})
}

func handleMCPToolsList(c *gin.Context) {
	tools := []MCPToolDef{
		{
			Name:        "gstd_chat",
			Description: "Send a message to the GSTD Sovereign AI Hive Mind",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"message": map[string]string{"type": "string", "description": "Message to send"},
					"model":   map[string]string{"type": "string", "description": "AI tier: auto, fast, deep"},
				},
				"required": []string{"message"},
			},
		},
		{
			Name:        "gstd_network_stats",
			Description: "Get real-time network statistics: nodes, users, tasks, hashrate",
			InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		},
		{
			Name:        "gstd_price",
			Description: "Get GSTD token price, market cap, gold backing ratio",
			InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		},
		{
			Name:        "gstd_monitor_signals",
			Description: "Get 29 planetary-scale signals (climate, health, security, science)",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"category": map[string]string{"type": "string", "description": "Filter: all, Climate, Health, Security, Science, Society"},
				},
			},
		},
		{
			Name:        "gstd_live_feed",
			Description: "Get real-time event feed from the GSTD network",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"limit": map[string]interface{}{"type": "number", "description": "Number of events (max 50)", "default": 10},
				},
			},
		},
		{
			Name:        "gstd_bridge_quote",
			Description: "Get cross-chain bridge quote (TON ↔ Solana ↔ XRPL)",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"from_chain": map[string]string{"type": "string", "description": "Source: ton, solana, xrpl"},
					"to_chain":   map[string]string{"type": "string", "description": "Destination: ton, solana, xrpl"},
					"amount":     map[string]string{"type": "number", "description": "Amount of GSTD"},
				},
				"required": []string{"from_chain", "to_chain", "amount"},
			},
		},
		{
			Name:        "gstd_staking",
			Description: "Get staking info: validators, APY rates, TVL",
			InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		},
		{
			Name:        "gstd_node_check",
			Description: "Check health/status of a specific GSTD node",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"node_id": map[string]string{"type": "string", "description": "Node ID or public key"},
				},
				"required": []string{"node_id"},
			},
		},
		{
			Name:        "gstd_deploy_instructions",
			Description: "Get node deployment instructions for any OS",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"os": map[string]string{"type": "string", "description": "Target OS: linux, macos, docker, wsl"},
				},
			},
		},
		{
			Name:        "gstd_sovereignty_index",
			Description: "Get the GSTD AI Sovereignty Index (0-100%)",
			InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		},
		{
			Name:        "gstd_leaderboard",
			Description: "Get top node operators ranking",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"limit": map[string]interface{}{"type": "number", "description": "Number of entries", "default": 10},
				},
			},
		},
		{
			Name:        "gstd_ecosystem",
			Description: "Get full ecosystem overview: organism, market, neural, monetization",
			InputSchema: map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		},
	}

	c.JSON(http.StatusOK, gin.H{
		"tools":            tools,
		"total":            len(tools),
		"protocol_version": "2024-11-05",
		"server_time":      time.Now().UTC().Format(time.RFC3339),
	})
}

// handleMCPCall handles direct MCP tool execution via HTTP
// This enables node monetization — each call can be metered
func handleMCPCall(c *gin.Context) {
	var req struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
		return
	}

	// For now, redirect to appropriate internal API
	// In production, this would route through A2A swarm with GSTD payment
	c.JSON(http.StatusOK, gin.H{
		"jsonrpc": "2.0",
		"result": gin.H{
			"content": []gin.H{
				{
					"type": "text",
					"text": "Tool " + req.Name + " is available. For full MCP access, install the client: npx @gstd/mcp-server. For HTTP API, use the corresponding /api/v1/ endpoint directly.",
				},
			},
			"meta": gin.H{
				"node":           "platform",
				"metered":        true,
				"cost":           "0.01 GSTD",
				"free_remaining": 100,
			},
		},
	})
}
