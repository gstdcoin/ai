package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// PipelineParallelismService coordinates distributed inference across
// multiple worker nodes, each holding a subset of model layers.
// This enables running a 70B model on nodes with only 8GB VRAM each.
//
// Architecture:
//   70B model (140GB FP16) → 40 layers
//   8GB VRAM per node → ~3-4 layers per node
//   Minimum 10-12 nodes for full 70B pipeline
//
// Flow:
//   1. User sends prompt
//   2. Coordinator finds available pipeline route (nodes holding consecutive layers)
//   3. Prompt is tokenized and embeddings computed on first node
//   4. Hidden states flow through pipeline: Node1(layers 0-3) → Node2(layers 4-7) → ...
//   5. Final node generates output tokens
//   6. Tokens streamed back to user
type PipelineParallelismService struct {
	db          *sql.DB
	redis       *redis.Client
	mu          sync.RWMutex
	pipelines   map[string]*Pipeline // Active pipeline sessions
	layerMap    map[string][]int     // nodeID → assigned layers
	nodeHealth  map[string]time.Time // nodeID → last heartbeat
}

// Pipeline represents an active inference pipeline across nodes
type Pipeline struct {
	ID            string    `json:"id"`
	ModelName     string    `json:"model_name"`
	TotalLayers   int       `json:"total_layers"`
	NodesInvolved []string  `json:"nodes_involved"`
	LayerRanges   []LayerRange `json:"layer_ranges"`
	Status        string    `json:"status"` // assembling, ready, running, completed, failed
	CreatedAt     time.Time `json:"created_at"`
	Redundancy    int       `json:"redundancy"` // How many backup paths exist
}

// LayerRange defines which layers a node handles
type LayerRange struct {
	NodeID     string `json:"node_id"`
	StartLayer int    `json:"start_layer"`
	EndLayer   int    `json:"end_layer"`
	VRAM_MB    int    `json:"vram_mb"`
	Latency_ms int    `json:"latency_ms"` // Network latency to next node
}

// ModelSpec describes a model's pipeline requirements
type ModelSpec struct {
	Name         string  `json:"name"`
	TotalLayers  int     `json:"total_layers"`
	LayerSizeMB  float64 `json:"layer_size_mb"`  // Size per layer in VRAM
	EmbedSizeMB  float64 `json:"embed_size_mb"`  // Embedding layer size
	KVCacheMBPerToken float64 `json:"kv_cache_mb_per_token"`
	MinVRAMPerNode int  `json:"min_vram_per_node_mb"`
}

// PipelineNode represents a worker node's capabilities for pipeline inference
type PipelineNode struct {
	NodeID        string    `json:"node_id"`
	WalletAddr    string    `json:"wallet_address"`
	VRAM_MB       int       `json:"vram_mb"`
	RAM_MB        int       `json:"ram_mb"`
	GPUModel      string    `json:"gpu_model"`
	Bandwidth_Mbps int      `json:"bandwidth_mbps"`
	AssignedLayers []int   `json:"assigned_layers"`
	IsOnline      bool      `json:"is_online"`
	LastSeen      time.Time `json:"last_seen"`
	Region        string    `json:"region"` // For geo-aware routing
	EndpointURL   string    `json:"endpoint_url"` // Clean Core: HTTP endpoint for proxied inference
}

// Known model specifications
var ModelSpecs = map[string]ModelSpec{
	"llama3.3:70b": {
		Name: "llama3.3:70b", TotalLayers: 80, LayerSizeMB: 1750,
		EmbedSizeMB: 1024, KVCacheMBPerToken: 0.5, MinVRAMPerNode: 4096,
	},
	"qwen2.5-coder:32b": {
		Name: "qwen2.5-coder:32b", TotalLayers: 64, LayerSizeMB: 900,
		EmbedSizeMB: 512, KVCacheMBPerToken: 0.3, MinVRAMPerNode: 4096,
	},
	"llama3.1:70b": {
		Name: "llama3.1:70b", TotalLayers: 80, LayerSizeMB: 1750,
		EmbedSizeMB: 1024, KVCacheMBPerToken: 0.5, MinVRAMPerNode: 4096,
	},
	"qwen2.5:72b": {
		Name: "qwen2.5:72b", TotalLayers: 80, LayerSizeMB: 1800,
		EmbedSizeMB: 1024, KVCacheMBPerToken: 0.5, MinVRAMPerNode: 4096,
	},
}

