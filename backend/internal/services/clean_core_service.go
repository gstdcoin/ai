package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// CleanCoreService implements the Clean Core Protocol:
// - Shard-First: model propagation on admin load (no server disk storage)
// - Availability Staking: Proof-of-Storage every 10 min
// - Decentralized Inference: proxy to nodes, server as Proxy-Balancer
// - Self-Learning Loop: free hashrate → Golden Vectors
type CleanCoreService struct {
	db              *sql.DB
	redis           *redis.Client
	lfs             *SwarmLFSService
	pipeline        *PipelineParallelismService
	inference       *InferenceService
	contrib         *ContributionMonetizationService
	leviathanProfit *LeviathanProfitService // Profit Maximization: prefer high-margin nodes
	agentRating     *AgentRatingService     // A2A Symbio: high-rated agents get queue priority
	propCh          chan *PropagationEvent
	mu              sync.RWMutex
	lastProp        map[string]time.Time // model_id -> last propagation
}

// PropagationEvent is broadcast when a model is loaded for shard-first distribution
type PropagationEvent struct {
	ModelID   string    `json:"model_id"`
	Manifest  *LFSManifest `json:"manifest,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// ProofOfStorageRecord represents a node's proof that it holds model shards
type ProofOfStorageRecord struct {
	NodeID     string   `json:"node_id"`
	WalletAddr string   `json:"wallet_address"`
	ModelID    string   `json:"model_id"`
	BlockIDs   []string `json:"block_ids"`
	ProofHash  string   `json:"proof_hash"`
	VerifiedAt time.Time `json:"verified_at"`
}

const (
	proofValidityWindow = 10 * time.Minute
	redisPropChannel    = "clean_core:propagation"
)

// NewCleanCoreService creates the Clean Core orchestrator
func NewCleanCoreService(
	db *sql.DB,
	redis *redis.Client,
	lfs *SwarmLFSService,
	pipeline *PipelineParallelismService,
	inference *InferenceService,
	contrib *ContributionMonetizationService,
) *CleanCoreService {
	svc := &CleanCoreService{
		db:        db,
		redis:     redis,
		lfs:       lfs,
		pipeline:  pipeline,
		inference: inference,
		contrib:   contrib,
		propCh:    make(chan *PropagationEvent, 32),
		lastProp:  make(map[string]time.Time),
	}
	svc.ensureSchema()
	return svc
}

// SetAgentRating injects A2A Symbio: agent rating for queue priority
func (s *CleanCoreService) SetAgentRating(ar *AgentRatingService) {
	s.agentRating = ar
}

// SetLeviathanProfit injects Profit Maximization service for high-margin node routing
func (s *CleanCoreService) SetLeviathanProfit(lp *LeviathanProfitService) {
	s.leviathanProfit = lp
}

func (s *CleanCoreService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS proof_of_storage (
			id SERIAL PRIMARY KEY,
			node_id VARCHAR(128) NOT NULL,
			wallet_address VARCHAR(128),
			model_id VARCHAR(64) NOT NULL,
			block_ids JSONB NOT NULL,
			proof_hash VARCHAR(128) NOT NULL,
			verified_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_proof_of_storage_node ON proof_of_storage(node_id);
		CREATE INDEX IF NOT EXISTS idx_proof_of_storage_verified ON proof_of_storage(verified_at DESC);
		CREATE INDEX IF NOT EXISTS idx_proof_of_storage_model ON proof_of_storage(model_id);
	`)
	if err != nil {
		log.Printf("⚠️ Clean Core schema: %v", err)
	}
}

// PropagateModel initiates shard-first distribution. Model does NOT land on server disk.
// Admin calls this when loading a model; nodes subscribe and fetch blocks via LFS.
// If manifest doesn't exist, creates a placeholder (admin can pre-register via AddManifest).
func (s *CleanCoreService) PropagateModel(ctx context.Context, modelID string) error {
	manifest, err := s.lfs.GetManifest(ctx, modelID)
	if err != nil {
		// Create placeholder manifest for new model (Shard-First: model lives in network)
		manifest, err = s.lfs.AddManifest(ctx, modelID, 4)
		if err != nil {
			return err
		}
	}

	ev := &PropagationEvent{ModelID: modelID, Manifest: manifest, Timestamp: time.Now()}
	s.mu.Lock()
	s.lastProp[modelID] = ev.Timestamp
	s.mu.Unlock()

	// Broadcast to Redis for node subscribers
	if s.redis != nil {
		payload, _ := json.Marshal(ev)
		s.redis.Publish(ctx, redisPropChannel, payload)
	}

	// Also send to local channel for in-process subscribers
	select {
	case s.propCh <- ev:
	default:
	}

	log.Printf("[Clean Core] Shard-First: propagated model %s (blocks=%d) — model lives in network", modelID, len(manifest.Blocks))
	return nil
}

