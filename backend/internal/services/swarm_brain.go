package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// SwarmBrain — Autonomous Network Controller
//
// The central intelligence that makes GSTD a self-governing network:
//
// 1. NODE LIFECYCLE: auto-register, monitor, upgrade, decommission
// 2. TASK DISTRIBUTION: AI-driven task assignment to optimal nodes
// 3. SELF-HEALING: detect failures, redistribute, recover
// 4. GROWTH ENGINE: track growth, optimize onboarding
// 5. ECONOMIC PILOT: dynamic rewards, anti-inflation
// 6. COLLECTIVE MEMORY: aggregate knowledge across all nodes
//
// This is what makes GSTD fundamentally different from OpenClaw:
// OpenClaw is a PERSONAL assistant.
// GSTD is an AUTONOMOUS NETWORK that manages itself.
// ═══════════════════════════════════════════════════════════════

type SwarmBrain struct {
	db      *sql.DB
	ai      *CompoundAI
	mu      sync.RWMutex
	state   NetworkState
	config  BrainConfig
	running bool
	stopCh  chan struct{}
	cycles  int64
}

type BrainConfig struct {
	AnalysisCycle    time.Duration // How often to analyze network
	HealingCycle     time.Duration // How often to check for failures
	GrowthCycle      time.Duration // How often to analyze growth
	EconomicsCycle   time.Duration // How often to adjust economics
	MaxNodesPerCycle int           // Max nodes to process per cycle
}

type NetworkState struct {
	LastUpdated     time.Time      `json:"last_updated"`
	TotalNodes      int            `json:"total_nodes"`
	OnlineNodes     int            `json:"online_nodes"`
	OfflineNodes    int            `json:"offline_nodes"`
	TotalTasks      int            `json:"total_tasks"`
	ActiveTasks     int            `json:"active_tasks"`
	CompletedTasks  int            `json:"completed_tasks"`
	FailedTasks     int            `json:"failed_tasks"`
	TotalQueriesDay int            `json:"total_queries_24h"`
	NetworkHealth   float64        `json:"network_health"` // 0-100
	GrowthRate7d    float64        `json:"growth_rate_7d"` // % new nodes
	AvgNodeUptime   float64        `json:"avg_node_uptime_hours"`
	TotalEarned     float64        `json:"total_earned_gstd"`
	NodesByStatus   map[string]int `json:"nodes_by_status"`
	TopModels       []string       `json:"top_models"`
	Alerts          []NetworkAlert `json:"alerts"`
	AIDecisions     []AIDecision   `json:"recent_ai_decisions"`
}

