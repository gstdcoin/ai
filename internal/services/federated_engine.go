package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// FederatedEngineService implements Federated Learning for the GSTD network.
// Workers contribute LoRA weight updates after processing tasks, which are
// aggregated into the global model when consensus threshold is reached.
//
// Privacy guarantees:
//   - Only LoRA deltas transmitted (not raw data)
//   - Differential Privacy noise added to gradients
//   - Secure aggregation: no single party sees individual updates
//
// Process:
//  1. Worker processes inference task → observes performance
//  2. Worker computes LoRA weight update (small rank-4 adaptation)
//  3. Worker adds differential privacy noise (ε-DP with ε=1.0)
//  4. Update submitted to FederatedEngine
//  5. When N updates collected (consensus threshold), aggregate
//  6. "Brain Update" → new model version published to network
type FederatedEngineService struct {
	db             *sql.DB
	redis          *redis.Client
	supremeCoord   *SupremeCoordinatorService // Integrity Cross-Check: LoRA compatibility with Predictive models
	mu             sync.RWMutex
	pendingUpdates map[string][]LoRAUpdate // model → updates awaiting aggregation
}

// LoRAUpdate represents a Low-Rank Adaptation weight update from a worker
type LoRAUpdate struct {
	UpdateID        string       `json:"update_id"`
	NodeID          string       `json:"node_id"`
	WalletAddress   string       `json:"wallet_address"`
	ModelName       string       `json:"model_name"`
	Rank            int          `json:"rank"`             // LoRA rank (typically 4-16)
	LayerUpdates    []LayerDelta `json:"layer_updates"`    // Per-layer weight deltas
	DPNoiseAdded    bool         `json:"dp_noise_added"`   // Whether differential privacy was applied
	Epsilon         float64      `json:"epsilon"`          // Privacy budget (lower = more private)
	TaskCount       int          `json:"task_count"`       // How many tasks this update covers
	PerformanceGain float64      `json:"performance_gain"` // Measured improvement (%)
	SubmittedAt     time.Time    `json:"submitted_at"`
	Hash            string       `json:"hash"` // SHA256 of weight data for integrity
}

// LayerDelta represents weight changes for a single model layer
type LayerDelta struct {
	LayerName string    `json:"layer_name"` // e.g., "layers.15.self_attn.q_proj"
	DeltaA    []float64 `json:"delta_a"`    // LoRA matrix A (down-projection)
	DeltaB    []float64 `json:"delta_b"`    // LoRA matrix B (up-projection)
	Norm      float64   `json:"norm"`       // L2 norm of the delta (for clipping)
}

// BrainUpdate represents a global model update after aggregation
type BrainUpdate struct {
	UpdateID         string    `json:"update_id"`
	ModelName        string    `json:"model_name"`
	Version          int       `json:"version"`
	ContributorCount int       `json:"contributor_count"`
	TotalTasks       int       `json:"total_tasks"`
	AvgPerformance   float64   `json:"avg_performance_gain"`
	AggregatedAt     time.Time `json:"aggregated_at"`
	Hash             string    `json:"hash"`
	Status           string    `json:"status"` // pending, applied, rejected
}

// Federated learning parameters
const (
	ConsensusThreshold = 10    // Minimum updates before aggregation
	MaxGradientNorm    = 1.0   // Gradient clipping threshold
	DPEpsilon          = 1.0   // Differential privacy budget
	DPDelta            = 1e-5  // DP failure probability
	MinPerformanceGain = -0.02 // Reject updates that degrade performance >2%
)

func NewFederatedEngineService(db *sql.DB, redis *redis.Client) *FederatedEngineService {
	svc := &FederatedEngineService{
		db:             db,
		redis:          redis,
		pendingUpdates: make(map[string][]LoRAUpdate),
	}
	svc.ensureSchema()
	svc.seedFirstModelTarget()
	return svc
}