// SubscribePropagation returns a channel for propagation events (for nodes)
func (s *CleanCoreService) SubscribePropagation() <-chan *PropagationEvent {
	return s.propCh
}

// SubmitProofOfStorage records a node's proof that it holds model shards.
// Must be called every 10 minutes for Availability Staking rewards.
func (s *CleanCoreService) SubmitProofOfStorage(ctx context.Context, r *ProofOfStorageRecord) error {
	if s.db == nil {
		return nil
	}
	r.VerifiedAt = time.Now()
	blocksJSON, _ := json.Marshal(r.BlockIDs)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO proof_of_storage (node_id, wallet_address, model_id, block_ids, proof_hash, verified_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, r.NodeID, nullStr(r.WalletAddr), r.ModelID, blocksJSON, r.ProofHash, r.VerifiedAt)
	return err
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// HasValidProof returns true if the node has submitted Proof-of-Storage in the last 10 minutes
func (s *CleanCoreService) HasValidProof(ctx context.Context, nodeID, modelID string) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	cutoff := time.Now().Add(-proofValidityWindow)
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM proof_of_storage
		WHERE node_id = $1 AND model_id = $2 AND verified_at >= $3
	`, nodeID, modelID, cutoff).Scan(&count)
	return count > 0, err
}

// GetEligibleNodes returns nodes with valid Proof-of-Storage for a model (for inference routing)
func (s *CleanCoreService) GetEligibleNodes(ctx context.Context, modelID string) ([]NodeInferenceEndpoint, error) {
	if s.db == nil {
		return nil, nil
	}
	cutoff := time.Now().Add(-proofValidityWindow)
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT p.node_id, COALESCE(pn.endpoint_url, '') as endpoint_url, COALESCE(pn.wallet_address, '') as wallet_address
		FROM proof_of_storage p
		LEFT JOIN pipeline_nodes pn ON pn.node_id = p.node_id AND pn.is_online = true
		WHERE p.model_id = $1 AND p.verified_at >= $2
	`, modelID, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []NodeInferenceEndpoint
	for rows.Next() {
		var n NodeInferenceEndpoint
		if err := rows.Scan(&n.NodeID, &n.EndpointURL, &n.WalletAddr); err != nil {
			continue
		}
		if n.EndpointURL != "" {
			out = append(out, n)
		}
	}
	return out, nil
}

// NodeInferenceEndpoint is a node that can serve inference
type NodeInferenceEndpoint struct {
	NodeID      string `json:"node_id"`
	EndpointURL string `json:"endpoint_url"`
	WalletAddr  string `json:"wallet_address"`
}

// ProxyInferResult holds the result of a proxied inference
type ProxyInferResult struct {
	Response   string
	NodeID     string
	WalletAddr string
	OK         bool
}

// ProxyInfer forwards the request to an eligible node. Returns result with OK=true if successful.
// If no eligible nodes, OK=false and caller should fallback to server.
// A2A Symbio: high-rated agents get queue priority. Then Profit Maximization by margin.
func (s *CleanCoreService) ProxyInfer(ctx context.Context, prompt, modelID string) ProxyInferResult {
	nodes, err := s.GetEligibleNodes(ctx, modelID)
	if err != nil || len(nodes) == 0 {
		return ProxyInferResult{OK: false}
	}

	// A2A Symbio: sort by agent reliability rating (high-rated first)
	if s.agentRating != nil {
		nodes = s.agentRating.SortNodesByRating(ctx, nodes)
	} else {
		// Profit Maximization: sort by margin when no rating service
		feeGSTD := GetBaseInferenceFeeGSTD() * GetInferenceFeeMultiplier()
		if s.leviathanProfit != nil {
			nodes = s.leviathanProfit.GetNodesByMargin(ctx, nodes, feeGSTD)
		}
	}

	target := nodes[0]
	url := strings.TrimSuffix(target.EndpointURL, "/") + "/infer"
	reqBody := map[string]string{"prompt": prompt, "model": modelID}
	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(body)))
	if err != nil {
		return ProxyInferResult{OK: false}
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Clean Core] Proxy infer to %s failed: %v", target.NodeID, err)
		return ProxyInferResult{OK: false}
	}
	defer resp.Body.Close()

	var result struct {
		Response string `json:"response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ProxyInferResult{OK: false}
	}
	return ProxyInferResult{Response: result.Response, NodeID: target.NodeID, WalletAddr: target.WalletAddr, OK: true}
}

// StartPropagationListener starts background listener for propagation events (optional)
func (s *CleanCoreService) StartPropagationListener(ctx context.Context) {
	if s.redis == nil {
		return
	}
	pubsub := s.redis.Subscribe(ctx, redisPropChannel)
	defer pubsub.Close()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-pubsub.Channel():
			var ev PropagationEvent
			if json.Unmarshal([]byte(msg.Payload), &ev) == nil {
				log.Printf("[Clean Core] Received propagation: %s", ev.ModelID)
			}
		}
	}
}