type NetworkAlert struct {
	ID        string    `json:"id"`
	Level     string    `json:"level"` // info, warn, critical
	Category  string    `json:"category"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
	Resolved  bool      `json:"resolved"`
}

var DefaultBrainConfig = BrainConfig{
	AnalysisCycle:    5 * time.Minute,
	HealingCycle:     2 * time.Minute,
	GrowthCycle:      30 * time.Minute,
	EconomicsCycle:   15 * time.Minute,
	MaxNodesPerCycle: 100,
}

func NewSwarmBrain(db *sql.DB, ai *CompoundAI) *SwarmBrain {
	return &SwarmBrain{
		db:     db,
		ai:     ai,
		config: DefaultBrainConfig,
		state: NetworkState{
			NodesByStatus: make(map[string]int),
			TopModels:     []string{"groq/compound", "llama-3.3-70b-versatile"},
		},
		stopCh: make(chan struct{}),
	}
}

// Start the autonomous brain loops
func (b *SwarmBrain) Start() {
	b.mu.Lock()
	if b.running {
		b.mu.Unlock()
		return
	}
	b.running = true
	b.mu.Unlock()

	log.Println("🧠 SwarmBrain: autonomous controller ONLINE")

	// Initial state refresh
	go b.refreshNetworkState()

	// Analysis loop — AI-driven network analysis
	go func() {
		// adding initial random jitter up to 120s to prevent 4x instances causing 429s on boot
		time.Sleep(time.Duration(time.Now().UnixNano()%120) * time.Second)
		b.loop("analysis", b.config.AnalysisCycle, func() {
			b.runAnalysisCycle()
		})
	}()

	// Healing loop — detect and fix failures
	go b.loop("healing", b.config.HealingCycle, func() {
		b.runHealingCycle()
	})

	// Growth loop — track and optimize growth
	go b.loop("growth", b.config.GrowthCycle, func() {
		b.runGrowthCycle()
	})

	// Economics loop — optimize rewards
	go b.loop("economics", b.config.EconomicsCycle, func() {
		b.runEconomicsCycle()
	})
}

func (b *SwarmBrain) loop(name string, interval time.Duration, fn func()) {
	// Use time.After with dynamic interval so backoff actually works
	for {
		// Get current interval (may be modified by backoff)
		currentInterval := interval
		if name == "analysis" {
			b.mu.RLock()
			currentInterval = b.config.AnalysisCycle
			b.mu.RUnlock()
		}

		select {
		case <-time.After(currentInterval):
			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("🧠 SwarmBrain [%s] panic recovered: %v", name, r)
					}
				}()
				fn()
			}()
		case <-b.stopCh:
			return
		}
	}
}

// ─── Analysis Cycle ─────────────────────────────────────────
func (b *SwarmBrain) runAnalysisCycle() {
	b.refreshNetworkState()

	// Mark stale nodes offline (autonomous health maintenance)
	if b.db != nil {
		result, err := b.db.Exec("UPDATE nodes SET status = 'offline' WHERE status = 'online' AND last_seen < NOW() - INTERVAL '10 minutes'")
		if err == nil {
			if rows, _ := result.RowsAffected(); rows > 0 {
				log.Printf("🧠 SwarmBrain: marked %d stale nodes offline", rows)
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	state := b.GetState()
	stateMap := map[string]interface{}{
		"total_nodes":     state.TotalNodes,
		"online_nodes":    state.OnlineNodes,
		"offline_nodes":   state.OfflineNodes,
		"active_tasks":    state.ActiveTasks,
		"completed_tasks": state.CompletedTasks,
		"failed_tasks":    state.FailedTasks,
		"health_score":    state.NetworkHealth,
		"growth_rate_7d":  state.GrowthRate7d,
		"total_earned":    state.TotalEarned,
		"alerts_count":    len(state.Alerts),
	}

	decision, err := b.ai.Analyze(ctx, "analysis", stateMap)
	if err != nil {
		log.Printf("🧠 SwarmBrain: analysis failed: %v", err)
		// Backoff on rate limiting (429) — double the analysis interval, cap at 30min
		b.mu.Lock()
		if b.config.AnalysisCycle < 30*time.Minute {
			b.config.AnalysisCycle = b.config.AnalysisCycle * 2
			log.Printf("🧠 SwarmBrain: rate-limited, backing off analysis to %v", b.config.AnalysisCycle)
		}
		b.mu.Unlock()
		// Try fallback model on next cycle
		b.ai.TryFallbackModel()
		return
	}

	// Reset backoff on success
	b.mu.Lock()
	if b.config.AnalysisCycle > 5*time.Minute {
		b.config.AnalysisCycle = 5 * time.Minute
		log.Printf("🧠 SwarmBrain: rate-limit cleared, analysis interval restored to 5m")
	}
	b.mu.Unlock()

	b.mu.Lock()
	b.state.AIDecisions = append(b.state.AIDecisions, *decision)
	if len(b.state.AIDecisions) > 20 {
		b.state.AIDecisions = b.state.AIDecisions[len(b.state.AIDecisions)-20:]
	}
	b.cycles++
	b.mu.Unlock()

	log.Printf("🧠 SwarmBrain: analysis cycle #%d complete (latency: %dms)", b.cycles, decision.LatencyMs)
}

// ─── Healing Cycle ─────────────────────────────────────────
func (b *SwarmBrain) runHealingCycle() {
	if b.db == nil {
		return
	}

	ctx := context.Background()

	// Find nodes that missed heartbeat (>70 min, aligning with 60-min heartbeat interval)
	rows, err := b.db.QueryContext(ctx, `
		SELECT node_id, wallet_address, status, last_heartbeat 
		FROM nodes 
		WHERE status = 'online' 
		AND last_heartbeat < NOW() - INTERVAL '70 minutes'
		LIMIT 50
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	var staleNodes []string
	for rows.Next() {
		var nodeID, wallet, status string
		var lastHB time.Time
		if err := rows.Scan(&nodeID, &wallet, &status, &lastHB); err != nil {
			continue
		}
		staleNodes = append(staleNodes, nodeID)

		// Mark as offline
		b.db.ExecContext(ctx, `UPDATE nodes SET status = 'offline' WHERE node_id = $1`, nodeID)
	}

	if len(staleNodes) > 0 {
		b.addAlert("warn", "healing", fmt.Sprintf("%d nodes went offline (missed heartbeat)", len(staleNodes)))

		// Reassign their active tasks
		for _, nodeID := range staleNodes {
			b.db.ExecContext(ctx, `
				UPDATE tasks SET status = 'pending', assigned_node = NULL 
				WHERE assigned_node = $1 AND status = 'processing'
			`, nodeID)
		}

		log.Printf("🧠 SwarmBrain [healing]: %d stale nodes marked offline, tasks reassigned", len(staleNodes))
	}

	// Recover nodes that came back online (heartbeat within last 65 min)
	b.db.ExecContext(ctx, `
		UPDATE nodes SET status = 'online' 
		WHERE status = 'offline' 
		AND last_heartbeat > NOW() - INTERVAL '65 minutes'
	`)
}

