package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// HybridIntelligenceRouter implements the 3-tier hybrid compute model:
//
//	Tier 1 — GSTD Swarm (phones, PCs): light tasks, free/cheap queries
//	Tier 2 — Cocoon TEE (GPU + TEE): heavy/confidential tasks, paid TON
//	Tier 3 — Local Ollama (fallback): when both tiers are unavailable
//
// Revenue flow for Cocoon-earned TON:
//
//	80% → Golden Reserve (XAUt backing, strengthening tokenomics)
//	20% → Swarm Node Rewards (GSTD emission to participating nodes)
//
// The router analyzes task complexity to decide the optimal tier.
// Simple questions → Swarm (free/cheap). Complex reasoning → Cocoon (quality).
// This creates a positive feedback loop:
//   - Swarm handles volume → low cost → grows userbase
//   - Complex tasks → Cocoon → earns TON → funds Treasury → backs GSTD
//   - Better GSTD backing → more trust → more users → more swarm power
type HybridIntelligenceRouter struct {
	db            *sql.DB
	cocoonBridge  *CocoonBridgeService
	recyclingPool *RecyclingPoolService
	mu            sync.RWMutex
	stats         HybridStats
	revenueStats  RevenueStats
}

// TaskComplexity categorizes a task for routing.
type TaskComplexity int

const (
	ComplexityLight  TaskComplexity = iota // Tier 1 — Swarm capable
	ComplexityMedium                       // Tier 1/2 — depends on availability
	ComplexityHeavy                        // Tier 2 — needs GPU/TEE
)

// RoutingDecision is the result of the hybrid router analysis.
type HybridRoutingDecision struct {
	Tier            string         `json:"tier"` // "swarm", "cocoon", "ollama"
	Complexity      TaskComplexity `json:"complexity"`
	Reason          string         `json:"reason"`
	EstimatedCost   float64        `json:"estimated_cost"` // GSTD
	Confidential    bool           `json:"confidential"`   // TEE-protected
	ExpectedLatency int64          `json:"expected_latency_ms"`
}

// HybridStats tracks routing decisions.
type HybridStats struct {
	TotalRouted       int64   `json:"total_routed"`
	RoutedToSwarm     int64   `json:"routed_to_swarm"`
	RoutedToCocoon    int64   `json:"routed_to_cocoon"`
	RoutedToOllama    int64   `json:"routed_to_ollama"`
	SwarmSuccessRate  float64 `json:"swarm_success_rate"`
	CocoonSuccessRate float64 `json:"cocoon_success_rate"`
}

// RevenueStats tracks TON revenue from Cocoon and its distribution.
type RevenueStats struct {
	TotalTONEarned        float64 `json:"total_ton_earned"`
	TreasuryContribution  float64 `json:"treasury_contribution"` // 80% → Gold Reserve
	SwarmRewards          float64 `json:"swarm_rewards"`         // 20% → Node GSTD emission
	TotalInferencesServed int64   `json:"total_inferences_served"`
	LastRevenueAt         int64   `json:"last_revenue_at"`
}

// NewHybridIntelligenceRouter creates the hybrid router.
func NewHybridIntelligenceRouter(
	db *sql.DB,
	cocoon *CocoonBridgeService,
	recycling *RecyclingPoolService,
) *HybridIntelligenceRouter {
	r := &HybridIntelligenceRouter{
		db:            db,
		cocoonBridge:  cocoon,
		recyclingPool: recycling,
	}
	log.Printf("🔀 Hybrid Intelligence Router initialized (Swarm ↔ Cocoon ↔ Ollama)")
	return r
}

