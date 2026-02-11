package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// KVCacheService implements Adaptive KV-Caching for distributed LLM inference.
// Instead of sending full conversation history with every request, intermediate
// KV-cache states are stored on edge nodes close to the user.
//
// Architecture:
//   1. First request: full prompt processed, KV-cache generated
//   2. KV-cache hash stored in Redis with edge node mapping
//   3. Follow-up messages: only send new tokens + cache reference
//   4. Edge node loads cached KV state → 5-10x faster continuation
//
// This dramatically reduces Time-to-First-Token for multi-turn conversations.
type KVCacheService struct {
	redis *redis.Client
}

// CachedContext represents a stored KV-cache entry
type CachedContext struct {
	CacheID       string    `json:"cache_id"`
	SessionID     string    `json:"session_id"`
	WalletAddress string    `json:"wallet_address"`
	Model         string    `json:"model"`
	TokenCount    int       `json:"token_count"`    // Tokens in cached context
	MessageCount  int       `json:"message_count"`  // Messages in conversation
	NodeID        string    `json:"node_id"`        // Edge node holding the cache
	ContextHash   string    `json:"context_hash"`   // SHA256 of message history
	CreatedAt     time.Time `json:"created_at"`
	ExpiresAt     time.Time `json:"expires_at"`
	SizeBytes     int64     `json:"size_bytes"`     // Estimated KV-cache size
}

// CacheHit represents the result of a cache lookup
type CacheHit struct {
	Found         bool   `json:"found"`
	CacheID       string `json:"cache_id,omitempty"`
	NodeID        string `json:"node_id,omitempty"`       // Route to this node for fast inference
	TokensSaved   int    `json:"tokens_saved,omitempty"`  // How many tokens we skip
	NewTokensOnly int    `json:"new_tokens_only"`         // Tokens to process
	SpeedupFactor float64 `json:"speedup_factor"`         // Estimated speedup (e.g., 5.2x)
}

func NewKVCacheService(redis *redis.Client) *KVCacheService {
	return &KVCacheService{redis: redis}
}

// LookupCache checks if a conversation context is already cached on an edge node
func (s *KVCacheService) LookupCache(ctx context.Context, walletAddress string, model string, messages []map[string]string) (*CacheHit, error) {
	// Generate hash from conversation history (minus last message)
	if len(messages) < 2 {
		return &CacheHit{Found: false, NewTokensOnly: countTokensEstimate(messages), SpeedupFactor: 1.0}, nil
	}

	// Hash all messages except the latest (the new user query)
	previousMessages := messages[:len(messages)-1]
	contextHash := hashMessages(previousMessages)
	cacheKey := fmt.Sprintf("kvcache:%s:%s:%s", walletAddress, model, contextHash)

	// Check Redis for cached context
	val, err := s.redis.Get(ctx, cacheKey).Result()
	if err == redis.Nil {
		// Cache miss
		return &CacheHit{
			Found:         false,
			NewTokensOnly: countTokensEstimate(messages),
			SpeedupFactor: 1.0,
		}, nil
	}
	if err != nil {
		return nil, err
	}

	var cached CachedContext
	if err := json.Unmarshal([]byte(val), &cached); err != nil {
		return nil, err
	}

	// Cache hit! Calculate savings
	totalTokens := countTokensEstimate(messages)
	newTokens := countTokensEstimate(messages[len(messages)-1:])
	savedTokens := totalTokens - newTokens
	speedup := 1.0
	if newTokens > 0 && savedTokens > 0 {
		speedup = float64(totalTokens) / float64(newTokens)
	}

	log.Printf("🎯 KV-Cache HIT: session=%s, saved %d tokens, speedup=%.1fx, node=%s",
		cached.SessionID, savedTokens, speedup, cached.NodeID)

	return &CacheHit{
		Found:         true,
		CacheID:       cached.CacheID,
		NodeID:        cached.NodeID,
		TokensSaved:   savedTokens,
		NewTokensOnly: newTokens,
		SpeedupFactor: speedup,
	}, nil
}

// StoreCache saves a KV-cache reference after inference completes
func (s *KVCacheService) StoreCache(ctx context.Context, walletAddress, model, nodeID, sessionID string, messages []map[string]string) error {
	contextHash := hashMessages(messages)
	cacheKey := fmt.Sprintf("kvcache:%s:%s:%s", walletAddress, model, contextHash)

	totalTokens := countTokensEstimate(messages)
	// Estimate KV-cache size: ~0.5MB per 1000 tokens for 7B model
	sizeBytes := int64(totalTokens) * 512

	cached := CachedContext{
		CacheID:       fmt.Sprintf("kv-%s-%d", contextHash[:8], time.Now().UnixNano()),
		SessionID:     sessionID,
		WalletAddress: walletAddress,
		Model:         model,
		TokenCount:    totalTokens,
		MessageCount:  len(messages),
		NodeID:        nodeID,
		ContextHash:   contextHash,
		CreatedAt:     time.Now(),
		ExpiresAt:     time.Now().Add(30 * time.Minute), // 30min TTL
		SizeBytes:     sizeBytes,
	}

	data, _ := json.Marshal(cached)

	// Store with TTL
	err := s.redis.Set(ctx, cacheKey, data, 30*time.Minute).Err()
	if err != nil {
		return err
	}

	// Also index by session for cleanup
	s.redis.SAdd(ctx, fmt.Sprintf("kvcache:sessions:%s", walletAddress), cacheKey)

	log.Printf("💾 KV-Cache stored: %s (%d tokens, %d messages, node=%s, size=%.1fMB)",
		cached.CacheID, totalTokens, len(messages), nodeID, float64(sizeBytes)/1024/1024)

	return nil
}

// InvalidateSession clears all cached contexts for a wallet
func (s *KVCacheService) InvalidateSession(ctx context.Context, walletAddress string) error {
	keys, _ := s.redis.SMembers(ctx, fmt.Sprintf("kvcache:sessions:%s", walletAddress)).Result()
	if len(keys) > 0 {
		s.redis.Del(ctx, keys...)
		s.redis.Del(ctx, fmt.Sprintf("kvcache:sessions:%s", walletAddress))
		log.Printf("🗑️ KV-Cache invalidated for %s (%d entries)", walletAddress, len(keys))
	}
	return nil
}

// GetCacheStats returns cache utilization statistics
func (s *KVCacheService) GetCacheStats(ctx context.Context) (map[string]interface{}, error) {
	var totalKeys int64
	// Count all kvcache keys
	keys, _ := s.redis.Keys(ctx, "kvcache:*").Result()
	totalKeys = int64(len(keys))

	return map[string]interface{}{
		"total_cached_contexts": totalKeys,
		"cache_ttl_minutes":     30,
		"estimated_speedup":     "3-10x for follow-up messages",
	}, nil
}

// hashMessages creates a deterministic hash of message history
func hashMessages(messages []map[string]string) string {
	h := sha256.New()
	for _, msg := range messages {
		h.Write([]byte(msg["role"]))
		h.Write([]byte(msg["content"]))
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// countTokensEstimate rough token count (4 chars ≈ 1 token)
func countTokensEstimate(messages interface{}) int {
	data, _ := json.Marshal(messages)
	return len(data) / 4
}
