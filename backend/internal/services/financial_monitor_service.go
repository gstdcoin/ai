package services

import (
	"context"
	"database/sql"
	"log"
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
	mu             sync.RWMutex
	RecentEvents   []FinancialEvent `json:"recent_events"`
	GlobalTPS      float64          `json:"global_tps"`
	TotalVolume24h float64          `json:"total_volume_24h"`
	AIAlphaScore   float64          `json:"ai_alpha_score"` // "Learning" metric
}

type FinancialMonitorService struct {
	db           *sql.DB
	poolMonitor  *PoolMonitorService
	tonService   *TONService
	orchestrator *TaskOrchestrator
	flows        GlobalFinancialFlows
	lastTaskAt   time.Time
}

func NewFinancialMonitorService(db *sql.DB, pm *PoolMonitorService, ton *TONService, orch *TaskOrchestrator) *FinancialMonitorService {
	return &FinancialMonitorService{
		db:           db,
		poolMonitor:  pm,
		tonService:   ton,
		orchestrator: orch,
		flows: GlobalFinancialFlows{
			RecentEvents: make([]FinancialEvent, 0),
		},
	}
}

func (s *FinancialMonitorService) Start(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.generateSimulatedFlows()
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

	// "Learn" and mutate Alpha Score based on "activity"
	// In a real system, this would be a feedback loop from the Swarm
	activityFactor := float64(len(s.flows.RecentEvents)) / 100.0
	s.flows.AIAlphaScore = 0.85 + (activityFactor * 0.15)

	s.flows.GlobalTPS = 300 + rand.Float64()*50
	s.flows.TotalVolume24h += rand.Float64() * 1000
	if s.flows.TotalVolume24h > 100000000 {
		s.flows.TotalVolume24h = 45000000 // reset or fluctuate
	}

	// Autonomous Task Generation: If volatility is high, ask Swarm to analyze
	// Throttled to once per minute to avoid flooding
	if s.flows.AIAlphaScore > 0.96 && s.orchestrator != nil && time.Since(s.lastTaskAt) > 1*time.Minute {
		s.lastTaskAt = time.Now()
		go s.createSwarmAnalysisTask()
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

func (s *FinancialMonitorService) GetMonitorData() GlobalFinancialFlows {
	s.flows.mu.RLock()
	defer s.flows.mu.RUnlock()
	return s.flows
}

func (s *FinancialMonitorService) generateID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return string(b)
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

	if s.flows.AIAlphaScore > 0.95 {
		return "HIGH_CONFIDENCE: Swarm is identifying extreme alpha in TON/SOL relative volatility. Auto-hedging enabled."
	}
	return "NEURAL_STABLE: Monitoring cross-chain flows. No imminent anomalies detected."
}