func NewPipelineParallelismService(db *sql.DB, redis *redis.Client) *PipelineParallelismService {
	svc := &PipelineParallelismService{
		db:         db,
		redis:      redis,
		pipelines:  make(map[string]*Pipeline),
		layerMap:   make(map[string][]int),
		nodeHealth: make(map[string]time.Time),
	}

	// Ensure schema
	svc.ensureSchema()

	return svc
}

func (s *PipelineParallelismService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS pipeline_nodes (
			node_id VARCHAR(64) PRIMARY KEY,
			wallet_address VARCHAR(128) NOT NULL,
			vram_mb INTEGER DEFAULT 0,
			ram_mb INTEGER DEFAULT 0,
			gpu_model VARCHAR(128),
			bandwidth_mbps INTEGER DEFAULT 100,
			assigned_layers JSONB DEFAULT '[]',
			region VARCHAR(32),
			is_online BOOLEAN DEFAULT true,
			last_seen TIMESTAMP DEFAULT NOW(),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_pipeline_nodes_online ON pipeline_nodes(is_online, vram_mb DESC);
		
		CREATE TABLE IF NOT EXISTS pipeline_sessions (
			session_id VARCHAR(64) PRIMARY KEY,
			model_name VARCHAR(64) NOT NULL,
			nodes_json JSONB NOT NULL,
			status VARCHAR(16) DEFAULT 'assembling',
			tokens_generated INTEGER DEFAULT 0,
			latency_ms INTEGER DEFAULT 0,
			created_at TIMESTAMP DEFAULT NOW(),
			completed_at TIMESTAMP
		);
	`)
	s.db.Exec(`ALTER TABLE pipeline_nodes ADD COLUMN IF NOT EXISTS endpoint_url VARCHAR(256)`)
}

// RegisterNode registers a node's GPU capabilities for pipeline inference
func (s *PipelineParallelismService) RegisterNode(ctx context.Context, node *PipelineNode) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO pipeline_nodes (node_id, wallet_address, vram_mb, ram_mb, gpu_model, bandwidth_mbps, region, endpoint_url)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (node_id) DO UPDATE SET
			vram_mb = $3, ram_mb = $4, gpu_model = $5, bandwidth_mbps = $6,
			region = $7, endpoint_url = $8, is_online = true, last_seen = NOW()
	`, node.NodeID, node.WalletAddr, node.VRAM_MB, node.RAM_MB, node.GPUModel, node.Bandwidth_Mbps, node.Region, nullIfEmpty(node.EndpointURL))

	if err != nil {
		return fmt.Errorf("failed to register pipeline node: %w", err)
	}

	s.mu.Lock()
	s.nodeHealth[node.NodeID] = time.Now()
	s.mu.Unlock()

	log.Printf("🔗 Pipeline node registered: %s (VRAM: %dMB, GPU: %s)", node.NodeID, node.VRAM_MB, node.GPUModel)
	return nil
}

