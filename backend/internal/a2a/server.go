// Package a2a implements the Agent-to-Agent protocol for GSTD swarm communication.
// It handles task broadcasting, claiming, heartbeats, results, and inter-node messaging.
package a2a

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// ─── Message Types ──────────────────────────────────────────────────────────

type MessageType string

const (
	MsgAgentHello      MessageType = "AGENT_HELLO"
	MsgGenesisVerify   MessageType = "GENESIS_VERIFY"
	MsgTaskBroadcast   MessageType = "TASK_BROADCAST"
	MsgTaskClaim       MessageType = "TASK_CLAIM"
	MsgTaskHeartbeat   MessageType = "TASK_HEARTBEAT"
	MsgTaskResult      MessageType = "TASK_RESULT"
	MsgMemoryStore     MessageType = "MEMORY_STORE"
	MsgMemoryFetch     MessageType = "MEMORY_FETCH"
	MsgConsensusVote   MessageType = "CONSENSUS_VOTE"
	MsgRewardSettle    MessageType = "REWARD_SETTLE"
	MsgLearningGrad    MessageType = "LEARNING_GRADIENT"
)

// ─── Core Structures ────────────────────────────────────────────────────────

// Envelope wraps every A2A message with routing and authentication metadata.
type Envelope struct {
	ID        string      `json:"id"`
	Type      MessageType `json:"type"`
	From      string      `json:"from"`       // NodeID
	To        string      `json:"to"`         // NodeID or "*" for broadcast
	Timestamp int64       `json:"timestamp"`
	Signature []byte      `json:"signature"`  // Ed25519 of payload
	Payload   json.RawMessage `json:"payload"`
}

// AgentHello is sent when a node first joins the network.
type AgentHello struct {
	NodeID       string   `json:"node_id"`
	NodeType     string   `json:"node_type"`     // edge, cpu, gpu, head
	PublicKey    []byte   `json:"public_key"`
	Capabilities []string `json:"capabilities"`  // llm, embedding, vision, code
	GenesisHash  string   `json:"genesis_hash"`
	Region       string   `json:"region"`
	MaxCPU       int      `json:"max_cpu"`
	MaxMemGB     int      `json:"max_mem_gb"`
	Version      string   `json:"version"`
}

// TaskBroadcast announces a new task to the swarm.
type TaskBroadcast struct {
	TaskID       string            `json:"task_id"`
	Model        string            `json:"model"`
	Prompt       string            `json:"prompt"`
	Priority     int               `json:"priority"`    // 0=low, 1=normal, 2=high
	MaxLatencyMs int64             `json:"max_latency_ms"`
	Requirements NodeRequirements  `json:"requirements"`
	PriceTON     float64           `json:"price_ton"`
	GSTDBonus    float64           `json:"gstd_bonus"`
	ClientAddr   string            `json:"client_addr"` // TON wallet
}

// NodeRequirements specifies what a node needs to accept a task.
type NodeRequirements struct {
	MinVRAMGB       int      `json:"min_vram_gb,omitempty"`
	Capabilities    []string `json:"capabilities,omitempty"`
	GenesisVerified bool     `json:"genesis_verified"`
	MinReputation   float64  `json:"min_reputation"`
}

// TaskClaim is sent by a node to claim a broadcast task.
type TaskClaim struct {
	TaskID       string  `json:"task_id"`
	NodeID       string  `json:"node_id"`
	EstimatedMs  int64   `json:"estimated_ms"`
	Reputation   float64 `json:"reputation"`
}

// TaskHeartbeat reports progress on an in-progress task.
type TaskHeartbeat struct {
	TaskID     string  `json:"task_id"`
	NodeID     string  `json:"node_id"`
	Progress   float64 `json:"progress"`   // 0.0-1.0
	TokensGen  int     `json:"tokens_gen"` // tokens generated so far
}

// TaskResult contains the completed task output.
type TaskResult struct {
	TaskID       string  `json:"task_id"`
	NodeID       string  `json:"node_id"`
	Content      string  `json:"content"`
	TokensUsed   int     `json:"tokens_used"`
	LatencyMs    int64   `json:"latency_ms"`
	QualityScore float64 `json:"quality_score"` // self-assessed 0.0-1.0
	ModelUsed    string  `json:"model_used"`
}

// ─── A2A Server ─────────────────────────────────────────────────────────────

