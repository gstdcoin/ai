package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/lib/pq"
)

// EquilibriumState represents the global state of the GSTD organism
type EquilibriumState struct {
	HealthScore      float64   `json:"health_score"`   // 0-1
	OmniChainTVL     float64   `json:"omni_chain_tvl"` // Combined TVL
	GlobalTFLOPS     float64   `json:"global_tflops"`  // Unified compute capacity
	BackingRatio     float64   `json:"backing_ratio"`  // Ratio of Gold/Assets vs GSTD Supply
	DeflationRate    float64   `json:"deflation_rate"` // Current burn speed
	LastAdjustmentAt time.Time `json:"last_adjustment_at"`
	Revenue24h       float64   `json:"revenue_24h"`       // Monetization: 24h platform revenue
	GoldReserve      float64   `json:"gold_reserve"`     // Gold reserve balance GSTD
	ProtocolFund     float64   `json:"protocol_fund"`    // Protocol fund balance GSTD
	LastDecision     string    `json:"last_decision"`     // STIMULATE | ACCELERATE | BUYBACK | STABLE | LEARN
	LastDecisionAt   time.Time `json:"last_decision_at"`
	TasksPending     int64     `json:"tasks_pending"`     // From orchestrator
	TasksCompleted   int64     `json:"tasks_completed"`   // From orchestrator
}

// OrganismNotifier sends organism decision alerts (e.g. Telegram)
type OrganismNotifier interface {
	SendMessage(ctx context.Context, message string) error
}

// SovereignOrganismService is the "Brain" that unifies all components
type SovereignOrganismService struct {
	db           *sql.DB
	monitor      *FinancialMonitorService
	pool         *PoolMonitorService
	burn         *BurnService
	treasury     *TreasuryService
	equilibrium  *DynamicEquilibriumService
	orchestrator *TaskOrchestrator
	monetization *MonetizationMetricsService
	notifier     OrganismNotifier

	state EquilibriumState
	mu    sync.RWMutex
}

func NewSovereignOrganismService(
	db *sql.DB,
	monitor *FinancialMonitorService,
	pool *PoolMonitorService,
	burn *BurnService,
	treasury *TreasuryService,
	equilibrium *DynamicEquilibriumService,
	orchestrator *TaskOrchestrator,
	monetization *MonetizationMetricsService,
	notifier OrganismNotifier,
) *SovereignOrganismService {
	return &SovereignOrganismService{
		db:           db,
		monitor:      monitor,
		pool:         pool,
		burn:         burn,
		treasury:     treasury,
		equilibrium:  equilibrium,
		orchestrator: orchestrator,
		monetization: monetization,
		notifier:     notifier,
	}
}

func (s *SovereignOrganismService) Start(ctx context.Context) {
	log.Println("🧠 Sovereign Organism: Neural Link Established. Starting Autonomous Heartbeat.")

	// Initial Run
	s.performHeartbeat(ctx)

	// Heartbeat: Every 60s
	ticker := time.NewTicker(60 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.performHeartbeat(ctx)
			}
		}
	}()
}

func (s *SovereignOrganismService) performHeartbeat(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Gather Intelligence
	monitorData := s.monitor.GetMonitorData()
	gstdPrice, _ := s.pool.GetGSTDPriceUSD(ctx)
	if gstdPrice == 0 {
		gstdPrice = 0.015
	}

	// 2. Calculate Health Score
	// Metrics: Activity (TPS + task throughput), Value (TVL), Performance (Alpha Score)
	activity := math.Min(1.0, monitorData.GlobalTPS/1000.0)
	alpha := monitorData.AIAlphaScore

	// Task throughput factor: more completed tasks = healthier
	if s.orchestrator != nil {
		if stats, err := s.orchestrator.GetQueueStats(ctx); err == nil {
			if pending, ok := stats["pending"].(int64); ok {
				s.state.TasksPending = pending
			}
			if completed, ok := stats["completed"].(int64); ok {
				s.state.TasksCompleted = completed
			}
			// Boost activity if queue is being processed
			taskActivity := math.Min(1.0, float64(s.state.TasksCompleted)/1000.0)
			activity = math.Max(activity, taskActivity*0.3)
		}
	}

	// Health Score = weighted average
	s.state.HealthScore = (activity * 0.4) + (alpha * 0.6)
	s.state.OmniChainTVL = monitorData.TotalVolume24h // Using volume as proxy for now
	s.state.LastAdjustmentAt = time.Now()

	// Monetization state
	if s.monetization != nil {
		m := s.monetization.GetMetrics(ctx)
		s.state.Revenue24h = m.TotalRevenue24h
		s.state.GoldReserve = m.GoldReserve
		s.state.ProtocolFund = m.ProtocolFund
	}

	log.Printf("[Sovereign Organism] Pulse: Health=%.2f, TVL=$%.2f, Price=$%.5f",
		s.state.HealthScore, s.state.OmniChainTVL, gstdPrice)

	// 3. Autonomous Decision Making (Monetization & Stabilization)
	decision := "STABLE"
	now := time.Now()

	// DECISION A: If Health is low (< 0.5), stimulate the network
	if s.state.HealthScore < 0.5 {
		decision = "STIMULATE"
		s.state.LastDecision = decision
		s.state.LastDecisionAt = now
		log.Println("[Sovereign Organism] 📉 Low Activity Detected. Triggering Stimulation.")
		s.notifyDecision(ctx, "STIMULATE", "Low activity (Health %.2f). Stimulating network.", s.state.HealthScore)
		s.stimulateNetwork(ctx)
	} else if s.state.HealthScore > 0.8 {
		// DECISION B: If Health is high (> 0.8), accelerate deflation and backing
		decision = "ACCELERATE"
		s.state.LastDecision = decision
		s.state.LastDecisionAt = now
		log.Println("[Sovereign Organism] 📈 Peak Performance. Accelerating Value Accrual.")
		s.notifyDecision(ctx, "ACCELERATE", "Peak performance (Health %.2f). Accelerating value accrual.", s.state.HealthScore)
		s.accelerateValueAccrual(ctx)
	} else if gstdPrice < 0.01 {
		// DECISION C: Buyback and Burn if price is below target
		decision = "BUYBACK"
		s.state.LastDecision = decision
		s.state.LastDecisionAt = now
		s.notifyDecision(ctx, "BUYBACK", "Price $%.4f below support. Emergency buyback triggered.", gstdPrice)
		s.triggerEmergencyBuyback(ctx)
	} else {
		s.state.LastDecision = decision
		s.state.LastDecisionAt = now
	}

	// DECISION D: Cognitive Evolution (Every 5 heartbeats)
	if now.Minute()%5 == 0 {
		s.state.LastDecision = "LEARN"
		s.state.LastDecisionAt = now
		s.summarizeAndLearn(ctx)
	}

	// 4. Update Database for Global Analytics
	s.updateGlobalStateDB(ctx)
}

