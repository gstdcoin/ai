package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const sovereignIssuedPrefix = "sovereign:issued:"

// RegisterSovereignAPIKey stores a PoW-issued sk_sovereign_* key so ValidateSession can verify it.
func RegisterSovereignAPIKey(ctx context.Context, rdb *redis.Client, apiKey, wallet string) error {
	if rdb == nil || apiKey == "" || wallet == "" {
		return nil
	}
	sum := sha256.Sum256([]byte(apiKey))
	key := sovereignIssuedPrefix + hex.EncodeToString(sum[:])
	return rdb.Set(ctx, key, strings.TrimSpace(wallet), 720*time.Hour).Err()
}

func walletFromRegisteredSovereignKey(ctx context.Context, rdb *redis.Client, apiKey string) (string, bool) {
	if rdb == nil || apiKey == "" || !strings.HasPrefix(apiKey, "sk_sovereign_") {
		return "", false
	}
	sum := sha256.Sum256([]byte(apiKey))
	key := sovereignIssuedPrefix + hex.EncodeToString(sum[:])
	w, err := rdb.Get(ctx, key).Result()
	if err != nil || strings.TrimSpace(w) == "" {
		return "", false
	}
	return strings.TrimSpace(w), true
}
