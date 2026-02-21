package a2a

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func generateTestKeys(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	require.NoError(t, err)
	return pub, priv
}

func TestEnvelopeSerialization(t *testing.T) {
	_, priv := generateTestKeys(t)

	task := TaskBroadcast{
		TaskID:       "test-task-001",
		Model:        "llama-3-8b",
		Prompt:       "Hello, world!",
		Priority:     1,
		MaxLatencyMs: 3000,
		PriceTON:     0.05,
		GSTDBonus:    1.0,
		ClientAddr:   "EQTest...",
	}

	payload, err := json.Marshal(task)
	require.NoError(t, err)

	env := Envelope{
		ID:        "env-001",
		Type:      MsgTaskBroadcast,
		From:      "node-1",
		To:        "*",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
		Signature: ed25519.Sign(priv, payload),
	}

	// Serialize
	data, err := json.Marshal(env)
	require.NoError(t, err)

	// Deserialize
	var decoded Envelope
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, env.ID, decoded.ID)
	assert.Equal(t, MsgTaskBroadcast, decoded.Type)
	assert.Equal(t, "node-1", decoded.From)
	assert.Equal(t, "*", decoded.To)

	// Verify payload
	var decodedTask TaskBroadcast
	err = json.Unmarshal(decoded.Payload, &decodedTask)
	require.NoError(t, err)
	assert.Equal(t, "test-task-001", decodedTask.TaskID)
	assert.Equal(t, "llama-3-8b", decodedTask.Model)
	assert.Equal(t, 0.05, decodedTask.PriceTON)
}

func TestSignatureVerification(t *testing.T) {
	pub, priv := generateTestKeys(t)

	task := TaskBroadcast{TaskID: "sig-test", Model: "phi-3"}
	payload, err := json.Marshal(task)
	require.NoError(t, err)

	signature := ed25519.Sign(priv, payload)

	// Valid signature
	assert.True(t, ed25519.Verify(pub, payload, signature))

	// Tampered payload
	tamperedPayload := append([]byte{}, payload...)
	tamperedPayload[0] = tamperedPayload[0] ^ 0xFF
	assert.False(t, ed25519.Verify(pub, tamperedPayload, signature))
}

func TestAgentHelloSerialization(t *testing.T) {
	hello := AgentHello{
		NodeID:       "gpu-node-001",
		NodeType:     "gpu",
		Capabilities: []string{"llm", "vision", "code"},
		GenesisHash:  "abc123",
		Region:       "eu-west",
		MaxCPU:       32,
		MaxMemGB:     64,
		Version:      "1.0.0",
	}

	data, err := json.Marshal(hello)
	require.NoError(t, err)

	var decoded AgentHello
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, "gpu-node-001", decoded.NodeID)
	assert.Equal(t, "gpu", decoded.NodeType)
	assert.Contains(t, decoded.Capabilities, "llm")
	assert.Contains(t, decoded.Capabilities, "vision")
	assert.Equal(t, 32, decoded.MaxCPU)
	assert.Equal(t, 64, decoded.MaxMemGB)
}

func TestTaskClaimSerialization(t *testing.T) {
	claim := TaskClaim{
		TaskID:      "task-100",
		NodeID:      "worker-1",
		EstimatedMs: 2500,
		Reputation:  0.95,
	}

	data, err := json.Marshal(claim)
	require.NoError(t, err)

	var decoded TaskClaim
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, "task-100", decoded.TaskID)
	assert.Equal(t, int64(2500), decoded.EstimatedMs)
	assert.Equal(t, 0.95, decoded.Reputation)
}

func TestTaskResultSerialization(t *testing.T) {
	result := TaskResult{
		TaskID:       "task-200",
		NodeID:       "worker-2",
		Content:      "The answer is 42",
		TokensUsed:   128,
		LatencyMs:    850,
		QualityScore: 0.92,
		ModelUsed:    "llama-3-8b",
	}

	data, err := json.Marshal(result)
	require.NoError(t, err)

	var decoded TaskResult
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, "task-200", decoded.TaskID)
	assert.Equal(t, "The answer is 42", decoded.Content)
	assert.Equal(t, 128, decoded.TokensUsed)
	assert.Equal(t, int64(850), decoded.LatencyMs)
}