func (s *SovereignOrganismService) summarizeAndLearn(ctx context.Context) {
	// Synthesize current state into a Knowledge Item for the Swarm
	content := fmt.Sprintf("Homeostasis Report: OCHI at %.2f. Network throughput at %.2f TPS. Global liquidity optimized at $%.2f. System sentiment: EVOLUTIONARY.",
		s.state.HealthScore, s.monitor.GetMonitorData().GlobalTPS, s.state.OmniChainTVL)

	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO agent_knowledge (agent_id, topic, content, tags, created_at)
		VALUES ('ORGANISM', 'global_knowledge_graph', $1, $2, NOW())
	`, content, pq.Array([]string{"homeostasis", "evolution", "achi"}))

	log.Println("🧠 [Sovereign Organism] Cognitive Evolution: State synthesized and shared with the Swarm.")
}

func (s *SovereignOrganismService) stimulateNetwork(ctx context.Context) {
	// Lower fees via Equilibrium to attract users
	// This is handled by DynamicEquilibrium but we can force an adjustment
	s.equilibrium.RunAntiPriceBarrier(ctx)

	// Generate High-Reward Bounty Tasks in Swarm
	task := &TaskQueueItem{
		TaskID:     "stimulus-" + s.monitor.generateID()[:6],
		TaskType:   "swarm_optimization",
		Operation:  "network_integrity_check",
		Priority:   1,     // Top Priority
		RewardGSTD: 100.0, // High reward
		CreatedAt:  time.Now(),
		Deadline:   time.Now().Add(1 * time.Hour),
	}
	s.orchestrator.EnqueueTask(ctx, task)
}

func (s *SovereignOrganismService) accelerateValueAccrual(ctx context.Context) {
	// 1. Process Gold Reserves: Convert platform profit into XAUt (Gold)
	if err := s.treasury.ProcessGoldReserves(ctx); err != nil {
		log.Printf("⚠️ Treasury processing error: %v", err)
	}

	// 2. Monetization: Log revenue metrics when in peak performance
	if s.monetization != nil {
		metrics := s.monetization.GetMetrics(ctx)
		log.Printf("[Sovereign Organism] 📊 Monetization: 24h=%.2f GSTD | Gold Reserve=%.2f | Protocol=%.2f",
			metrics.TotalRevenue24h, metrics.GoldReserve, metrics.ProtocolFund)
	}
}

func (s *SovereignOrganismService) triggerEmergencyBuyback(ctx context.Context) {
	// Use portion of backing fund to buy GSTD and burn it
	log.Println("🔥 [Sovereign Organism] Emergency Buyback Triggered: Price below support.")
	// In a real system, this would call StonFi.SwapXAUtToGSTD and then BurnService.RecordBurn
	// Simulation:
	s.burn.RecordBurn(ctx, &BurnRecord{
		TransactionID:   "emergency-buyback-" + s.monitor.generateID()[:4],
		TransactionType: "EMERGENCY_STABILIZATION",
		OriginalAmount:  10000.0,
		BurnAmount:      10000.0,
		SourceWallet:    "PLATFORM_TREASURY",
	})
}

func (s *SovereignOrganismService) updateGlobalStateDB(ctx context.Context) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO global_organism_state (health_score, omni_tvl, global_tflops, updated_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (id) DO UPDATE SET
			health_score = EXCLUDED.health_score,
			omni_tvl = EXCLUDED.omni_tvl,
			global_tflops = EXCLUDED.global_tflops,
			updated_at = NOW()
	`, s.state.HealthScore, s.state.OmniChainTVL, 14502.0) // 14502 is placeholder for now
	if err != nil {
		// Try creating table if missing
		s.ensureSchema()
	}
}

func (s *SovereignOrganismService) ensureSchema() {
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS global_organism_state (
			id INTEGER PRIMARY KEY DEFAULT 1,
			health_score DECIMAL(5,4),
			omni_tvl DECIMAL(20,2),
			global_tflops DECIMAL(20,2),
			updated_at TIMESTAMP
		);
		INSERT INTO global_organism_state (id, health_score) VALUES (1, 0.5) ON CONFLICT (id) DO NOTHING;
	`)
}

func (s *SovereignOrganismService) notifyDecision(ctx context.Context, decision, format string, args ...interface{}) {
	if s.notifier == nil {
		return
	}
	msg := fmt.Sprintf("🧠 <b>Organism</b>: %s — "+format, append([]interface{}{decision}, args...)...)
	_ = s.notifier.SendMessage(ctx, msg)
}

func (s *SovereignOrganismService) GetState() EquilibriumState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}
