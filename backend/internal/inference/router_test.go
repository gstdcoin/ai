package inference

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRouterNewAndRegister(t *testing.T) {
	r := NewRouter("http://localhost:11434")
	assert.Equal(t, 0, r.GetNodeCount())
	r.RegisterNode(NodeInfo{ID: "gpu-1", Models: []string{"llama-3-8b"}, VRAMGB: 24, Reputation: 0.95, GenesisOK: true, Priority: PrioritySovereignGPU})
	assert.Equal(t, 1, r.GetNodeCount())
}

func TestRouterUpdate(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "gpu-1", Reputation: 0.8})
	r.RegisterNode(NodeInfo{ID: "gpu-1", Reputation: 0.95})
	assert.Equal(t, 1, r.GetNodeCount())
}

func TestRouterUnregister(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "a"})
	r.RegisterNode(NodeInfo{ID: "b"})
	r.UnregisterNode("a")
	assert.Equal(t, 1, r.GetNodeCount())
	r.UnregisterNode("nope")
	assert.Equal(t, 1, r.GetNodeCount())
}

func TestRouterSelectByModel(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "gpu-1", Models: []string{"llama-3-8b"}, VRAMGB: 24, Reputation: 0.9, GenesisOK: true, Priority: PrioritySovereignGPU})
	r.RegisterNode(NodeInfo{ID: "cpu-1", Models: []string{"phi-3-mini"}, VRAMGB: 4, Reputation: 0.85, GenesisOK: true, Priority: PriorityCPUWorker})
	resp, err := r.Route(context.Background(), &InferRequest{RequestID: "r1", Model: "llama-3-8b", SLA: SLAConfig{MaxLatency: 5 * time.Second}})
	require.NoError(t, err)
	assert.Equal(t, "gpu-1", resp.NodeID)
}

func TestRouterFallback(t *testing.T) {
	r := NewRouter("http://ext:11434")
	resp, err := r.Route(context.Background(), &InferRequest{Model: "gpt-4"})
	require.NoError(t, err)
	assert.Equal(t, PriorityExternal, resp.Provider)
}

func TestRouterGenesisFilter(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "unv", Models: []string{"llama-3-8b"}, GenesisOK: false, Priority: PrioritySovereignGPU})
	resp, _ := r.Route(context.Background(), &InferRequest{Model: "llama-3-8b", SLA: SLAConfig{GenesisLocked: true}})
	assert.Equal(t, PriorityExternal, resp.Provider)
}

func TestRouterReputationFilter(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "low", Models: []string{"llama-3-8b"}, Reputation: 0.3, GenesisOK: true, Priority: PrioritySovereignGPU})
	resp, _ := r.Route(context.Background(), &InferRequest{Model: "llama-3-8b", SLA: SLAConfig{MinQuality: 0.8}})
	assert.Equal(t, PriorityExternal, resp.Provider)
}

func TestRouterLoadFilter(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "busy", Models: []string{"llama-3-8b"}, CurrentLoad: 0.95, Priority: PrioritySovereignGPU})
	resp, _ := r.Route(context.Background(), &InferRequest{Model: "llama-3-8b"})
	assert.Equal(t, PriorityExternal, resp.Provider)
}

func TestRouterPriority(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "cpu", Models: []string{"llama-3-8b"}, VRAMGB: 16, Reputation: 0.95, Priority: PriorityCPUWorker})
	r.RegisterNode(NodeInfo{ID: "gpu", Models: []string{"llama-3-8b"}, VRAMGB: 24, Reputation: 0.9, Priority: PrioritySovereignGPU})
	resp, _ := r.Route(context.Background(), &InferRequest{Model: "llama-3-8b"})
	assert.Equal(t, "gpu", resp.NodeID)
}

func TestRouterStats(t *testing.T) {
	r := NewRouter("")
	r.RegisterNode(NodeInfo{ID: "n1", Models: []string{"llama-3-8b"}, VRAMGB: 16, Priority: PrioritySovereignGPU})
	r.Route(context.Background(), &InferRequest{Model: "llama-3-8b"})
	r.Route(context.Background(), &InferRequest{Model: "gpt-5"})
	stats := r.GetStats()
	assert.Equal(t, int64(2), stats.TotalRequests)
	assert.Equal(t, int64(1), stats.SovereignRouted)
	assert.Equal(t, int64(1), stats.FallbackRouted)
}

func TestModelZoo(t *testing.T) {
	assert.GreaterOrEqual(t, len(ModelZoo), 15)
	cats := map[string]bool{}
	for _, m := range ModelZoo {
		cats[m.Category] = true
		assert.NotEmpty(t, m.Name)
	}
	for _, c := range []string{"small_llm", "medium_llm", "large_llm", "code", "vision", "embedding", "speech"} {
		assert.True(t, cats[c], "Missing category: "+c)
	}
}

func TestGetModelVRAM(t *testing.T) {
	assert.Equal(t, 4.0, getModelVRAM("phi-3-mini"))
	assert.Equal(t, 40.0, getModelVRAM("llama-3-70b"))
	assert.Equal(t, 4.0, getModelVRAM("unknown"))
}

func TestProviderPriorities(t *testing.T) {
	assert.Less(t, int(PrioritySovereignGPU), int(PriorityCPUWorker))
	assert.Less(t, int(PriorityCPUWorker), int(PriorityEdgeNode))
	assert.Less(t, int(PriorityEdgeNode), int(PriorityPartner))
	assert.Less(t, int(PriorityPartner), int(PriorityExternal))
}
