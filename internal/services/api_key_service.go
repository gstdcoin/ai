package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

type APIKeyService struct {
	db *sql.DB
}

func NewAPIKeyService(db *sql.DB) *APIKeyService {
	return &APIKeyService{db: db}
}

func (s *APIKeyService) GenerateKey(ctx context.Context, walletAddress string, label string) (string, error) {
	// Generate a secure random key
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	key := "gstd_" + hex.EncodeToString(bytes)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO user_api_keys (user_wallet, api_key, label)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_wallet, label) DO UPDATE SET api_key = $2, created_at = NOW()
	`, walletAddress, key, label)

	if err != nil {
		// If the UNIQUE constraint on (user_wallet, label) doesn't exist yet, we might get an error.
		// Let's just do a simple insert for now, if it fails we can adjust.
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO user_api_keys (user_wallet, api_key, label)
			VALUES ($1, $2, $3)
		`, walletAddress, key, label)
		if err != nil {
			return "", err
		}
	}

	return key, nil
}

func (s *APIKeyService) GetKeys(ctx context.Context, walletAddress string) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT api_key, label, usage_count, last_used_at, created_at
		FROM user_api_keys
		WHERE user_wallet = $1
		ORDER BY created_at DESC
	`, walletAddress)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []map[string]interface{}
	for rows.Next() {
		var key, label string
		var count int
		var createdAt time.Time
		var lastUsedNull sql.NullTime

		if err := rows.Scan(&key, &label, &count, &lastUsedNull, &createdAt); err != nil {
			return nil, err
		}

		keyData := map[string]interface{}{
			"api_key":     key,
			"label":       label,
			"usage_count": count,
			"created_at":  createdAt,
		}
		if lastUsedNull.Valid {
			keyData["last_used_at"] = lastUsedNull.Time
		} else {
			keyData["last_used_at"] = nil
		}
		keys = append(keys, keyData)
	}
	return keys, nil
}

func (s *APIKeyService) ValidateKey(ctx context.Context, apiKey string) (string, error) {
	var walletAddress string
	err := s.db.QueryRowContext(ctx, `
		UPDATE user_api_keys
		SET usage_count = usage_count + 1, last_used_at = NOW()
		WHERE api_key = $1
		RETURNING user_wallet
	`, apiKey).Scan(&walletAddress)

	if err != nil {
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("invalid API key")
		}
		return "", err
	}

	return walletAddress, nil
}
