package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// CacheService provides caching functionality for frequently accessed data
type CacheService struct {
	redis *redis.Client
	ttl   time.Duration
}

func NewCacheService(redis *redis.Client) *CacheService {
	return &CacheService{
		redis: redis,
		ttl:   5 * time.Minute, // Default TTL: 5 minutes
	}
}

// Get retrieves a value from cache
func (c *CacheService) Get(ctx context.Context, key string, dest interface{}) error {
	val, err := c.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return fmt.Errorf("cache miss")
	}
	if err != nil {
		return err
	}

	return json.Unmarshal([]byte(val), dest)
}

// Set stores a value in cache with TTL
func (c *CacheService) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	if ttl == 0 {
		ttl = c.ttl
	}

	return c.redis.Set(ctx, key, data, ttl).Err()
}

// Delete removes a key from cache
func (c *CacheService) Delete(ctx context.Context, key string) error {
	return c.redis.Del(ctx, key).Err()
}

// InvalidatePattern removes all keys matching a pattern
func (c *CacheService) InvalidatePattern(ctx context.Context, pattern string) error {
	keys, err := c.redis.Keys(ctx, pattern).Result()
	if err != nil {
		return err
	}

	if len(keys) > 0 {
		return c.redis.Del(ctx, keys...).Err()
	}

	return nil
}

// Cache keys
const (
	CacheKeyDeviceTrust    = "device:trust:%s"
	CacheKeyTaskList       = "tasks:available:%s:%s" // deviceID:region
	CacheKeyGSTDBalance    = "gstd:balance:%s"
	CacheKeyNetworkTemp     = "network:temperature"
	CacheKeyTaskStats       = "stats:tasks:%s" // date
)