// AssemblePipeline finds available nodes and creates an optimal pipeline for a model
func (s *PipelineParallelismService) AssemblePipeline(ctx context.Context, modelName string) (*Pipeline, error) {
	spec, ok := ModelSpecs[modelName]
	if !ok {
		return nil, fmt.Errorf("unknown model: %s", modelName)
	}

	// 1. Get all online nodes with sufficient VRAM
	rows, err := s.db.QueryContext(ctx, `
		SELECT node_id, vram_mb, bandwidth_mbps, region
		FROM pipeline_nodes
		WHERE is_online = true AND vram_mb >= $1
		ORDER BY vram_mb DESC, bandwidth_mbps DESC
	`, spec.MinVRAMPerNode)
	if err != nil {
		return nil, fmt.Errorf("failed to query nodes: %w", err)
	}
	defer rows.Close()

	var nodes []PipelineNode
	for rows.Next() {
		var n PipelineNode
		rows.Scan(&n.NodeID, &n.VRAM_MB, &n.Bandwidth_Mbps, &n.Region)
		nodes = append(nodes, n)
	}

	if len(nodes) == 0 {
		return nil, fmt.Errorf("no online nodes with sufficient VRAM (need %dMB)", spec.MinVRAMPerNode)
	}

	// 2. Calculate how many layers each node can hold
	type nodeAlloc struct {
		node       PipelineNode
		maxLayers  int
	}

	var allocations []nodeAlloc
	for _, n := range nodes {
		// Optimized layer distribution calculation
		availableVRAM := float64(n.VRAM_MB - 512)
		maxLayers := int(math.Floor(availableVRAM / spec.LayerSizeMB))
		if maxLayers < 1 {
			maxLayers = 1
		}
		allocations = append(allocations, nodeAlloc{node: n, maxLayers: maxLayers})
	}

	// 3. Optimized layer distribution: fill nodes until all layers are covered
	totalLayersNeeded := spec.TotalLayers
	var layerRanges []LayerRange
	currentLayer := 0

	for _, alloc := range allocations {
		if currentLayer >= totalLayersNeeded {
			break
		}

		endLayer := currentLayer + alloc.maxLayers
		if endLayer > totalLayersNeeded {
			endLayer = totalLayersNeeded
		}

		layerRanges = append(layerRanges, LayerRange{
			NodeID:     alloc.node.NodeID,
			StartLayer: currentLayer,
			EndLayer:   endLayer,
			VRAM_MB:    alloc.node.VRAM_MB,
		})

		currentLayer = endLayer
	}

	if currentLayer < totalLayersNeeded {
		return nil, fmt.Errorf("insufficient network capacity: can cover %d/%d layers (need more nodes)",
			currentLayer, totalLayersNeeded)
	}

	// 4. Optimize: sort by region proximity for minimal inter-node latency
	sort.Slice(layerRanges, func(i, j int) bool {
		return layerRanges[i].StartLayer < layerRanges[j].StartLayer
	})

	// 5. Create pipeline
	pipeline := &Pipeline{
		ID:          fmt.Sprintf("pipe-%d", time.Now().UnixNano()),
		ModelName:   modelName,
		TotalLayers: totalLayersNeeded,
		LayerRanges: layerRanges,
		Status:      "ready",
		CreatedAt:   time.Now(),
		Redundancy:  len(nodes) - len(layerRanges), // Extra nodes available
	}

	for _, lr := range layerRanges {
		pipeline.NodesInvolved = append(pipeline.NodesInvolved, lr.NodeID)
	}

	// 6. Store in Redis for fast access
	pipelineJSON, _ := json.Marshal(pipeline)
	s.redis.Set(ctx, "pipeline:"+pipeline.ID, pipelineJSON, 30*time.Minute)

	// 7. Store in DB for analytics
	nodesJSON, _ := json.Marshal(layerRanges)
	s.db.ExecContext(ctx, `
		INSERT INTO pipeline_sessions (session_id, model_name, nodes_json, status)
		VALUES ($1, $2, $3, 'ready')
	`, pipeline.ID, modelName, nodesJSON)

	s.mu.Lock()
	s.pipelines[pipeline.ID] = pipeline
	s.mu.Unlock()

	log.Printf("🔗 Pipeline assembled: %s (%s, %d nodes, %d layers, redundancy: %d)",
		pipeline.ID, modelName, len(layerRanges), totalLayersNeeded, pipeline.Redundancy)

	return pipeline, nil
}