// Server is the main A2A protocol handler.
type Server struct {
	nodeID     string
	privateKey ed25519.PrivateKey
	redis      *redis.Client

	// Task management
	tasks       map[string]*TaskBroadcast
	taskClaims  map[string][]TaskClaim
	taskResults map[string]*TaskResult
	mu          sync.RWMutex

	// Node registry (in-memory cache, backed by DB)
	nodes   map[string]*AgentHello
	nodesMu sync.RWMutex

	// Handlers
	onTaskReceived  func(ctx context.Context, task *TaskBroadcast) error
	onResultReady   func(ctx context.Context, result *TaskResult) error
}

// NewServer creates a new A2A protocol server.
func NewServer(nodeID string, privKey ed25519.PrivateKey, redisClient *redis.Client) *Server {
	return &Server{
		nodeID:      nodeID,
		privateKey:  privKey,
		redis:       redisClient,
		tasks:       make(map[string]*TaskBroadcast),
		taskClaims:  make(map[string][]TaskClaim),
		taskResults: make(map[string]*TaskResult),
		nodes:       make(map[string]*AgentHello),
	}
}

// SetTaskHandler sets the callback for incoming tasks.
func (s *Server) SetTaskHandler(handler func(ctx context.Context, task *TaskBroadcast) error) {
	s.onTaskReceived = handler
}

// SetResultHandler sets the callback for completed results.
func (s *Server) SetResultHandler(handler func(ctx context.Context, result *TaskResult) error) {
	s.onResultReady = handler
}

// ─── Publishing ─────────────────────────────────────────────────────────────

// BroadcastTask publishes a new task to the swarm via Redis PubSub.
func (s *Server) BroadcastTask(ctx context.Context, task *TaskBroadcast) error {
	if task.TaskID == "" {
		task.TaskID = uuid.New().String()
	}

	payload, err := json.Marshal(task)
	if err != nil {
		return fmt.Errorf("marshal task: %w", err)
	}

	env := Envelope{
		ID:        uuid.New().String(),
		Type:      MsgTaskBroadcast,
		From:      s.nodeID,
		To:        "*",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	}
	env.Signature = ed25519.Sign(s.privateKey, payload)

	data, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	s.mu.Lock()
	s.tasks[task.TaskID] = task
	s.mu.Unlock()

	return s.redis.Publish(ctx, "gstd:a2a:tasks", data).Err()
}

// SubmitResult publishes a task result.
func (s *Server) SubmitResult(ctx context.Context, result *TaskResult) error {
	payload, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal result: %w", err)
	}

	env := Envelope{
		ID:        uuid.New().String(),
		Type:      MsgTaskResult,
		From:      s.nodeID,
		To:        "*",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	}
	env.Signature = ed25519.Sign(s.privateKey, payload)

	data, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	return s.redis.Publish(ctx, "gstd:a2a:results", data).Err()
}

// ClaimTask sends a task claim from this node.
func (s *Server) ClaimTask(ctx context.Context, claim *TaskClaim) error {
	claim.NodeID = s.nodeID

	payload, err := json.Marshal(claim)
	if err != nil {
		return fmt.Errorf("marshal claim: %w", err)
	}

	env := Envelope{
		ID:        uuid.New().String(),
		Type:      MsgTaskClaim,
		From:      s.nodeID,
		To:        "*",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	}
	env.Signature = ed25519.Sign(s.privateKey, payload)

	data, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	return s.redis.Publish(ctx, "gstd:a2a:claims", data).Err()
}

// SendHeartbeat publishes a task progress heartbeat.
func (s *Server) SendHeartbeat(ctx context.Context, hb *TaskHeartbeat) error {
	hb.NodeID = s.nodeID

	payload, err := json.Marshal(hb)
	if err != nil {
		return fmt.Errorf("marshal heartbeat: %w", err)
	}

	env := Envelope{
		ID:        uuid.New().String(),
		Type:      MsgTaskHeartbeat,
		From:      s.nodeID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	}

	data, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	return s.redis.Publish(ctx, "gstd:a2a:heartbeats", data).Err()
}

// RegisterNode announces this node to the network.
func (s *Server) RegisterNode(ctx context.Context, hello *AgentHello) error {
	hello.NodeID = s.nodeID

	payload, err := json.Marshal(hello)
	if err != nil {
		return fmt.Errorf("marshal hello: %w", err)
	}

	env := Envelope{
		ID:        uuid.New().String(),
		Type:      MsgAgentHello,
		From:      s.nodeID,
		To:        "*",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	}
	env.Signature = ed25519.Sign(s.privateKey, payload)

	data, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("marshal envelope: %w", err)
	}

	return s.redis.Publish(ctx, "gstd:a2a:registry", data).Err()
}

