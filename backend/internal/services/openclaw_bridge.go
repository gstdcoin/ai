package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// OpenClawBridgeService provides a standardized JSON-RPC interface for
// ClawHub.ai robotic agents to use GSTD as their primary Brain.
//
// OpenClaw robots can:
//   1. Register as compute nodes (physical actuators)
//   2. Receive tasks from the GSTD network
//   3. Report results with physical-world proofs
//   4. Earn GSTD for physical task completion
//   5. Use earned GSTD for inference (planning, vision, NLP)
//
// Protocol: JSON-RPC 2.0 over HTTP
// Authentication: x402 (GSTD token) or API Key
type OpenClawBridgeService struct {
	db             *sql.DB
	inferenceSvc   *InferenceService
	knowledgeSvc   *KnowledgeService
}

// ============================================================================
// JSON-RPC Types
// ============================================================================

// RPCRequest is a standard JSON-RPC 2.0 request
type RPCRequest struct {
	JSONRPC string          `json:"jsonrpc"` // Must be "2.0"
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
	ID      interface{}     `json:"id"`
}

// RPCResponse is a standard JSON-RPC 2.0 response
type RPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *RPCError   `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

// RPCError represents a JSON-RPC error
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ============================================================================
// OpenClaw Agent Types
// ============================================================================

// ClawAgent represents a physical robot registered on the network
type ClawAgent struct {
	AgentID        string   `json:"agent_id"`
	WalletAddress  string   `json:"wallet_address"`
	AgentType      string   `json:"agent_type"`       // manipulator, drone, mobile_robot, sensor_array
	Capabilities   []string `json:"capabilities"`      // pick_and_place, navigate, inspect, measure
	Location       *GeoPoint `json:"location,omitempty"`
	FirmwareVersion string  `json:"firmware_version"`
	Status         string   `json:"status"`            // online, busy, offline, maintenance
	TotalTasks     int      `json:"total_tasks"`
	TotalEarned    float64  `json:"total_earned_gstd"`
	TrustScore     float64  `json:"trust_score"`
	RegisteredAt   string   `json:"registered_at"`
}

type GeoPoint struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// ClawTask represents a physical task for a robot
type ClawTask struct {
	TaskID         string                 `json:"task_id"`
	TaskType       string                 `json:"task_type"`        // pick_and_place, inspect, navigate, custom
	Description    string                 `json:"description"`
	Parameters     map[string]interface{} `json:"parameters"`       // Task-specific params
	RewardGSTD     float64                `json:"reward_gstd"`
	RequesterWallet string               `json:"requester_wallet"`
	RequiredCapabilities []string         `json:"required_capabilities"`
	MaxDurationSec int                    `json:"max_duration_sec"`
	Status         string                 `json:"status"`
}

// ClawTaskResult represents the outcome of a physical task
type ClawTaskResult struct {
	TaskID         string                 `json:"task_id"`
	AgentID        string                 `json:"agent_id"`
	Success        bool                   `json:"success"`
	ResultData     map[string]interface{} `json:"result_data"`
	ProofImages    []string               `json:"proof_images,omitempty"` // URLs to before/after photos
	SensorReadings map[string]float64     `json:"sensor_readings,omitempty"`
	DurationSec    int                    `json:"duration_sec"`
	Signature      string                 `json:"signature"` // Ed25519 signature
}

func NewOpenClawBridgeService(db *sql.DB, inferenceSvc *InferenceService, knowledgeSvc *KnowledgeService) *OpenClawBridgeService {
	svc := &OpenClawBridgeService{db: db, inferenceSvc: inferenceSvc, knowledgeSvc: knowledgeSvc}
	svc.ensureSchema()
	return svc
}

// SetInferenceService wires the inference service for claw.think and claw.vision.
func (s *OpenClawBridgeService) SetInferenceService(inference *InferenceService) {
	s.inferenceSvc = inference
}

func (s *OpenClawBridgeService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS claw_agents (
			agent_id VARCHAR(64) PRIMARY KEY,
			wallet_address VARCHAR(128) NOT NULL,
			agent_type VARCHAR(32),
			capabilities JSONB DEFAULT '[]',
			latitude DECIMAL(10,6), longitude DECIMAL(10,6),
			firmware_version VARCHAR(32),
			status VARCHAR(16) DEFAULT 'online',
			total_tasks INTEGER DEFAULT 0,
			total_earned_gstd DECIMAL(18,8) DEFAULT 0,
			trust_score DECIMAL(4,2) DEFAULT 0.5,
			registered_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_claw_agents_status ON claw_agents(status);
		CREATE INDEX IF NOT EXISTS idx_claw_agents_wallet ON claw_agents(wallet_address);
		
		CREATE TABLE IF NOT EXISTS claw_tasks (
			task_id VARCHAR(64) PRIMARY KEY,
			task_type VARCHAR(32),
			description TEXT,
			parameters JSONB,
			reward_gstd DECIMAL(18,8),
			requester_wallet VARCHAR(128),
			assigned_agent VARCHAR(64),
			status VARCHAR(16) DEFAULT 'open',
			created_at TIMESTAMP DEFAULT NOW(),
			completed_at TIMESTAMP
		);
	`)
	log.Println("🤖 OpenClaw Bridge schema ensured")
}