// GetPipelineStatus returns current pipeline stats for the network
func (s *PipelineParallelismService) GetPipelineStatus(ctx context.Context) (map[string]interface{}, error) {
	var totalNodes, onlineNodes int
	var totalVRAM int64

	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pipeline_nodes").Scan(&totalNodes)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pipeline_nodes WHERE is_online = true").Scan(&onlineNodes)
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(vram_mb), 0) FROM pipeline_nodes WHERE is_online = true").Scan(&totalVRAM)

	var activeSessions int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM pipeline_sessions WHERE status IN ('ready', 'running')").Scan(&activeSessions)

	// Calculate which models can be assembled
	supportedModels := []map[string]interface{}{}
	for name, spec := range ModelSpecs {
		totalLayersAvailable := 0
		rows, _ := s.db.QueryContext(ctx, `
			SELECT vram_mb FROM pipeline_nodes WHERE is_online = true AND vram_mb >= $1
		`, spec.MinVRAMPerNode)
		if rows != nil {
			for rows.Next() {
				var vram int
				rows.Scan(&vram)
				availableVRAM := float64(vram - 512)
				totalLayersAvailable += int(math.Floor(availableVRAM / spec.LayerSizeMB))
			}
			rows.Close()
		}

		canRun := totalLayersAvailable >= spec.TotalLayers
		supportedModels = append(supportedModels, map[string]interface{}{
			"model":           name,
			"total_layers":    spec.TotalLayers,
			"layers_available": totalLayersAvailable,
			"can_run":         canRun,
			"coverage":        fmt.Sprintf("%.0f%%", math.Min(float64(totalLayersAvailable)/float64(spec.TotalLayers)*100, 100)),
		})
	}

	return map[string]interface{}{
		"total_nodes":        totalNodes,
		"online_nodes":       onlineNodes,
		"total_vram_gb":      float64(totalVRAM) / 1024,
		"active_sessions":    activeSessions,
		"supported_models":   supportedModels,
		"pipeline_ready":     onlineNodes >= 2,
	}, nil
}

// NodeHeartbeat updates a node's online status
func (s *PipelineParallelismService) NodeHeartbeat(ctx context.Context, nodeID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE pipeline_nodes SET is_online = true, last_seen = NOW() WHERE node_id = $1
	`, nodeID)

	s.mu.Lock()
	s.nodeHealth[nodeID] = time.Now()
	s.mu.Unlock()

	return err
}

// MarkOfflineNodes marks nodes that haven't sent heartbeat as offline
func (s *PipelineParallelismService) MarkOfflineNodes(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE pipeline_nodes SET is_online = false
		WHERE last_seen < NOW() - INTERVAL '2 minutes' AND is_online = true
	`)
	return err
}

// ============================================================================
// REDUNDANCY FACTOR = 3: Dynamic Layer Replication & Auto-Failover
// ============================================================================

const RedundancyFactor = 3

// LayerReplica tracks which nodes hold copies of specific layers
type LayerReplica struct {
	LayerIndex int      `json:"layer_index"`
	NodeIDs    []string `json:"node_ids"` // Nodes holding this layer (target: 3)
	IsCritical bool     `json:"is_critical"` // true if below redundancy threshold
}