// AnalyzeAndRoute evaluates a user request and returns the optimal routing decision.
// This is called BEFORE inference to determine which tier handles the task.
func (r *HybridIntelligenceRouter) AnalyzeAndRoute(ctx context.Context, model string, messages []map[string]string, walletAddr string) *HybridRoutingDecision {
	// 1. Explicit model selection overrides routing
	if IsCocoonModel(model) {
		return &HybridRoutingDecision{
			Tier:            "cocoon",
			Complexity:      ComplexityHeavy,
			Reason:          "user selected Cocoon TEE model",
			EstimatedCost:   CocoonCostGSTD(model),
			Confidential:    true,
			ExpectedLatency: 3000,
		}
	}

	// 2. Analyze complexity from message content
	complexity := r.analyzeComplexity(messages)

	// 3. Check Cocoon availability
	cocoonAvailable := r.cocoonBridge != nil && r.cocoonBridge.IsEnabled()
	if cocoonAvailable {
		health := r.cocoonBridge.HealthCheck(ctx)
		cocoonAvailable = health != nil && health.Available
	}

	// 4. Route based on complexity
	decision := &HybridRoutingDecision{}

	switch complexity {
	case ComplexityLight:
		// Light tasks → always Swarm (cheapest, fastest for simple queries)
		decision.Tier = "swarm"
		decision.Complexity = ComplexityLight
		decision.Reason = "simple query → Swarm handles efficiently"
		decision.EstimatedCost = 0.01
		decision.Confidential = false
		decision.ExpectedLatency = 1500

	case ComplexityMedium:
		// Medium tasks → Swarm if available, Cocoon for quality
		if model == "auto" && cocoonAvailable {
			// Auto mode: prefer quality when Cocoon is available
			decision.Tier = "cocoon"
			decision.Complexity = ComplexityMedium
			decision.Reason = "medium complexity + auto mode → Cocoon for quality"
			decision.EstimatedCost = 0.02
			decision.Confidential = true
			decision.ExpectedLatency = 2500
		} else {
			decision.Tier = "swarm"
			decision.Complexity = ComplexityMedium
			decision.Reason = "medium complexity → Swarm"
			decision.EstimatedCost = 0.01
			decision.Confidential = false
			decision.ExpectedLatency = 2000
		}

	case ComplexityHeavy:
		// Heavy tasks → Cocoon if available, otherwise Ollama
		if cocoonAvailable {
			decision.Tier = "cocoon"
			decision.Complexity = ComplexityHeavy
			decision.Reason = "heavy computation → Cocoon TEE"
			decision.EstimatedCost = 0.05
			decision.Confidential = true
			decision.ExpectedLatency = 5000
		} else {
			decision.Tier = "ollama"
			decision.Complexity = ComplexityHeavy
			decision.Reason = "heavy task, Cocoon unavailable → Ollama fallback"
			decision.EstimatedCost = 0.01
			decision.Confidential = false
			decision.ExpectedLatency = 4000
		}
	}

	// Track stats
	r.mu.Lock()
	r.stats.TotalRouted++
	switch decision.Tier {
	case "swarm":
		r.stats.RoutedToSwarm++
	case "cocoon":
		r.stats.RoutedToCocoon++
	case "ollama":
		r.stats.RoutedToOllama++
	}
	r.mu.Unlock()

	return decision
}

// analyzeComplexity determines task complexity from message content.
func (r *HybridIntelligenceRouter) analyzeComplexity(messages []map[string]string) TaskComplexity {
	if len(messages) == 0 {
		return ComplexityLight
	}

	// Get the last user message
	var lastUserMsg string
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] == "user" {
			lastUserMsg = strings.ToLower(messages[i]["content"])
			break
		}
	}

	if lastUserMsg == "" {
		return ComplexityLight
	}

	msgLen := len(lastUserMsg)

	// Heavy: code generation, math proofs, long analysis, multi-step reasoning
	heavySignals := []string{
		"write a complete", "implement", "full code", "architecture",
		"prove that", "mathematical proof", "formal verification",
		"analyze in detail", "comprehensive analysis", "deep dive",
		"step by step reasoning", "multi-step", "think through",
		"compare and contrast", "research paper", "technical report",
		"debug this", "optimize this", "refactor",
		"translate this entire", "summarize this document",
	}
	for _, sig := range heavySignals {
		if strings.Contains(lastUserMsg, sig) {
			return ComplexityHeavy
		}
	}
	// Long messages are likely complex
	if msgLen > 1000 {
		return ComplexityHeavy
	}

	// Medium: code snippets, explanations with context, moderate reasoning
	mediumSignals := []string{
		"explain", "how does", "write a function", "code",
		"calculate", "solve", "algorithm", "design",
		"what are the best", "compare", "differences between",
		"strategy", "plan", "approach",
	}
	for _, sig := range mediumSignals {
		if strings.Contains(lastUserMsg, sig) {
			return ComplexityMedium
		}
	}

	// Long-ish messages
	if msgLen > 300 {
		return ComplexityMedium
	}

	// Conversation depth adds complexity
	if len(messages) > 6 {
		return ComplexityMedium
	}

	// Default: light
	return ComplexityLight
}