func TestNodeRequirements(t *testing.T) {
	req := NodeRequirements{
		MinVRAMGB:       8,
		Capabilities:    []string{"llm"},
		GenesisVerified: true,
		MinReputation:   0.8,
	}

	data, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded NodeRequirements
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)

	assert.Equal(t, 8, decoded.MinVRAMGB)
	assert.True(t, decoded.GenesisVerified)
	assert.Equal(t, 0.8, decoded.MinReputation)
}

func TestServerGetActiveNodes(t *testing.T) {
	_, priv := generateTestKeys(t)
	// Server with nil redis (we won't publish, just test node tracking)
	server := NewServer("test-node", priv, nil)

	// No nodes initially
	nodes := server.GetActiveNodes()
	assert.Empty(t, nodes)

	// Simulate adding nodes
	server.nodesMu.Lock()
	server.nodes["worker-1"] = &AgentHello{
		NodeID:       "worker-1",
		NodeType:     "gpu",
		Capabilities: []string{"llm"},
	}
	server.nodes["worker-2"] = &AgentHello{
		NodeID:       "worker-2",
		NodeType:     "cpu",
		Capabilities: []string{"embedding"},
	}
	server.nodesMu.Unlock()

	nodes = server.GetActiveNodes()
	assert.Len(t, nodes, 2)

	// Test GetNodeByID
	node, ok := server.GetNodeByID("worker-1")
	assert.True(t, ok)
	assert.Equal(t, "gpu", node.NodeType)

	_, ok = server.GetNodeByID("nonexistent")
	assert.False(t, ok)
}

func TestServerWaitResultTimeout(t *testing.T) {
	_, priv := generateTestKeys(t)
	server := NewServer("test-node", priv, nil)

	ctx := context.Background()
	_, err := server.WaitResult(ctx, "nonexistent-task", 100*time.Millisecond)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "timeout")
}

func TestServerWaitResultSuccess(t *testing.T) {
	_, priv := generateTestKeys(t)
	server := NewServer("test-node", priv, nil)

	// Pre-populate result
	server.mu.Lock()
	server.taskResults["task-x"] = &TaskResult{
		TaskID:  "task-x",
		Content: "result content",
	}
	server.mu.Unlock()

	ctx := context.Background()
	result, err := server.WaitResult(ctx, "task-x", 1*time.Second)
	require.NoError(t, err)
	assert.Equal(t, "task-x", result.TaskID)
	assert.Equal(t, "result content", result.Content)
}

func TestMessageTypes(t *testing.T) {
	assert.Equal(t, MessageType("AGENT_HELLO"), MsgAgentHello)
	assert.Equal(t, MessageType("GENESIS_VERIFY"), MsgGenesisVerify)
	assert.Equal(t, MessageType("TASK_BROADCAST"), MsgTaskBroadcast)
	assert.Equal(t, MessageType("TASK_CLAIM"), MsgTaskClaim)
	assert.Equal(t, MessageType("TASK_HEARTBEAT"), MsgTaskHeartbeat)
	assert.Equal(t, MessageType("TASK_RESULT"), MsgTaskResult)
	assert.Equal(t, MessageType("MEMORY_STORE"), MsgMemoryStore)
	assert.Equal(t, MessageType("MEMORY_FETCH"), MsgMemoryFetch)
	assert.Equal(t, MessageType("CONSENSUS_VOTE"), MsgConsensusVote)
	assert.Equal(t, MessageType("REWARD_SETTLE"), MsgRewardSettle)
	assert.Equal(t, MessageType("LEARNING_GRADIENT"), MsgLearningGrad)
}
