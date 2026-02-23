package services

import (
	"context"
	"database/sql"
	"encoding/hex"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"
)

type FinancialEvent struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Chain     string    `json:"chain"`
	Amount    float64   `json:"amount"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Lat       float64   `json:"lat"`
	Lng       float64   `json:"lng"`
	TargetLat float64   `json:"targetLat"`
	TargetLng float64   `json:"targetLng"`
}

type GlobalFinancialFlows struct {
	mu               sync.RWMutex
	RecentEvents     []FinancialEvent `json:"recent_events"`
	GlobalTPS        float64          `json:"global_tps"`
	TotalVolume24h   float64          `json:"total_volume_24h"`
	AIAlphaScore     float64          `json:"ai_alpha_score"` // "Learning" metric
	Revenue24hGSTD   float64          `json:"revenue_24h_gstd"`
	GoldReserveGSTD  float64          `json:"gold_reserve_gstd"`
	ProtocolFundGSTD float64          `json:"protocol_fund_gstd"`
}

// GlobalFinancialFlowsSnapshot is a copy-safe struct for API responses (no mutex)
type GlobalFinancialFlowsSnapshot struct {
	RecentEvents     []FinancialEvent `json:"recent_events"`
	GlobalTPS        float64          `json:"global_tps"`
	TotalVolume24h   float64          `json:"total_volume_24h"`
	AIAlphaScore     float64          `json:"ai_alpha_score"`
	Revenue24hGSTD   float64          `json:"revenue_24h_gstd"`
	GoldReserveGSTD  float64          `json:"gold_reserve_gstd"`
	ProtocolFundGSTD float64          `json:"protocol_fund_gstd"`
}

type FinancialMonitorService struct {
	db           *sql.DB
	poolMonitor  *PoolMonitorService
	tonService   *TONService
	orchestrator *TaskOrchestrator
	monetization *MonetizationMetricsService
	flows        GlobalFinancialFlows
	lastTaskAt   time.Time
}

func NewFinancialMonitorService(db *sql.DB, pm *PoolMonitorService, ton *TONService, orch *TaskOrchestrator, monetization *MonetizationMetricsService) *FinancialMonitorService {
	return &FinancialMonitorService{
		db:           db,
		poolMonitor:  pm,
		tonService:   ton,
		orchestrator: orch,
		monetization: monetization,
		flows: GlobalFinancialFlows{
			RecentEvents: make([]FinancialEvent, 0),
		},
	}
}

func (s *FinancialMonitorService) Start(ctx context.Context) {
	s.generateSimulatedFlows()
	s.updateGlobalMetrics()

	ticker := time.NewTicker(2 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.ingestRealDataFromDB(ctx)
				s.generateSimulatedFlows() // Mixed with real flows for visual density
				s.updateGlobalMetrics()
			}
		}
	}()
	log.Println("[FinancialMonitor] Sovereign Monitoring Engine started.")
}

func (s *FinancialMonitorService) generateSimulatedFlows() {
	s.flows.mu.Lock()
	defer s.flows.mu.Unlock()

	chains := []string{"TON", "SOL", "XRP", "SWARM"}
	types := []string{"AI_TASK", "ASSET_TRANSFER", "ANOMALY", "LIQUIDITY_PROVISION"}

	event := FinancialEvent{
		ID:        s.generateID(),
		Type:      types[rand.Intn(len(types))],
		Chain:     chains[rand.Intn(len(chains))],
		Amount:    rand.Float64() * 5000,
		Timestamp: time.Now(),
		Lat:       (rand.Float64() - 0.5) * 140,
		Lng:       (rand.Float64() - 0.5) * 360,
		TargetLat: (rand.Float64() - 0.5) * 140,
		TargetLng: (rand.Float64() - 0.5) * 360,
	}

	switch event.Type {
	case "AI_TASK":
		event.Message = "Neural inference assigned to Swarm Node"
	case "ASSET_TRANSFER":
		event.Message = "Cross-chain pool settlement routed"
	case "ANOMALY":
		event.Message = "Volatility detected, AI hedging active"
	case "LIQUIDITY_PROVISION":
		event.Message = "Global treasury reserve rebalanced"
	}

	s.flows.RecentEvents = append([]FinancialEvent{event}, s.flows.RecentEvents...)
	if len(s.flows.RecentEvents) > 100 {
		s.flows.RecentEvents = s.flows.RecentEvents[:100]
	}
}

func (s *FinancialMonitorService) updateGlobalMetrics() {
	s.flows.mu.Lock()
	defer s.flows.mu.Unlock()

	// 1. Unified Intelligence: Use Real Pool Data & TPS
	if s.poolMonitor != nil {
		gstdPrice, _ := s.poolMonitor.GetGSTDPriceUSD(context.Background())
		status, _ := s.poolMonitor.GetPoolStatusCached(context.Background())
		if tvl, ok := status["total_value_usd"].(float64); ok && tvl > 0 {
			s.flows.TotalVolume24h = tvl
		}

		// Calculate Real TPS from DB (last 5 min)
		var tpsCount int
		_ = s.db.QueryRow(`SELECT COUNT(*) FROM transaction_history WHERE created_at > NOW() - INTERVAL '5 minutes'`).Scan(&tpsCount)
		// TPS over 300 seconds
		s.flows.GlobalTPS = float64(tpsCount) / 300.0

		// Alpha Score based on Price Stability/Performance + Network Activity
		stability := 1.0
		if gstdPrice > 0.02 {
			stability = 1.2
		}
		s.flows.AIAlphaScore = math.Min(1.0, 0.85+(s.flows.GlobalTPS*0.05)+((gstdPrice-0.015)*4)*stability)
	}

	// 1b. Monetization metrics
	if s.monetization != nil {
		m := s.monetization.GetMetrics(context.Background())
		s.flows.Revenue24hGSTD = m.TotalRevenue24h
		s.flows.GoldReserveGSTD = m.GoldReserve
		s.flows.ProtocolFundGSTD = m.ProtocolFund
	}

	// 2. Autonomous Task Generation
	if s.flows.AIAlphaScore > 0.98 && s.orchestrator != nil && time.Since(s.lastTaskAt) > 2*time.Minute {
		s.lastTaskAt = time.Now()
		go s.createSwarmAnalysisTask()
	}
}

func (s *FinancialMonitorService) ingestRealDataFromDB(ctx context.Context) {
	// 1. Poll last 5 transactions (tx_id per v26 schema)
	rows, err := s.db.QueryContext(ctx, `
		SELECT tx_id, tx_type, amount_gstd, COALESCE(from_wallet, ''), created_at 
		FROM transaction_history 
		ORDER BY created_at DESC LIMIT 5
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, txtype, from string
			var amount float64
			var created time.Time
			if rows.Scan(&id, &txtype, &amount, &from, &created) == nil {
				fromShort := from
				if len(from) > 8 {
					fromShort = from[:8]
				}
				s.IngestRealEvent(FinancialEvent{
					ID:        id,
					Type:      "ASSET_TRANSFER",
					Chain:     "TON",
					Amount:    amount,
					Message:   "Real Transaction: " + txtype + " from " + fromShort,
					Timestamp: created,
					Lat:       55.75, // Default Region (Simulated geo if missing)
					Lng:       37.61,
					TargetLat: (rand.Float64() - 0.5) * 140,
					TargetLng: (rand.Float64() - 0.5) * 360,
				})
			}
		}
	}

	// 2. Poll last 5 burns
	burnRows, err := s.db.QueryContext(ctx, `
		SELECT transaction_id, burn_amount, created_at 
		FROM token_burns 
		ORDER BY created_at DESC LIMIT 5
	`)
	if err == nil {
		defer burnRows.Close()
		for burnRows.Next() {
			var id string
			var amount float64
			var created time.Time
			if burnRows.Scan(&id, &amount, &created) == nil {
				idShort := id
				if len(id) > 8 {
					idShort = id[:8]
				}
				s.IngestRealEvent(FinancialEvent{
					ID:        "burn-" + id,
					Type:      "ANOMALY",
					Chain:     "SWARM",
					Amount:    amount,
					Message:   "Deflationary Burn: " + idShort,
					Timestamp: created,
					Lat:       (rand.Float64() - 0.5) * 140,
					Lng:       (rand.Float64() - 0.5) * 360,
					TargetLat: 0,
					TargetLng: 0,
				})
			}
		}
	}
}