// ─── Growth Cycle ─────────────────────────────────────────
func (b *SwarmBrain) runGrowthCycle() {
	if b.db == nil {
		return
	}

	ctx := context.Background()

	// Count new nodes in last 7 days
	var newNodes7d int
	b.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM nodes WHERE created_at > NOW() - INTERVAL '7 days'
	`).Scan(&newNodes7d)

	var totalNodes int
	b.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes`).Scan(&totalNodes)

	growthRate := float64(0)
	if totalNodes > 0 {
		growthRate = float64(newNodes7d) / float64(totalNodes) * 100
	}

	b.mu.Lock()
	b.state.GrowthRate7d = growthRate
	b.mu.Unlock()

	// If growth is stalling, ask AI for suggestions
	if growthRate < 5 && totalNodes > 10 {
		ctx2, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()

		b.ai.Analyze(ctx2, "growth", map[string]interface{}{
			"total_nodes":     totalNodes,
			"new_nodes_7d":    newNodes7d,
			"growth_rate_pct": growthRate,
			"suggestion":      "growth is slowing, what incentives would help?",
		})
	}

	log.Printf("🧠 SwarmBrain [growth]: %d total nodes, +%d this week (%.1f%%)", totalNodes, newNodes7d, growthRate)
}

// ─── Economics Cycle ─────────────────────────────────────────
func (b *SwarmBrain) runEconomicsCycle() {
	if b.db == nil {
		return
	}

	ctx := context.Background()

	// Get total rewards distributed today (legacy)
	var todayRewards float64
	b.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM reward_history 
		WHERE created_at > DATE_TRUNC('day', NOW())
	`).Scan(&todayRewards)

	// Get SuperNode multi-stream settlements
	var todaySettlements float64
	b.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(total_amount), 0) FROM node_settlements 
		WHERE settled_at > DATE_TRUNC('day', NOW())
	`).Scan(&todaySettlements)

	totalGSTD := todayRewards + todaySettlements

	// Get network utilization (tasks completed vs capacity)
	var completedToday int
	b.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM tasks 
		WHERE status = 'completed' AND completed_at > DATE_TRUNC('day', NOW())
	`).Scan(&completedToday)

	b.mu.Lock()
	b.state.TotalEarned = totalGSTD
	b.mu.Unlock()

	log.Printf("🧠 SwarmBrain [economics]: %.2f GSTD distributed today (includes %.2f from 6-stream SuperNodes), %d tasks completed", totalGSTD, todaySettlements, completedToday)
}

// ─── Network State ─────────────────────────────────────────
func (b *SwarmBrain) refreshNetworkState() {
	if b.db == nil {
		return
	}

	ctx := context.Background()

	var total, online, offline int
	b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes").Scan(&total)
	b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes WHERE status = 'online'").Scan(&online)
	offline = total - online

	var totalTasks, activeTasks, completedTasks, failedTasks int
	b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
	b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'processing'").Scan(&activeTasks)
	b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'completed'").Scan(&completedTasks)
	b.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'failed'").Scan(&failedTasks)

	health := float64(100)
	if total > 0 {
		health = float64(online) / float64(total) * 100
	}

	b.mu.Lock()
	b.state.TotalNodes = total
	b.state.OnlineNodes = online
	b.state.OfflineNodes = offline
	b.state.TotalTasks = totalTasks
	b.state.ActiveTasks = activeTasks
	b.state.CompletedTasks = completedTasks
	b.state.FailedTasks = failedTasks
	b.state.NetworkHealth = health
	b.state.LastUpdated = time.Now()
	b.state.NodesByStatus = map[string]int{
		"online":  online,
		"offline": offline,
	}
	b.mu.Unlock()
}

// ─── Public API ─────────────────────────────────────────────

func (b *SwarmBrain) GetState() NetworkState {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.state
}

func (b *SwarmBrain) GetAIStats() AIStats {
	return b.ai.GetStats()
}

func (b *SwarmBrain) GetCycles() int64 {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.cycles
}

// AskBrain — ask the brain a question about the network
func (b *SwarmBrain) AskBrain(ctx context.Context, question string) (string, error) {
	state := b.GetState()
	stateJSON, _ := json.Marshal(state)

	systemPrompt := fmt.Sprintf(`You are the SwarmBrain of GSTD network.
Current network state:
%s

Answer the operator's question about the network. Be helpful and specific.`, string(stateJSON))

	return b.ai.Ask(ctx, systemPrompt, question)
}

// OptimizeNodes — AI-driven node optimization
func (b *SwarmBrain) OptimizeNodes(ctx context.Context) (*AIDecision, error) {
	state := b.GetState()
	return b.ai.Analyze(ctx, "node_mgmt", map[string]interface{}{
		"network_state":   state,
		"action_required": "optimize node assignments, identify bottlenecks, suggest improvements",
	})
}

func (b *SwarmBrain) addAlert(level, category, message string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.state.Alerts = append(b.state.Alerts, NetworkAlert{
		ID:        fmt.Sprintf("alert-%d", time.Now().UnixNano()),
		Level:     level,
		Category:  category,
		Message:   message,
		CreatedAt: time.Now(),
	})
	if len(b.state.Alerts) > 50 {
		b.state.Alerts = b.state.Alerts[len(b.state.Alerts)-50:]
	}
}

func (b *SwarmBrain) Stop() {
	b.mu.Lock()
	b.running = false
	b.mu.Unlock()
	close(b.stopCh)
}
