package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type TONService struct {
	apiURL string
	apiKey string
	client *http.Client
	// Rate limiter: 10 requests per second
	rateLimiter chan struct{}
}

func NewTONService(apiURL string, apiKey string) *TONService {
	// Create rate limiter: allow 10 requests per second
	// Use buffered channel as token bucket
	rateLimiter := make(chan struct{}, 10)
	
	// Pre-fill with tokens (all 10 available at start)
	for i := 0; i < 10; i++ {
		rateLimiter <- struct{}{}
	}
	
	// Refill tokens at rate of 10 per second (1 per 100ms)
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			select {
			case rateLimiter <- struct{}{}:
			default:
				// Channel full, skip
			}
		}
	}()

	return &TONService{
		apiURL:      apiURL,
		apiKey:      apiKey,
		rateLimiter: rateLimiter,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// GetJettonBalance получает баланс Jetton токена (GSTD) на адресе
func (s *TONService) GetJettonBalance(ctx context.Context, address string, jettonAddress string) (float64, error) {
	// Wait for rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return 0, ctx.Err()
	}

	// Используем TON API для получения баланса Jetton
	url := fmt.Sprintf("%s/v2/jettons/%s/balances?addresses=%s", s.apiURL, jettonAddress, address)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, err
	}

	// Add API key to header if provided
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
		// Alternative: some APIs use X-API-Key header
		req.Header.Set("X-API-Key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("TON API error: %s", string(body))
	}

	var result struct {
		Balances []struct {
			Balance string `json:"balance"`
		} `json:"balances"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	if len(result.Balances) == 0 {
		return 0, nil
	}

	// Конвертируем из nano (1e9) в обычные единицы
	var balance int64
	fmt.Sscanf(result.Balances[0].Balance, "%d", &balance)
	
	return float64(balance) / 1e9, nil
}

// CheckGSTDBalance проверяет наличие GSTD токена (минимум > 0)
// Порог снижен до 0.000001 GSTD, чтобы избежать ложных отрицаний при дробных остатках.
func (s *TONService) CheckGSTDBalance(ctx context.Context, address string, jettonAddress string) (bool, error) {
	balance, err := s.GetJettonBalance(ctx, address, jettonAddress)
	if err != nil {
		return false, err
	}
	
	return balance >= 0.000001, nil
}

// GetPublicKey resolves wallet address to public key via TON API
func (s *TONService) GetPublicKey(ctx context.Context, address string) ([]byte, error) {
	// Wait for rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	// Use TON API to get account info and extract public key
	url := fmt.Sprintf("%s/v2/accounts/%s", s.apiURL, address)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	// Add API key to header if provided
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
		req.Header.Set("X-API-Key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("TON API error: %s", string(body))
	}

	var result struct {
		Interfaces []string `json:"interfaces"`
		PublicKey  string   `json:"public_key"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// If public_key is directly available
	if result.PublicKey != "" {
		// Decode hex public key (32 bytes for Ed25519)
		pubKey := make([]byte, 32)
		_, err := fmt.Sscanf(result.PublicKey, "%x", &pubKey)
		if err == nil && len(pubKey) == 32 {
			return pubKey, nil
		}
	}

	// Fallback: Try to get from wallet state
	// For TON wallets, we may need to query the wallet contract state
	// This is a simplified version - full implementation may require parsing contract state
	return nil, fmt.Errorf("public key not found for address %s", address)
}