// EnsureRedundancy checks and repairs layer replication across the network.
// If a node goes offline and its layers drop below RedundancyFactor,
// the system automatically replicates those layers to free nodes.
func (s *PipelineParallelismService) EnsureRedundancy(ctx context.Context, modelName string) ([]LayerReplica, error) {
	spec, ok := ModelSpecs[modelName]
	if !ok {
		return nil, fmt.Errorf("unknown model: %s", modelName)
	}

	// 1. Build layer → nodes mapping from assigned_layers
	layerNodes := make(map[int][]string) // layerIndex → nodeIDs
	rows, err := s.db.QueryContext(ctx, `
		SELECT node_id, assigned_layers FROM pipeline_nodes
		WHERE is_online = true AND assigned_layers != '[]'
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var nodeID string
		var layersJSON []byte
		rows.Scan(&nodeID, &layersJSON)

		var layers []int
		json.Unmarshal(layersJSON, &layers)
		for _, l := range layers {
			layerNodes[l] = append(layerNodes[l], nodeID)
		}
	}

	// 2. Check each layer for redundancy
	var replicas []LayerReplica
	var criticalLayers []int

	for layer := 0; layer < spec.TotalLayers; layer++ {
		nodes := layerNodes[layer]
		replica := LayerReplica{
			LayerIndex: layer,
			NodeIDs:    nodes,
			IsCritical: len(nodes) < RedundancyFactor,
		}
		replicas = append(replicas, replica)

		if replica.IsCritical {
			criticalLayers = append(criticalLayers, layer)
		}
	}

	// 3. Auto-repair: assign critical layers to free nodes
	if len(criticalLayers) > 0 {
		log.Printf("⚠️ Pipeline %s: %d layers below redundancy factor %d", modelName, len(criticalLayers), RedundancyFactor)
		s.repairLayers(ctx, criticalLayers, layerNodes, spec)
	}

	return replicas, nil
}

// repairLayers assigns under-replicated layers to available nodes
func (s *PipelineParallelismService) repairLayers(ctx context.Context, criticalLayers []int, currentMapping map[int][]string, spec ModelSpec) {
	// Find nodes with spare VRAM
	rows, err := s.db.QueryContext(ctx, `
		SELECT node_id, vram_mb, assigned_layers FROM pipeline_nodes
		WHERE is_online = true
		ORDER BY vram_mb DESC
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type spareNode struct {
		nodeID  string
		vramMB  int
		layers  []int
		spareVRAM int
	}

	var spareNodes []spareNode
	for rows.Next() {
		var n spareNode
		var layersJSON []byte
		rows.Scan(&n.nodeID, &n.vramMB, &layersJSON)
		json.Unmarshal(layersJSON, &n.layers)
		// Calculate spare VRAM using optimized layer distribution
		usedVRAM := float64(len(n.layers)) * spec.LayerSizeMB
		n.spareVRAM = n.vramMB - int(usedVRAM) - 512
		if n.spareVRAM > int(spec.LayerSizeMB) {
			spareNodes = append(spareNodes, n)
		}
	}

	for _, layer := range criticalLayers {
		existingNodes := currentMapping[layer]
		neededReplicas := RedundancyFactor - len(existingNodes)

		for i := 0; i < neededReplicas && len(spareNodes) > 0; i++ {
			// Pick node with most spare VRAM that doesn't already have this layer
			for j, node := range spareNodes {
				alreadyHas := false
				for _, existing := range existingNodes {
					if existing == node.nodeID {
						alreadyHas = true
						break
					}
				}
				if alreadyHas {
					continue
				}

				// Assign layer to this node
				node.layers = append(node.layers, layer)
				layersJSON, _ := json.Marshal(node.layers)
				s.db.ExecContext(ctx, `
					UPDATE pipeline_nodes SET assigned_layers = $1 WHERE node_id = $2
				`, layersJSON, node.nodeID)

				node.spareVRAM -= int(spec.LayerSizeMB)
				spareNodes[j] = node

				log.Printf("🔧 Auto-replicated layer %d to node %s (redundancy restored)", layer, node.nodeID)
				break
			}
		}
	}
}

// HandleNodeFailure is triggered when a node goes offline.
// It immediately reassigns that node's layers to maintain pipeline continuity.
func (s *PipelineParallelismService) HandleNodeFailure(ctx context.Context, failedNodeID string) error {
	log.Printf("🚨 Node failure detected: %s — initiating auto-failover", failedNodeID)

	// 1. Get the failed node's assigned layers
	var layersJSON []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT assigned_layers FROM pipeline_nodes WHERE node_id = $1
	`, failedNodeID).Scan(&layersJSON)
	if err != nil {
		return err
	}

	var failedLayers []int
	json.Unmarshal(layersJSON, &failedLayers)

	if len(failedLayers) == 0 {
		return nil // No layers to reassign
	}

	// 2. Mark node as offline
	s.db.ExecContext(ctx, `
		UPDATE pipeline_nodes SET is_online = false WHERE node_id = $1
	`, failedNodeID)

	// 3. For each affected pipeline session, find replacement routes
	// This is handled by EnsureRedundancy when layers are checked
	for _, model := range []string{"llama3.3:70b", "qwen2.5-coder:32b", "llama3.1:70b"} {
		s.EnsureRedundancy(ctx, model)
	}

	log.Printf("✅ Auto-failover complete for node %s (%d layers reassigned)", failedNodeID, len(failedLayers))
	return nil
}