// ─── Listening ──────────────────────────────────────────────────────────────

// Listen subscribes to all A2A channels and processes incoming messages.
func (s *Server) Listen(ctx context.Context) error {
	pubsub := s.redis.Subscribe(ctx,
		"gstd:a2a:tasks",
		"gstd:a2a:claims",
		"gstd:a2a:results",
		"gstd:a2a:heartbeats",
		"gstd:a2a:registry",
	)
	defer pubsub.Close()

	ch := pubsub.Channel()
	log.Printf("[A2A] Listening on all channels (node=%s)", s.nodeID)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg := <-ch:
			go s.handleMessage(ctx, msg)
		}
	}
}

func (s *Server) handleMessage(ctx context.Context, msg *redis.Message) {
	var env Envelope
	if err := json.Unmarshal([]byte(msg.Payload), &env); err != nil {
		log.Printf("[A2A] Invalid message on %s: %v", msg.Channel, err)
		return
	}

	// Skip messages from ourselves
	if env.From == s.nodeID {
		return
	}

	switch env.Type {
	case MsgTaskBroadcast:
		var task TaskBroadcast
		if err := json.Unmarshal(env.Payload, &task); err != nil {
			log.Printf("[A2A] Invalid task payload: %v", err)
			return
		}
		if s.onTaskReceived != nil {
			if err := s.onTaskReceived(ctx, &task); err != nil {
				log.Printf("[A2A] Task handler error: %v", err)
			}
		}

	case MsgTaskClaim:
		var claim TaskClaim
		if err := json.Unmarshal(env.Payload, &claim); err != nil {
			return
		}
		s.mu.Lock()
		s.taskClaims[claim.TaskID] = append(s.taskClaims[claim.TaskID], claim)
		s.mu.Unlock()

	case MsgTaskResult:
		var result TaskResult
		if err := json.Unmarshal(env.Payload, &result); err != nil {
			return
		}
		s.mu.Lock()
		s.taskResults[result.TaskID] = &result
		s.mu.Unlock()
		if s.onResultReady != nil {
			if err := s.onResultReady(ctx, &result); err != nil {
				log.Printf("[A2A] Result handler error: %v", err)
			}
		}

	case MsgAgentHello:
		var hello AgentHello
		if err := json.Unmarshal(env.Payload, &hello); err != nil {
			return
		}
		s.nodesMu.Lock()
		s.nodes[hello.NodeID] = &hello
		s.nodesMu.Unlock()
		log.Printf("[A2A] Node registered: %s (type=%s, caps=%v)", hello.NodeID, hello.NodeType, hello.Capabilities)

	case MsgTaskHeartbeat:
		// Track heartbeats for monitoring
		var hb TaskHeartbeat
		if err := json.Unmarshal(env.Payload, &hb); err != nil {
			return
		}
		log.Printf("[A2A] Heartbeat: task=%s node=%s progress=%.1f%%", hb.TaskID, hb.NodeID, hb.Progress*100)
	}
}

// ─── Task Management ────────────────────────────────────────────────────────

// WaitResult waits for a task result with timeout.
func (s *Server) WaitResult(ctx context.Context, taskID string, timeout time.Duration) (*TaskResult, error) {
	deadline := time.After(timeout)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-deadline:
			return nil, fmt.Errorf("timeout waiting for result of task %s", taskID)
		case <-ticker.C:
			s.mu.RLock()
			result, ok := s.taskResults[taskID]
			s.mu.RUnlock()
			if ok {
				return result, nil
			}
		}
	}
}

// GetActiveNodes returns all known active nodes.
func (s *Server) GetActiveNodes() []*AgentHello {
	s.nodesMu.RLock()
	defer s.nodesMu.RUnlock()

	nodes := make([]*AgentHello, 0, len(s.nodes))
	for _, n := range s.nodes {
		nodes = append(nodes, n)
	}
	return nodes
}

// GetNodeByID returns a specific node's info.
func (s *Server) GetNodeByID(nodeID string) (*AgentHello, bool) {
	s.nodesMu.RLock()
	defer s.nodesMu.RUnlock()
	node, ok := s.nodes[nodeID]
	return node, ok
}