// RecordCocoonRevenue records TON revenue earned from serving as a Cocoon worker
// and distributes it according to the tokenomics model:
//
//	80% → Golden Reserve (Treasury backing)
//	20% → Swarm Node Rewards (GSTD emission)
func (r *HybridIntelligenceRouter) RecordCocoonRevenue(ctx context.Context, tonAmount float64, modelServed string, participatingNodes []string) error {
	if tonAmount <= 0 {
		return nil
	}

	treasuryShare := tonAmount * 0.80 // 80% → Gold Reserve
	swarmShare := tonAmount * 0.20    // 20% → Swarm rewards

	// Update revenue stats
	r.mu.Lock()
	r.revenueStats.TotalTONEarned += tonAmount
	r.revenueStats.TreasuryContribution += treasuryShare
	r.revenueStats.SwarmRewards += swarmShare
	r.revenueStats.TotalInferencesServed++
	r.revenueStats.LastRevenueAt = time.Now().Unix()
	r.mu.Unlock()

	// Record in database
	if r.db != nil {
		_, err := r.db.ExecContext(ctx, `
			INSERT INTO cocoon_revenue (
				ton_earned, treasury_share, swarm_share, model_served,
				participating_nodes, created_at
			) VALUES ($1, $2, $3, $4, $5, NOW())
		`, tonAmount, treasuryShare, swarmShare, modelServed, len(participatingNodes))
		if err != nil {
			log.Printf("[HybridRouter] Revenue recording (non-critical): %v", err)
		}
	}

	// Distribute to Swarm nodes via RecyclingPool
	if len(participatingNodes) > 0 && r.recyclingPool != nil {
		perNodeReward := swarmShare / float64(len(participatingNodes))
		for _, nodeWallet := range participatingNodes {
			if nodeWallet != "" {
				_, _ = r.recyclingPool.ProcessPayment(ctx, nodeWallet, perNodeReward,
					fmt.Sprintf("cocoon-revenue-%d", time.Now().UnixMilli()), "cocoon_swarm_reward")
			}
		}
		log.Printf("💰 [Revenue] Distributed %.6f TON swarm share to %d nodes (%.6f/node)",
			swarmShare, len(participatingNodes), perNodeReward)
	}

	log.Printf("💎 [Revenue] Cocoon earned %.6f TON: treasury=%.6f (80%%), swarm=%.6f (20%%)",
		tonAmount, treasuryShare, swarmShare)

	return nil
}

// GetStats returns current routing statistics.
func (r *HybridIntelligenceRouter) GetStats() HybridStats {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.stats
}

// GetRevenueStats returns current revenue statistics.
func (r *HybridIntelligenceRouter) GetRevenueStats() RevenueStats {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.revenueStats
}

// Start begins the background revenue monitoring loop.
func (r *HybridIntelligenceRouter) Start(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	log.Printf("🔀 [HybridRouter] Background monitor started")

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.logStatus()
		}
	}
}

func (r *HybridIntelligenceRouter) logStatus() {
	stats := r.GetStats()
	rev := r.GetRevenueStats()

	if stats.TotalRouted == 0 {
		return
	}

	swarmPct := float64(stats.RoutedToSwarm) / float64(stats.TotalRouted) * 100
	cocoonPct := float64(stats.RoutedToCocoon) / float64(stats.TotalRouted) * 100

	log.Printf("🔀 [HybridRouter] routed=%d (swarm=%.0f%%, cocoon=%.0f%%), TON earned=%.6f, treasury=%.6f",
		stats.TotalRouted, swarmPct, cocoonPct, rev.TotalTONEarned, rev.TreasuryContribution)
}