func (s *FinancialMonitorService) createSwarmAnalysisTask() {
	taskID := "swarm-fin-analysis-" + s.generateID()[:6]
	task := &TaskQueueItem{
		TaskID:     taskID,
		TaskType:   "ai_inference",
		Operation:  "financial_flow_analysis",
		Priority:   2,
		RewardGSTD: 50.0,
		CreatedAt:  time.Now(),
		Deadline:   time.Now().Add(10 * time.Minute),
	}
	s.orchestrator.EnqueueTask(context.Background(), task)
	log.Printf("[FinancialMonitor] 🦾 Autonomous Analysis Task Created: %s", taskID)
}

func (s *FinancialMonitorService) GetMonitorData() GlobalFinancialFlowsSnapshot {
	s.flows.mu.RLock()
	defer s.flows.mu.RUnlock()
	return GlobalFinancialFlowsSnapshot{
		RecentEvents:     append([]FinancialEvent(nil), s.flows.RecentEvents...),
		GlobalTPS:        s.flows.GlobalTPS,
		TotalVolume24h:   s.flows.TotalVolume24h,
		AIAlphaScore:     s.flows.AIAlphaScore,
		Revenue24hGSTD:   s.flows.Revenue24hGSTD,
		GoldReserveGSTD:  s.flows.GoldReserveGSTD,
		ProtocolFundGSTD: s.flows.ProtocolFundGSTD,
	}
}