// HandleRPC processes a JSON-RPC 2.0 request
func (s *OpenClawBridgeService) HandleRPC(ctx context.Context, req *RPCRequest) *RPCResponse {
	switch req.Method {

	// ===== Agent Management =====
	case "claw.register":
		return s.rpcRegisterAgent(ctx, req)
	case "claw.heartbeat":
		return s.rpcHeartbeat(ctx, req)
	case "claw.status":
		return s.rpcGetStatus(ctx, req)

	// ===== Task Operations =====
	case "claw.getAvailableTasks":
		return s.rpcGetTasks(ctx, req)
	case "claw.claimTask":
		return s.rpcClaimTask(ctx, req)
	case "claw.submitResult":
		return s.rpcSubmitResult(ctx, req)

	// ===== Intelligence =====
	case "claw.think":
		return s.rpcThink(ctx, req) // Use GSTD inference for planning
	case "claw.vision":
		return s.rpcVision(ctx, req) // Image analysis

	// ===== Network =====
	case "claw.getNetworkStats":
		return s.rpcNetworkStats(ctx, req)

	default:
		return &RPCResponse{
			JSONRPC: "2.0",
			Error:   &RPCError{Code: -32601, Message: fmt.Sprintf("method not found: %s", req.Method)},
			ID:      req.ID,
		}
	}
}