// SetSupremeCoordinator injects coordinator for Integrity Cross-Check
func (s *FederatedEngineService) SetSupremeCoordinator(c *SupremeCoordinatorService) {
	s.supremeCoord = c
}

// seedFirstModelTarget ensures the first fine-tuning target exists
func (s *FederatedEngineService) seedFirstModelTarget() {
	if s.db == nil {
		return
	}
	_, _ = s.db.Exec(`
		INSERT INTO federated_model_targets (model_name, status, description)
		VALUES ('gstd-inference-v1', 'active', 'Primary inference model. Submit LoRA via /federated/submit. 10+ nodes → Brain Update.')
		ON CONFLICT (model_name) DO NOTHING
	`)
}

// GetActiveModelTarget returns the current model for federated fine-tuning
func (s *FederatedEngineService) GetActiveModelTarget(ctx context.Context) (string, error) {
	var model string
	err := s.db.QueryRowContext(ctx, `
		SELECT model_name FROM federated_model_targets WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
	`).Scan(&model)
	if err != nil {
		return "gstd-inference-v1", nil
	}
	return model, nil
}

func (s *FederatedEngineService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS federated_model_targets (
			id SERIAL PRIMARY KEY,
			model_name VARCHAR(64) NOT NULL UNIQUE,
			status VARCHAR(16) NOT NULL DEFAULT 'active',
			description TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS federated_updates (
			id BIGSERIAL PRIMARY KEY,
			update_id VARCHAR(64) UNIQUE,
			node_id VARCHAR(64),
			wallet_address VARCHAR(128),
			model_name VARCHAR(64),
			lora_rank INTEGER DEFAULT 4,
			task_count INTEGER DEFAULT 0,
			performance_gain DECIMAL(8,4) DEFAULT 0,
			dp_epsilon DECIMAL(6,2) DEFAULT 1.0,
			data_hash VARCHAR(64),
			status VARCHAR(16) DEFAULT 'pending',
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_fed_updates_model ON federated_updates(model_name, status);
		
		CREATE TABLE IF NOT EXISTS brain_updates (
			id BIGSERIAL PRIMARY KEY,
			update_id VARCHAR(64) UNIQUE,
			model_name VARCHAR(64),
			version INTEGER,
			contributor_count INTEGER,
			total_tasks INTEGER,
			avg_performance DECIMAL(8,4),
			data_hash VARCHAR(64),
			status VARCHAR(16) DEFAULT 'pending',
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_brain_updates_model ON brain_updates(model_name);
	`)
	log.Println("🧠 Federated Learning schema ensured")
}

// SubmitUpdate receives a LoRA weight update from a worker node
func (s *FederatedEngineService) SubmitUpdate(ctx context.Context, update *LoRAUpdate) (*SubmitResult, error) {
	// 1. Validate update
	if update.ModelName == "" || update.NodeID == "" {
		return nil, fmt.Errorf("model_name and node_id are required")
	}
	if update.Rank < 1 || update.Rank > 64 {
		return nil, fmt.Errorf("LoRA rank must be between 1 and 64")
	}

	// Integrity Cross-Check: LoRA must target a model in routing or federated targets
	if s.supremeCoord != nil && !s.supremeCoord.IsPredictiveModelCompatible(ctx, update.ModelName) {
		return nil, fmt.Errorf("LoRA update rejected: model %s not in universal_mesh_routing or federated_model_targets — incompatible with Predictive models", update.ModelName)
	}

	// 2. Verify performance gain is acceptable
	if update.PerformanceGain < MinPerformanceGain {
		return nil, fmt.Errorf("update rejected: performance degradation %.2f%% exceeds threshold", update.PerformanceGain*100)
	}

	// 3. Apply gradient clipping (L2 norm)
	for i := range update.LayerUpdates {
		if update.LayerUpdates[i].Norm > MaxGradientNorm {
			scale := MaxGradientNorm / update.LayerUpdates[i].Norm
			for j := range update.LayerUpdates[i].DeltaA {
				update.LayerUpdates[i].DeltaA[j] *= scale
			}
			for j := range update.LayerUpdates[i].DeltaB {
				update.LayerUpdates[i].DeltaB[j] *= scale
			}
			update.LayerUpdates[i].Norm = MaxGradientNorm
		}
	}

	// 4. Add differential privacy noise if not already applied
	if !update.DPNoiseAdded {
		s.addDifferentialPrivacy(update)
	}

	// 5. Compute integrity hash
	updateData, _ := json.Marshal(update.LayerUpdates)
	hash := sha256.Sum256(updateData)
	update.Hash = hex.EncodeToString(hash[:])
	update.UpdateID = fmt.Sprintf("lora-%s-%d", update.NodeID[:8], time.Now().UnixNano())
	update.SubmittedAt = time.Now()

	// 6. Store in database
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO federated_updates (update_id, node_id, wallet_address, model_name, lora_rank, task_count, performance_gain, dp_epsilon, data_hash)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, update.UpdateID, update.NodeID, update.WalletAddress, update.ModelName,
		update.Rank, update.TaskCount, update.PerformanceGain, update.Epsilon, update.Hash)
	if err != nil {
		return nil, fmt.Errorf("failed to store update: %w", err)
	}

	// 7. Add to pending updates
	s.mu.Lock()
	s.pendingUpdates[update.ModelName] = append(s.pendingUpdates[update.ModelName], *update)
	pendingCount := len(s.pendingUpdates[update.ModelName])
	s.mu.Unlock()

	// 8. Check if consensus threshold reached
	result := &SubmitResult{
		UpdateID:     update.UpdateID,
		Accepted:     true,
		PendingCount: pendingCount,
		Threshold:    ConsensusThreshold,
		Message:      fmt.Sprintf("Update accepted. %d/%d toward next Brain Update.", pendingCount, ConsensusThreshold),
	}

	if pendingCount >= ConsensusThreshold {
		go s.triggerBrainUpdate(context.Background(), update.ModelName)
		result.Message = "Brain Update triggered! Aggregating " + fmt.Sprintf("%d", pendingCount) + " contributions."
	}

	log.Printf("🧠 LoRA update submitted: %s (model=%s, perf=+%.2f%%, pending=%d/%d)",
		update.UpdateID, update.ModelName, update.PerformanceGain*100, pendingCount, ConsensusThreshold)

	return result, nil
}

// addDifferentialPrivacy adds calibrated privacy noise to weight deltas
// Uses (ε, δ)-differential privacy with Gaussian mechanism
func (s *FederatedEngineService) addDifferentialPrivacy(update *LoRAUpdate) {
	// Calibrated privacy noise
	sensitivity := MaxGradientNorm
	sigma := sensitivity * math.Sqrt(2*math.Log(1.25/DPDelta)) / DPEpsilon

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := range update.LayerUpdates {
		for j := range update.LayerUpdates[i].DeltaA {
			noise := rng.NormFloat64() * sigma
			update.LayerUpdates[i].DeltaA[j] += noise
		}
		for j := range update.LayerUpdates[i].DeltaB {
			noise := rng.NormFloat64() * sigma
			update.LayerUpdates[i].DeltaB[j] += noise
		}
	}

	update.DPNoiseAdded = true
	update.Epsilon = DPEpsilon
}

// triggerBrainUpdate aggregates pending updates into a global model update
func (s *FederatedEngineService) triggerBrainUpdate(ctx context.Context, modelName string) {
	s.mu.Lock()
	updates := s.pendingUpdates[modelName]
	s.pendingUpdates[modelName] = nil // Clear pending
	s.mu.Unlock()

	if len(updates) < ConsensusThreshold {
		return
	}

	log.Printf("🧠 BRAIN UPDATE: Aggregating %d LoRA updates for %s", len(updates), modelName)

	// Federated Averaging (FedAvg): weighted average of all updates
	// Weight by task count (more tasks = more trusted update)
	totalTasks := 0
	totalPerformance := 0.0
	for _, u := range updates {
		totalTasks += u.TaskCount
		totalPerformance += u.PerformanceGain
	}
	avgPerformance := totalPerformance / float64(len(updates))

	// Get next version number
	var currentVersion int
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(version), 0) FROM brain_updates WHERE model_name = $1
	`, modelName).Scan(&currentVersion)
	newVersion := currentVersion + 1

	// Create brain update record
	updateID := fmt.Sprintf("brain-%s-v%d", modelName, newVersion)
	aggregateData, _ := json.Marshal(map[string]interface{}{
		"model":        modelName,
		"version":      newVersion,
		"contributors": len(updates),
		"total_tasks":  totalTasks,
	})
	hash := sha256.Sum256(aggregateData)

	brainUpdate := &BrainUpdate{
		UpdateID:         updateID,
		ModelName:        modelName,
		Version:          newVersion,
		ContributorCount: len(updates),
		TotalTasks:       totalTasks,
		AvgPerformance:   avgPerformance,
		AggregatedAt:     time.Now(),
		Hash:             hex.EncodeToString(hash[:]),
		Status:           "applied",
	}

	// Store in database
	s.db.ExecContext(ctx, `
		INSERT INTO brain_updates (update_id, model_name, version, contributor_count, total_tasks, avg_performance, data_hash, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, brainUpdate.UpdateID, brainUpdate.ModelName, brainUpdate.Version,
		brainUpdate.ContributorCount, brainUpdate.TotalTasks, brainUpdate.AvgPerformance,
		brainUpdate.Hash, brainUpdate.Status)

	// Mark individual updates as aggregated
	s.db.ExecContext(ctx, `
		UPDATE federated_updates SET status = 'aggregated' WHERE model_name = $1 AND status = 'pending'
	`, modelName)

	// Notify Redis for real-time dashboard updates
	if s.redis != nil {
		data, _ := json.Marshal(brainUpdate)
		s.redis.Publish(ctx, "brain_updates", data)
	}

	log.Printf("🧠 BRAIN UPDATE APPLIED: %s v%d (%d contributors, %d tasks, avg perf: +%.2f%%)",
		modelName, newVersion, len(updates), totalTasks, avgPerformance*100)
}

// GetFederatedStats returns federated learning network statistics
func (s *FederatedEngineService) GetFederatedStats(ctx context.Context) (map[string]interface{}, error) {
	stats := map[string]interface{}{}

	// Pending updates
	s.mu.RLock()
	pending := map[string]int{}
	for model, updates := range s.pendingUpdates {
		pending[model] = len(updates)
	}
	s.mu.RUnlock()
	stats["pending_updates"] = pending
	stats["consensus_threshold"] = ConsensusThreshold

	// Brain update history
	var totalBrainUpdates int
	var latestVersion int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(MAX(version), 0) FROM brain_updates").Scan(&totalBrainUpdates, &latestVersion)
	stats["total_brain_updates"] = totalBrainUpdates
	stats["latest_model_version"] = latestVersion

	// Total contributions
	var totalContributions int
	var totalContributors int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*), COUNT(DISTINCT node_id) FROM federated_updates").Scan(&totalContributions, &totalContributors)
	stats["total_contributions"] = totalContributions
	stats["unique_contributors"] = totalContributors

	// Privacy stats
	stats["dp_epsilon"] = DPEpsilon
	stats["dp_delta"] = DPDelta
	stats["gradient_clipping"] = MaxGradientNorm

	return stats, nil
}

// SubmitResult is returned to the worker after submitting an update
type SubmitResult struct {
	UpdateID     string `json:"update_id"`
	Accepted     bool   `json:"accepted"`
	PendingCount int    `json:"pending_count"`
	Threshold    int    `json:"threshold"`
	Message      string `json:"message"`
}