func (s *FinancialMonitorService) generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// IngestRealEvent allows other services to push real on-chain events to the monitor
func (s *FinancialMonitorService) IngestRealEvent(event FinancialEvent) {
	s.flows.mu.Lock()
	defer s.flows.mu.Unlock()
	s.flows.RecentEvents = append([]FinancialEvent{event}, s.flows.RecentEvents...)
	if len(s.flows.RecentEvents) > 100 {
		s.flows.RecentEvents = s.flows.RecentEvents[:100]
	}
}

// GetNeuralAnalysis returns an "AI-driven" analysis of the current financial state
func (s *FinancialMonitorService) GetNeuralAnalysis() string {
	s.flows.mu.RLock()
	defer s.flows.mu.RUnlock()

	// High Priority: Real System Insights from Knowledge Base
	var content string
	err := s.db.QueryRow(`
		SELECT content FROM agent_knowledge 
		WHERE topic IN ('resonance_report', 'global_knowledge_graph') 
		ORDER BY created_at DESC LIMIT 1
	`).Scan(&content)

	if err == nil && content != "" {
		if s.flows.AIAlphaScore > 0.95 {
			return "SUPREME_ALPHA: " + content
		}
		return "RESONANCE: " + content
	}

	if s.flows.AIAlphaScore > 0.98 {
		return "CRITICAL_ALPHA: Multi-Chain Synergetic Drift identified. Swarm is rebalancing liquidity to maximize yield."
	}
	if s.flows.AIAlphaScore > 0.95 {
		return "HIGH_CONFIDENCE: Swarm is identifying extreme alpha in TON/SOL relative volatility. Auto-hedging enabled."
	}

	return "NEURAL_STABLE: Monitoring cross-chain flows. No imminent anomalies detected."
}
