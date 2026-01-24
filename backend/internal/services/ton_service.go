package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type TONService struct {
	apiURL      string
	apiKey      string
	client      *http.Client
	cacheService *CacheService // Redis cache for public keys
	// Rate limiter: 10 requests per second
	rateLimiter chan struct{}
}

func NewTONService(apiURL string, apiKey string) *TONService {
	// Create rate limiter: allow 100 requests per second (increased from 10 for new API key)
	// Use buffered channel as token bucket
	rateLimiter := make(chan struct{}, 100)
	
	// Pre-fill with tokens (all 100 available at start)
	for i := 0; i < 100; i++ {
		rateLimiter <- struct{}{}
	}
	
	// Refill tokens at rate of 100 per second (1 per 10ms)
	go func() {
		ticker := time.NewTicker(10 * time.Millisecond)
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

// SetCacheService sets the cache service for public key caching
func (s *TONService) SetCacheService(cacheService *CacheService) {
	s.cacheService = cacheService
}

// normalizeTONAddress converts raw format (0:...) to user-friendly format if needed
// TON API expects user-friendly format (EQ...), not raw format (0:...)
func normalizeTONAddress(address string) string {
	return NormalizeAddressForAPI(address)
}

// GetJettonBalance получает баланс Jetton токена (GSTD) на адресе
func (s *TONService) GetJettonBalance(ctx context.Context, address string, jettonAddress string) (float64, error) {
	// Normalize address format for TON API
	normalizedAddress := normalizeTONAddress(address)
	
	// Cache key
	cacheKey := fmt.Sprintf("ton:balance:%s:%s", normalizedAddress, jettonAddress)
	
	// Try cache first (1 minute TTL)
	if s.cacheService != nil {
		var cachedBalance float64
		if err := s.cacheService.Get(ctx, cacheKey, &cachedBalance); err == nil {
			return cachedBalance, nil
		}
	}
	
	// Используем TON API v2 для получения баланса конкретного Jetton
	// Direct endpoint for a single jetton balance
	url := fmt.Sprintf("%s/v2/accounts/%s/jettons/%s", s.apiURL, normalizedAddress, jettonAddress)
	
	log.Printf("GetJettonBalance: Fetching specific balance for address=%s, jetton=%s", normalizedAddress, jettonAddress)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, err
	}

	// Add API key to header if provided
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
		req.Header.Set("X-API-Key", s.apiKey)
	}

	var resp *http.Response
	maxRetries := 3
	backoff := 500 * time.Millisecond

	for i := 0; i <= maxRetries; i++ {
		select {
		case <-s.rateLimiter:
		case <-ctx.Done():
			return 0, ctx.Err()
		}

		resp, err = s.client.Do(req)
		if err == nil {
			if resp.StatusCode == http.StatusOK {
				break
			}
			if resp.StatusCode < 500 && resp.StatusCode != 429 {
				break
			}
		}

		if i < maxRetries {
			if resp != nil {
				resp.Body.Close()
			}
			time.Sleep(backoff)
			backoff *= 2
		}
	}

	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			// Account has no such jetton wallet, balance is 0
			return 0, nil
		}
		body, _ := io.ReadAll(resp.Body)
		log.Printf("GetJettonBalance: API error (%d): %s", resp.StatusCode, string(body))
		return 0, nil 
	}

	var result struct {
		Balance json.Number `json:"balance"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	balanceNano, err := result.Balance.Int64()
	if err != nil {
		if balanceFloat, floatErr := result.Balance.Float64(); floatErr == nil {
			balanceNano = int64(balanceFloat)
		} else {
			return 0, nil
		}
	}

	balance := float64(balanceNano) / 1e9

	// Cache the result
	if s.cacheService != nil {
		s.cacheService.Set(ctx, cacheKey, balance, 60*time.Second)
	}

	return balance, nil
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
// Uses Redis cache (24h TTL) to reduce API calls
func (s *TONService) GetPublicKey(ctx context.Context, address string) ([]byte, error) {
	// Normalize address for TON API (convert raw to user-friendly if needed)
	normalizedAddress := NormalizeAddressForAPI(address)
	
	// Cache key for public key
	cacheKey := fmt.Sprintf("ton:pubkey:%s", normalizedAddress)
	
	// Try to get from cache first (24 hour TTL)
	if s.cacheService != nil {
		var cachedPubKey []byte
		if err := s.cacheService.Get(ctx, cacheKey, &cachedPubKey); err == nil {
			if len(cachedPubKey) == 32 {
				return cachedPubKey, nil
			}
		}
	}
	
	// Wait for rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	
	// Use TON API to get account info and extract public key
	url := fmt.Sprintf("%s/v2/accounts/%s", s.apiURL, normalizedAddress)
	
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
			// Cache the public key for 24 hours
			if s.cacheService != nil {
				if err := s.cacheService.Set(ctx, cacheKey, pubKey, 24*time.Hour); err != nil {
					// Log but don't fail if caching fails
					log.Printf("Warning: Failed to cache public key for %s: %v", normalizedAddress, err)
				}
			}
			return pubKey, nil
		}
	}

	// Fallback: Try to get from wallet state
	// For TON wallets, we may need to query the wallet contract state
	// This is a simplified version - full implementation may require parsing contract state
	return nil, fmt.Errorf("public key not found for address %s", address)
}

// GetJettonWalletAddress gets the jetton wallet address for a given owner and jetton master
func (s *TONService) GetJettonWalletAddress(ctx context.Context, ownerAddr, jettonMasterAddr string) (string, error) {
	// Wait for rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Normalize addresses
	normalizedOwner := NormalizeAddressForAPI(ownerAddr)
	normalizedJetton := NormalizeAddressForAPI(jettonMasterAddr)

	// TON API endpoint: GET /v2/accounts/{owner_address}/jettons/{jetton_address}
	url := fmt.Sprintf("%s/v2/accounts/%s/jettons/%s", s.apiURL, normalizedOwner, normalizedJetton)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
		req.Header.Set("X-API-Key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		// If endpoint doesn't exist, return error (don't fallback)
		return "", fmt.Errorf("failed to get jetton wallet (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		WalletAddress struct {
			Address string `json:"address"`
		} `json:"wallet_address"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.WalletAddress.Address, nil
}

