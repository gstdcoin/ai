package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/dgraph-io/ristretto/v2"
	"github.com/redis/go-redis/v9"
)

// ═══════════════════════════════════════════════════════════════
// CacheService — Two-tier caching: L1 Ristretto (local memory) + L2 Redis
//
// Read path:  L1 hit? → return instantly (nanoseconds)
//             L1 miss → L2 Redis hit? → promote to L1 + return (1-2ms)
//             L2 miss → cache miss → caller fetches from DB/API
//
// Write path: Write to L1 + L2 simultaneously
//
// Benefits:
//   - Hot keys (tokenomics, prices, node counts) served from local RAM
//   - Redis network I/O reduced by 80-90% for read-heavy paths
//   - L1 TTL: 5-10 seconds (prevents stale data in multi-instance)
//   - L2 TTL: 5 minutes (standard Redis cache)
// ═══════════════════════════════════════════════════════════════

type CacheService struct {
	redis  *redis.Client
	local  *ristretto.Cache[string, []byte]
	ttl    time.Duration
	l1TTL  time.Duration
	l1Hits int64
	l2Hits int64
	misses int64
}

func NewCacheService(redisClient *redis.Client) *CacheService {
	// Initialize Ristretto L1 cache
	// MaxCost 64MB, NumCounters 10x expected items
	cache, err := ristretto.NewCache(&ristretto.Config[string, []byte]{
		NumCounters: 100_000,     // 100K counters for admission policy
		MaxCost:     64_000_000,  // 64MB max memory
		BufferItems: 64,          // 64 keys per Get buffer
	})
	if err != nil {
		log.Printf("⚠️ Ristretto L1 cache init failed: %v (using Redis-only)", err)
		return &CacheService{
			redis: redisClient,
			ttl:   5 * time.Minute,
			l1TTL: 5 * time.Second,
		}
	}

	log.Printf("⚡ Cache: L1 Ristretto (64MB local) + L2 Redis (two-tier)")
	return &CacheService{
		redis: redisClient,
		local: cache,
		ttl:   5 * time.Minute,
		l1TTL: 5 * time.Second,
	}
}

// Get retrieves a value from cache (L1 → L2 fallthrough)
func (c *CacheService) Get(ctx context.Context, key string, dest interface{}) error {
	// L1: Check local Ristretto cache first (nanosecond access)
	if c.local != nil {
		if val, found := c.local.Get(key); found {
			c.l1Hits++
			return json.Unmarshal(val, dest)
		}
	}

	// L2: Fallthrough to Redis
	val, err := c.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		c.misses++
		return fmt.Errorf("cache miss")
	}
	if err != nil {
		return err
	}

	c.l2Hits++

	// Promote to L1 for future reads
	if c.local != nil {
		c.local.SetWithTTL(key, []byte(val), int64(len(val)), c.l1TTL)
	}

	return json.Unmarshal([]byte(val), dest)
}

// Set stores a value in both L1 and L2 cache
func (c *CacheService) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	if ttl == 0 {
		ttl = c.ttl
	}

	// Write to L1 (local memory)
	if c.local != nil {
		l1ttl := c.l1TTL
		if ttl < l1ttl {
			l1ttl = ttl
		}
		c.local.SetWithTTL(key, data, int64(len(data)), l1ttl)
	}

	// Write to L2 (Redis)
	return c.redis.Set(ctx, key, data, ttl).Err()
}

// Delete removes a key from both L1 and L2
func (c *CacheService) Delete(ctx context.Context, key string) error {
	if c.local != nil {
		c.local.Del(key)
	}
	return c.redis.Del(ctx, key).Err()
}

// InvalidatePattern removes all keys matching a pattern
func (c *CacheService) InvalidatePattern(ctx context.Context, pattern string) error {
	keys, err := c.redis.Keys(ctx, pattern).Result()
	if err != nil {
		return err
	}

	// Clear from L1
	if c.local != nil {
		for _, k := range keys {
			c.local.Del(k)
		}
	}

	// Clear from L2
	if len(keys) > 0 {
		return c.redis.Del(ctx, keys...).Err()
	}

	return nil
}

// GetCacheStats returns hit/miss statistics for monitoring
func (c *CacheService) GetCacheStats() map[string]interface{} {
	total := c.l1Hits + c.l2Hits + c.misses
	hitRate := float64(0)
	if total > 0 {
		hitRate = float64(c.l1Hits+c.l2Hits) / float64(total) * 100
	}
	result := map[string]interface{}{
		"l1_hits":  c.l1Hits,
		"l2_hits":  c.l2Hits,
		"misses":   c.misses,
		"hit_rate": fmt.Sprintf("%.1f%%", hitRate),
		"engine":   "ristretto+redis",
	}
	if c.local != nil {
		metrics := c.local.Metrics
		if metrics != nil {
			result["l1_cost_added"] = metrics.CostAdded()
			result["l1_cost_evicted"] = metrics.CostEvicted()
		}
	}
	return result
}

// Cache keys
const (
	CacheKeyDeviceTrust = "device:trust:%s"
	CacheKeyTaskList    = "tasks:available:%s:%s" // deviceID:region
	CacheKeyGSTDBalance = "gstd:balance:%s"
	CacheKeyNetworkTemp = "network:temperature"
	CacheKeyTaskStats   = "stats:tasks:%s" // date
)