func (s *OpenClawBridgeService) rpcRegisterAgent(ctx context.Context, req *RPCRequest) *RPCResponse {
	var params struct {
		WalletAddress   string   `json:"wallet_address"`
		AgentType       string   `json:"agent_type"`
		Capabilities    []string `json:"capabilities"`
		FirmwareVersion string   `json:"firmware_version"`
		Latitude        float64  `json:"latitude"`
		Longitude       float64  `json:"longitude"`
	}
	json.Unmarshal(req.Params, &params)

	agentID := fmt.Sprintf("claw-%s-%d", params.AgentType, time.Now().UnixNano())
	capsJSON, _ := json.Marshal(params.Capabilities)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO claw_agents (agent_id, wallet_address, agent_type, capabilities, firmware_version, latitude, longitude)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (agent_id) DO UPDATE SET status = 'online', firmware_version = $5
	`, agentID, params.WalletAddress, params.AgentType, capsJSON, params.FirmwareVersion, params.Latitude, params.Longitude)

	if err != nil {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32000, Message: err.Error()}, ID: req.ID}
	}

	log.Printf("🤖 OpenClaw agent registered: %s (type=%s, caps=%v)", agentID, params.AgentType, params.Capabilities)
	return &RPCResponse{JSONRPC: "2.0", Result: map[string]interface{}{"agent_id": agentID, "status": "registered"}, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcHeartbeat(ctx context.Context, req *RPCRequest) *RPCResponse {
	var params struct{ AgentID string `json:"agent_id"` }
	json.Unmarshal(req.Params, &params)

	s.db.ExecContext(ctx, "UPDATE claw_agents SET status = 'online' WHERE agent_id = $1", params.AgentID)
	return &RPCResponse{JSONRPC: "2.0", Result: map[string]string{"status": "ok"}, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcGetStatus(ctx context.Context, req *RPCRequest) *RPCResponse {
	var params struct{ AgentID string `json:"agent_id"` }
	json.Unmarshal(req.Params, &params)

	var agent ClawAgent
	err := s.db.QueryRowContext(ctx, `
		SELECT agent_id, wallet_address, agent_type, status, total_tasks, total_earned_gstd, trust_score
		FROM claw_agents WHERE agent_id = $1
	`, params.AgentID).Scan(&agent.AgentID, &agent.WalletAddress, &agent.AgentType, &agent.Status, &agent.TotalTasks, &agent.TotalEarned, &agent.TrustScore)

	if err != nil {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32000, Message: "agent not found"}, ID: req.ID}
	}
	return &RPCResponse{JSONRPC: "2.0", Result: agent, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcGetTasks(ctx context.Context, req *RPCRequest) *RPCResponse {
	rows, _ := s.db.QueryContext(ctx, `
		SELECT task_id, task_type, description, reward_gstd, status
		FROM claw_tasks WHERE status = 'open'
		ORDER BY reward_gstd DESC LIMIT 20
	`)
	if rows == nil {
		return &RPCResponse{JSONRPC: "2.0", Result: []interface{}{}, ID: req.ID}
	}
	defer rows.Close()

	var tasks []map[string]interface{}
	for rows.Next() {
		var t struct{ ID, Type, Desc, Status string; Reward float64 }
		rows.Scan(&t.ID, &t.Type, &t.Desc, &t.Reward, &t.Status)
		tasks = append(tasks, map[string]interface{}{"task_id": t.ID, "task_type": t.Type, "description": t.Desc, "reward_gstd": t.Reward})
	}
	return &RPCResponse{JSONRPC: "2.0", Result: tasks, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcClaimTask(ctx context.Context, req *RPCRequest) *RPCResponse {
	var params struct {
		AgentID string `json:"agent_id"`
		TaskID  string `json:"task_id"`
	}
	json.Unmarshal(req.Params, &params)

	res, _ := s.db.ExecContext(ctx, `
		UPDATE claw_tasks SET status = 'claimed', assigned_agent = $1
		WHERE task_id = $2 AND status = 'open'
	`, params.AgentID, params.TaskID)

	rows, _ := res.RowsAffected()
	if rows == 0 {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32000, Message: "task not available"}, ID: req.ID}
	}

	return &RPCResponse{JSONRPC: "2.0", Result: map[string]string{"status": "claimed", "task_id": params.TaskID}, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcSubmitResult(ctx context.Context, req *RPCRequest) *RPCResponse {
	var result ClawTaskResult
	json.Unmarshal(req.Params, &result)

	// Get task reward
	var reward float64
	var requesterWallet string
	s.db.QueryRowContext(ctx, "SELECT reward_gstd, requester_wallet FROM claw_tasks WHERE task_id = $1", result.TaskID).Scan(&reward, &requesterWallet)

	if result.Success && reward > 0 {
		// Credit the agent's wallet
		var walletAddr string
		s.db.QueryRowContext(ctx, "SELECT wallet_address FROM claw_agents WHERE agent_id = $1", result.AgentID).Scan(&walletAddr)
		if walletAddr != "" {
			s.db.ExecContext(ctx, "UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1 WHERE wallet_address = $2", reward, walletAddr)
			s.db.ExecContext(ctx, "UPDATE claw_agents SET total_tasks = total_tasks + 1, total_earned_gstd = total_earned_gstd + $1 WHERE agent_id = $2", reward, result.AgentID)
		}
	}

	s.db.ExecContext(ctx, "UPDATE claw_tasks SET status = 'completed', completed_at = NOW() WHERE task_id = $1", result.TaskID)

	log.Printf("🤖 OpenClaw task completed: %s by %s (reward=%.4f GSTD, success=%v)", result.TaskID, result.AgentID, reward, result.Success)
	return &RPCResponse{JSONRPC: "2.0", Result: map[string]interface{}{"status": "accepted", "reward_gstd": reward}, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcThink(ctx context.Context, req *RPCRequest) *RPCResponse {
	var params struct {
		Prompt string `json:"prompt"`
	}
	_ = json.Unmarshal(req.Params, &params)
	if params.Prompt == "" {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32602, Message: "prompt required"}, ID: req.ID}
	}
	if s.inferenceSvc == nil {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32603, Message: "inference service unavailable"}, ID: req.ID}
	}
	prompt := params.Prompt
	if s.knowledgeSvc != nil {
		if insights, err := s.knowledgeSvc.SummarizeRecentInsights(ctx, 10); err == nil && insights != "" {
			prompt = "Recent Hive Insights (use for context):\n" + insights + "\n\nUser prompt: " + params.Prompt
		}
	}
	response, err := s.inferenceSvc.Think(ctx, prompt)
	if err != nil {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32000, Message: err.Error()}, ID: req.ID}
	}
	return &RPCResponse{JSONRPC: "2.0", Result: map[string]interface{}{
		"response": response,
		"model":    "qwen2.5-coder:7b",
		"status":   "ok",
	}, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcVision(ctx context.Context, req *RPCRequest) *RPCResponse {
	var params struct {
		Prompt string `json:"prompt"`
		Image  string `json:"image"` // base64-encoded image
	}
	_ = json.Unmarshal(req.Params, &params)
	if params.Prompt == "" {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32602, Message: "prompt required"}, ID: req.ID}
	}
	if s.inferenceSvc == nil {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32603, Message: "inference service unavailable"}, ID: req.ID}
	}
	response, err := s.inferenceSvc.Vision(ctx, params.Prompt, params.Image)
	if err != nil {
		return &RPCResponse{JSONRPC: "2.0", Error: &RPCError{Code: -32000, Message: err.Error()}, ID: req.ID}
	}
	return &RPCResponse{JSONRPC: "2.0", Result: map[string]interface{}{
		"response": response,
		"model":    "qwen2.5-coder:7b",
		"status":   "ok",
	}, ID: req.ID}
}

func (s *OpenClawBridgeService) rpcNetworkStats(ctx context.Context, req *RPCRequest) *RPCResponse {
	var totalAgents, onlineAgents int
	var totalEarned float64
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM claw_agents").Scan(&totalAgents)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM claw_agents WHERE status = 'online'").Scan(&onlineAgents)
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(total_earned_gstd), 0) FROM claw_agents").Scan(&totalEarned)

	return &RPCResponse{JSONRPC: "2.0", Result: map[string]interface{}{
		"total_agents":  totalAgents,
		"online_agents": onlineAgents,
		"total_earned":  totalEarned,
		"protocol":      "openclaw-gstd/1.0",
	}, ID: req.ID}
}
