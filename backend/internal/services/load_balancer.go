package services

import (
	"context"
	"database/sql"
	"fmt"
	"math"
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
}

func NewLoadBalancer(db *sql.DB, rdb *redis.Client) *LoadBalancer {
	return &LoadBalancer{
		db:    db,
		redis: rdb,
	}
}

// SelectBestWorker finds the optimal worker for a given task
func (lb *LoadBalancer) SelectBestWorker(ctx context.Context, taskRequirements TaskRequirements) (string, error) {
	lb.mu.RLock()
	defer lb.mu.RUnlock()

	var bestWorker string
	var bestScore float64 = -1

	// In a real system, we would query Redis/DB for active workers. 
	// Here we iterate over the in-memory cache synchronized from DB.
	activeWorkers, err := lb.getActiveWorkers(ctx)
	if err != nil {
		return "", err
	}

	for _, worker := range activeWorkers {
		// 1. Hard Constraints
		if !lb.meetsConstraints(worker, taskRequirements) {
			continue
		}

		// 2. Score Calculation (Weighted Round Robin adaptation)
		// Score = (TrustScore * 20) - (LoadPercentage * 10) + RandomJitter
		loadPct := float64(worker.ActiveTasks) / float64(worker.MaxTasks)
		
		// Penalty for high load
		if loadPct >= 0.9 {
			continue // Circuit breaker for overloaded workers
		}

		score := (worker.TrustScore * 20) - (loadPct * 100)

		if score > bestScore {
			bestScore = score
			bestWorker = worker.WalletAddress
		}
	}

	if bestWorker == "" {
		return "", fmt.Errorf("no suitable worker found")
	}

	return bestWorker, nil
}

// getActiveWorkers fetches online workers from Redis
func (lb *LoadBalancer) getActiveWorkers(ctx context.Context) ([]*WorkerCapacity, error) {
	// Pattern scan for online workers
	keys, err := lb.redis.Keys(ctx, "worker:online:*").Result()
	if err != nil {
		return nil, err
	}

	workers := make([]*WorkerCapacity, 0, len(keys))
	for _, key := range keys {
		// Fetch capacity data
		// Format: hash with 'active_tasks', 'trust_score' etc.
		data, err := lb.redis.HGetAll(ctx, "capacity:"+key[14:]).Result() 
		if err == nil {
			// Parse logic here (omitted for brevity)
			// workers = append(workers, &WorkerCapacity{...})
		}
	}
	return workers, nil
}

func (lb *LoadBalancer) meetsConstraints(worker *WorkerCapacity, req TaskRequirements) bool {
	if worker.ActiveTasks >= worker.MaxTasks {
		return false
	}
	// Add more checks: Region, Hardware, Whitelist...
	return true
}

type TaskRequirements struct {
	MinTrust      float64
	RequiredCPU   int
	RequiredRAM   int
}
