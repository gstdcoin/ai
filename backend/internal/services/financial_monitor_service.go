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
	"unicode"
)

// sanitizeForDisplay keeps only printable runes, truncates to maxLen
func sanitizeForDisplay(s string, maxLen int) string {
	var out []rune
	for _, r := range s {
		if unicode.IsPrint(r) && r != 0 {
			out = append(out, r)
			if len(out) >= maxLen {
				break
			}
		}
	}
	if len(out) == 0 {
		return "unknown"
	}
	return string(out)
}

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

		// Calculate Real TPS from DB (last 5 min); floor for bootstrap so network feels alive
		var tpsCount int
		if s.db != nil {
			_ = s.db.QueryRow(`SELECT COUNT(*) FROM transaction_history WHERE created_at > NOW() - INTERVAL '5 minutes'`).Scan(&tpsCount)
		}
		s.flows.GlobalTPS = math.Max(8.0, float64(tpsCount)/300.0) // 8 TPS floor when cold

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

	// 2. Autonomous Task Generation — lower threshold for more swarm activity (0.92 instead of 0.98)
	if s.flows.AIAlphaScore > 0.92 && s.orchestrator != nil && time.Since(s.lastTaskAt) > 90*time.Second {
		s.lastTaskAt = time.Now()
		go s.createSwarmAnalysisTask()
	}
}

func (s *FinancialMonitorService) ingestRealDataFromDB(ctx context.Context) {
	if s.db == nil {
		return
	}
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
				idSafe := sanitizeForDisplay(id, 32)
				fromSafe := sanitizeForDisplay(from, 12)
				s.IngestRealEvent(FinancialEvent{
					ID:        idSafe,
					Type:      "ASSET_TRANSFER",
					Chain:     "TON",
					Amount:    amount,
					Message:   "Real Transaction: " + txtype + " from " + fromSafe,
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
				idSafe := sanitizeForDisplay(id, 12)
				s.IngestRealEvent(FinancialEvent{
					ID:        "burn-" + idSafe,
					Type:      "ANOMALY",
					Chain:     "SWARM",
					Amount:    amount,
					Message:   "Deflationary Burn: " + idSafe,
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
	reward := 50.0
	ctx := context.Background()

	if s.db != nil {
		_, _ = s.db.ExecContext(ctx, `
		INSERT INTO tasks (task_id, requester_address, creator_wallet, task_type, operation,
			labor_compensation_gstd, reward_gstd, reward_per_worker, status, escrow_status,
			priority, priority_score, min_trust_score, created_at, updated_at)
		VALUES ($1, 'PLATFORM_ORGANISM', 'PLATFORM_ORGANISM', 'ai_inference', 'financial_flow_analysis',
			$2, $2, $2, 'queued', 'none', 2, 2, 0, NOW(), NOW())
		ON CONFLICT (task_id) DO NOTHING
	`, taskID, reward)
	}

	task := &TaskQueueItem{
		TaskID:     taskID,
		TaskType:   "ai_inference",
		Operation:  "financial_flow_analysis",
		Priority:   2,
		RewardGSTD: reward,
		CreatedAt:  time.Now(),
		Deadline:   time.Now().Add(10 * time.Minute),
	}
	if s.orchestrator != nil {
		s.orchestrator.EnqueueTask(ctx, task)
	}
	log.Printf("[FinancialMonitor] 🦾 Autonomous Analysis Task Created: %s (DB+Redis)", taskID)
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

// GetCirculatingAndVolume24h returns circulating GSTD (supply - burned) and 24h volume in GSTD
func (s *FinancialMonitorService) GetCirculatingAndVolume24h(ctx context.Context) (circulating, volume24h float64) {
	const defaultSupply = 10_000_000.0
	if s.db == nil {
		return defaultSupply, 0
	}
	var totalBurned float64
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns`).Scan(&totalBurned)
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(ABS(amount_gstd)), 0) FROM transaction_history WHERE created_at > NOW() - INTERVAL '24 hours'`).Scan(&volume24h)
	circulating = defaultSupply - totalBurned
	if circulating < 0 {
		circulating = defaultSupply * 0.9
	}
	return circulating, volume24h
}

// GetNeuralAnalysis returns an "AI-driven" analysis of the current financial state
func (s *FinancialMonitorService) GetNeuralAnalysis() string {
	s.flows.mu.RLock()
	defer s.flows.mu.RUnlock()

	if s.db == nil {
		return "NEURAL_STABLE: Monitoring cross-chain flows. No imminent anomalies detected."
	}
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