// GetContractBalance gets the TON balance of a contract address
func (s *TONService) GetContractBalance(ctx context.Context, contractAddress string) (int64, error) {
	// Wait for rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return 0, ctx.Err()
	}

	// Normalize address format for TON API
	normalizedAddress := NormalizeAddressForAPI(contractAddress)
	
	// Use TON API v2 to get account balance
	url := fmt.Sprintf("%s/v2/accounts/%s", s.apiURL, normalizedAddress)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, err
	}

	// Add API key to header if provided
	if s.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiKey)
		req.Header.Set("X-API-Key", s.apiKey)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("TON API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Balance json.Number `json:"balance"`
		State   string      `json:"state"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	// Parse balance (in nanotons) - json.Number handles both number and string formats
	balanceNano, err := result.Balance.Int64()
	if err != nil {
		// If Int64 fails, try parsing as float64 first (some APIs return decimals)
		if balanceFloat, floatErr := result.Balance.Float64(); floatErr == nil {
			balanceNano = int64(balanceFloat)
		} else {
			return 0, fmt.Errorf("failed to parse balance: %w", err)
		}
	}

	return balanceNano, nil
}

// GetContractTransactions gets transactions for a contract address
func (s *TONService) GetContractTransactions(ctx context.Context, contractAddress string, limit int) ([]Transaction, error) {
	// Wait for rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	// Normalize address format for TON API
	normalizedAddress := NormalizeAddressForAPI(contractAddress)
	
	// Use TON API v2 to get transactions
	url := fmt.Sprintf("%s/v2/accounts/%s/transactions?limit=%d", s.apiURL, normalizedAddress, limit)
	
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
		return nil, fmt.Errorf("TON API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Transactions []Transaction `json:"transactions"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Transactions, nil
}

// Transaction represents a TON blockchain transaction
type Transaction struct {
	Hash      string `json:"hash"`
	LT        string `json:"lt"`
	QueryID   int64  `json:"query_id,string"`
	Timestamp int64  `json:"utime"`
	InMsg     struct {
		Message string `json:"msg_data"`
		Comment string `json:"comment"`
	} `json:"in_msg"`
	OutMsgs []struct {
		Destination string `json:"destination"`
		Value       string `json:"value"`
		Comment     string `json:"comment"`
	} `json:"out_msgs"`
	Success bool `json:"success"`
}


