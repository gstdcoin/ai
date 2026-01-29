package services

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// LoadBalancer manages task distribution across workers based on capacity and trust
type LoadBalancer struct {
	db          *sql.DB
	redis       *redis.Client
	workerStats sync.Map // Map[string]*WorkerCapacity
	mu          sync.RWMutex
}

type WorkerCapacity struct {
	WalletAddress string
	MaxTasks      int
	ActiveTasks   int
	TrustScore    float64
	LastSeen      time.Time
	CPUCores      int
	RAMGB         float64
	Stability     float64 // 0.0 to 1.0 based on uptime/response consistency
	BatteryLevel  int     // 0-100
	SignalQuality int     // 0-100
}

func NewLoadBalancer(db *sql.DB, rdb *redis.Client) *LoadBalancer {
	return &LoadBalancer{
		db:    db,
		redis: rdb,
	}
}


type TaskRequirements struct {
	MinTrust      float64
	RequiredCPU   int
	RequiredRAMGB float64
	IsHeavy       bool // BOINC or complex AI tasks
}

// SelectBestWorker finds the optimal worker for a given task
func (lb *LoadBalancer) SelectBestWorker(ctx context.Context, req TaskRequirements) (string, error) {
	activeWorkers, err := lb.getActiveWorkers(ctx)
	if err != nil {
		return "", err
	}

	var bestWorker string
	var bestScore float64 = -1e9

	for _, worker := range activeWorkers {
		// 1. Mandatory Constraint Checks
		if worker.ActiveTasks >= worker.MaxTasks {
			continue
		}
		if worker.TrustScore < req.MinTrust {
			continue
		}
		if req.RequiredCPU > 0 && worker.CPUCores < req.RequiredCPU {
			continue
		}
		if req.RequiredRAMGB > 0 && worker.RAMGB < req.RequiredRAMGB {
			continue
		}

		// 2. Heavy Task Specific Rules (BOINC)
		if req.IsHeavy {
			// Require at least 0.8 trust and high stability for BOINC
			if worker.TrustScore < 0.8 || worker.Stability < 0.9 {
				continue
			}
		}

		// 3. Scoring (Reputation Weighted Load Balancing + Preventive Health)
		// Score = (Trust * 40) + (Stability * 20) + (HealthRating * 30) - (LoadFactor * 20)
		loadFactor := float64(worker.ActiveTasks) / float64(worker.MaxTasks)
		
		// Health Rating (PROACTIVE)
		healthRating := 1.0
		if worker.BatteryLevel > 0 && worker.BatteryLevel < 20 {
			healthRating *= 0.2 // Severe penalty for low battery
		} else if worker.BatteryLevel > 0 && worker.BatteryLevel < 50 {
			healthRating *= 0.7 // Subtle penalty for moderate battery
		}
		
		if worker.SignalQuality > 0 && worker.SignalQuality < 30 {
			healthRating *= 0.5 // Penalty for weak signal
		}

		score := (worker.TrustScore * 40) + (worker.Stability * 20) + (healthRating * 30) - (loadFactor * 20)

		// Age penalty for stale workers (LastSeen more than 30s ago)
		if time.Since(worker.LastSeen) > 30*time.Second {
			score -= 50
		}

		if score > bestScore {
			bestScore = score
			bestWorker = worker.WalletAddress
		}
	}

	if bestWorker == "" {
		return "", fmt.Errorf("no suitable high-trust stable worker found for requirements")
	}

	return bestWorker, nil
}

// getActiveWorkers fetches online workers from Redis with their detailed stats
func (lb *LoadBalancer) getActiveWorkers(ctx context.Context) ([]*WorkerCapacity, error) {
	keys, err := lb.redis.Keys(ctx, "worker:online:*").Result()
	if err != nil {
		return nil, err
	}

	workers := make([]*WorkerCapacity, 0, len(keys))
	for _, key := range keys {
		wallet := key[14:]
		data, err := lb.redis.HGetAll(ctx, "capacity:"+wallet).Result()
		if err != nil || len(data) == 0 {
			// Try to sync from DB if Redis is missing detailed stats
			continue
		}

		w := &WorkerCapacity{WalletAddress: wallet}
		fmt.Sscanf(data["max_tasks"], "%d", &w.MaxTasks)
		fmt.Sscanf(data["active_tasks"], "%d", &w.ActiveTasks)
		fmt.Sscanf(data["trust_score"], "%f", &w.TrustScore)
		fmt.Sscanf(data["cpu_cores"], "%d", &w.CPUCores)
		fmt.Sscanf(data["ram_gb"], "%f", &w.RAMGB)
		fmt.Sscanf(data["stability"], "%f", &w.Stability)
		
		fmt.Sscanf(data["battery_level"], "%d", &w.BatteryLevel)
		fmt.Sscanf(data["signal_quality"], "%d", &w.SignalQuality)
		
		if ts, err := time.Parse(time.RFC3339, data["last_seen"]); err == nil {
			w.LastSeen = ts
		}

		workers = append(workers, w)
	}

	// If no workers in Redis, fallback to DB for initial population
	if len(workers) == 0 {
		rows, err := lb.db.QueryContext(ctx, `
			SELECT wallet_address, 10, trust_score, 0, cpu_model, ram_gb, 1.0, last_seen 
			FROM nodes WHERE status = 'online' AND last_seen > NOW() - INTERVAL '1 minute'
		`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var w WorkerCapacity
				var cpuModel string
				rows.Scan(&w.WalletAddress, &w.MaxTasks, &w.TrustScore, &w.ActiveTasks, &cpuModel, &w.RAMGB, &w.Stability, &w.LastSeen)
				w.CPUCores = 4 // Heuristic since CPU model parsing is complex
				workers = append(workers, &w)
			}
		}
	}

	return workers, nil
}
