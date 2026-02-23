package services

import (
	"context"
	"database/sql"
	"sync"
	"time"
)

// EcosystemStats aggregates platform, bot, devices, users for the unified organism
type EcosystemStats struct {
	// Platform
	ActiveNodes    int   `json:"active_nodes"`
	ActiveDevices  int   `json:"active_devices"`
	TotalUsers     int   `json:"total_users"`
	NewUsers24h    int   `json:"new_users_24h"`
	ActiveCountries int  `json:"active_countries"`

	// Tasks
	TasksPending   int   `json:"tasks_pending"`
	TasksAssigned  int   `json:"tasks_assigned"`
	TasksCompleted int   `json:"tasks_completed"`
	TasksProcessing int  `json:"tasks_processing"`

	// Bot
	TelegramLinked int   `json:"telegram_linked"`

	// Multichain (TON primary)
	ChainTON       bool  `json:"chain_ton"` // Always true when pool connected
	LastUpdatedAt  string `json:"last_updated_at"`
}

// OrganismHubService provides unified ecosystem view for the autonomous organism.
// Aggregates: Platform, Bot, Devices, Users, Multichain, Analytics.
type OrganismHubService struct {
	db    *sql.DB
	mu    sync.RWMutex
	cache EcosystemStats
	at    time.Time
}

// NewOrganismHubService creates the hub
func NewOrganismHubService(db *sql.DB) *OrganismHubService {
	return &OrganismHubService{db: db}
}

// GetEcosystemStats returns current ecosystem stats (cached 15s)
func (s *OrganismHubService) GetEcosystemStats(ctx context.Context) EcosystemStats {
	s.mu.RLock()
	if time.Since(s.at) < 15*time.Second && !s.at.IsZero() {
		e := s.cache
		s.mu.RUnlock()
		return e
	}
	s.mu.RUnlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.at) < 15*time.Second {
		return s.cache
	}

	e := s.refresh(ctx)
	s.cache = e
	s.at = time.Now()
	return e
}

func (s *OrganismHubService) refresh(ctx context.Context) EcosystemStats {
	e := EcosystemStats{ChainTON: true}

	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'`).Scan(&e.ActiveNodes)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM devices WHERE last_seen_at > NOW() - INTERVAL '5 minutes' AND is_active = true`).Scan(&e.ActiveDevices)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&e.TotalUsers)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours'`).Scan(&e.NewUsers24h)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT country) FROM nodes WHERE status = 'online' AND country IS NOT NULL AND country != ''`).Scan(&e.ActiveCountries)

	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE status IN ('pending','queued')`).Scan(&e.TasksPending)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE status IN ('assigned','executing')`).Scan(&e.TasksAssigned)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE status = 'completed'`).Scan(&e.TasksCompleted)
	e.TasksProcessing = e.TasksAssigned

	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM telegram_users WHERE wallet_address IS NOT NULL`).Scan(&e.TelegramLinked)

	e.LastUpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return e
}
