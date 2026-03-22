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

const headerAPIKey = "X-API-Key"

type TONService struct {
	apiURL       string
	apiKey       string
	client       *http.Client
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

// JettonMinterInfo describes basic on-chain information about a jetton master
// contract (minter): total supply and metadata. This is read directly from
// TON API and is used as the source of truth for GSTD.
type JettonMinterInfo struct {
	Address     string                 `json:"address"`
	TotalSupply float64                `json:"total_supply"` // human-readable (9 decimals)
	Symbol      string                 `json:"symbol"`
	Name        string                 `json:"name"`
	Image       string                 `json:"image"`
	Decimals    int                    `json:"decimals"`
	Raw         map[string]interface{} `json:"raw"` // full payload for debugging
}

// normalizeTONAddress converts raw format (0:...) to user-friendly format if needed
// TON API expects user-friendly format (EQ...), not raw format (0:...)
func normalizeTONAddress(address string) string {
	return NormalizeAddressForAPI(address)
}

// doRequestWithRetry performs an HTTP request with exponential backoff retries.
// It retries on server errors (5xx) and rate limits (429), up to maxRetries times.
func (s *TONService) doRequestWithRetry(ctx context.Context, req *http.Request, maxRetries int) (*http.Response, error) {
	var resp *http.Response
	var err error
	backoff := 500 * time.Millisecond

	for i := 0; i <= maxRetries; i++ {
		select {
		case <-s.rateLimiter:
		case <-ctx.Done():
			return nil, ctx.Err()
		}

		resp, err = s.client.Do(req)
		if err == nil && resp.StatusCode < 500 && resp.StatusCode != 429 {
			return resp, nil
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
		return nil, err
	}
	return resp, nil
}

// setAPIKeyHeader adds the API key header to the request if configured.
func (s *TONService) setAPIKeyHeader(req *http.Request) {
	if s.apiKey != "" {
		req.Header.Set(headerAPIKey, s.apiKey)
	}
}

// GetJettonBalance получает баланс Jetton токена (GSTD) на адресе
func (s *TONService) GetJettonBalance(ctx context.Context, address string, jettonAddress string) (float64, error) {
	normalizedAddress := normalizeTONAddress(address)
	normalizedJetton := NormalizeAddressForAPI(jettonAddress)

	if normalizedAddress == "" || normalizedJetton == "" {
		return 0, nil
	}

	cacheKey := fmt.Sprintf("ton:balance:%s:%s", normalizedAddress, normalizedJetton)

	if s.cacheService != nil {
		var cachedBalance float64
		if err := s.cacheService.Get(ctx, cacheKey, &cachedBalance); err == nil {
			return cachedBalance, nil
		}
	}

	url := fmt.Sprintf("%s/v2/accounts/%s/jettons/%s", s.apiURL, normalizedAddress, normalizedJetton)
	log.Printf("GetJettonBalance: Fetching specific balance for address=%s, jetton=%s", normalizedAddress, normalizedJetton)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, err
	}
	s.setAPIKeyHeader(req)

	resp, err := s.doRequestWithRetry(ctx, req, 3)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return 0, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("GetJettonBalance: API error (%d): %s", resp.StatusCode, string(body))
		return 0, nil
	}

	balance, err := s.parseJettonBalance(resp)
	if err != nil {
		return 0, err
	}

	if s.cacheService != nil {
		s.cacheService.Set(ctx, cacheKey, balance, 60*time.Second)
	}

	return balance, nil
}

// parseJettonBalance reads and parses the jetton balance from an HTTP response.
func (s *TONService) parseJettonBalance(resp *http.Response) (float64, error) {
	var result struct {
		Balance json.Number `json:"balance"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}

	balanceNano, err := result.Balance.Int64()
	if err != nil {
		balanceFloat, floatErr := result.Balance.Float64()
		if floatErr != nil {
			return 0, nil
		}
		balanceNano = int64(balanceFloat)
	}

	return float64(balanceNano) / 1e9, nil
}

// GetJettonMinterInfo fetches total supply and metadata for a jetton master
// (e.g. GSTD) directly from the blockchain via TON API v2.
func (s *TONService) GetJettonMinterInfo(ctx context.Context, jettonMasterAddr string) (*JettonMinterInfo, error) {
	if jettonMasterAddr == "" {
		return nil, fmt.Errorf("jetton master address is empty")
	}

	normalized := NormalizeAddressForAPI(jettonMasterAddr)

	// Basic in-memory cache via CacheService (5 minutes)
	cacheKey := fmt.Sprintf("ton:jetton:minter:%s", normalized)
	if s.cacheService != nil {
		var cached JettonMinterInfo
		if err := s.cacheService.Get(ctx, cacheKey, &cached); err == nil && cached.Address != "" {
			return &cached, nil
		}
	}

	// TON API v2: GET /v2/jettons/{address}
	url := fmt.Sprintf("%s/v2/jettons/%s", s.apiURL, normalized)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	s.setAPIKeyHeader(req)

	// Respect rate limiter
	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("TON API jetton error (status %d): %s", resp.StatusCode, string(body))
	}

	// TonAPI jetton schema (simplified)
	var raw map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}

	meta, _ := raw["metadata"].(map[string]interface{})
	symbol, _ := meta["symbol"].(string)
	name, _ := meta["name"].(string)
	image, _ := meta["image"].(string)

	decimals := 9
	if d, ok := raw["decimals"].(float64); ok {
		decimals = int(d)
	}

	var totalSupplyFloat float64
	switch v := raw["total_supply"].(type) {
	case float64:
		totalSupplyFloat = v
	case string:
		if n, err := json.Number(v).Int64(); err == nil {
			totalSupplyFloat = float64(n)
		}
	}

	// Convert from nano units to human-readable using decimals
	for i := 0; i < decimals; i++ {
		totalSupplyFloat /= 10
	}

	info := &JettonMinterInfo{
		Address:     normalized,
		TotalSupply: totalSupplyFloat,
		Symbol:      symbol,
		Name:        name,
		Image:       image,
		Decimals:    decimals,
		Raw:         raw,
	}

	if s.cacheService != nil {
		_ = s.cacheService.Set(ctx, cacheKey, info, 5*time.Minute)
	}

	return info, nil
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
	normalizedAddress := NormalizeAddressForAPI(address)
	cacheKey := fmt.Sprintf("ton:pubkey:%s", normalizedAddress)

	if s.cacheService != nil {
		var cachedPubKey []byte
		if err := s.cacheService.Get(ctx, cacheKey, &cachedPubKey); err == nil && len(cachedPubKey) == 32 {
			return cachedPubKey, nil
		}
	}

	select {
	case <-s.rateLimiter:
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	url := fmt.Sprintf("%s/v2/accounts/%s", s.apiURL, normalizedAddress)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	s.setAPIKeyHeader(req)

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
		PublicKey string `json:"public_key"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if result.PublicKey == "" {
		return nil, fmt.Errorf("public key not found for address %s", address)
	}

	pubKey := make([]byte, 32)
	if _, err := fmt.Sscanf(result.PublicKey, "%x", &pubKey); err != nil || len(pubKey) != 32 {
		return nil, fmt.Errorf("public key not found for address %s", address)
	}

	if s.cacheService != nil {
		if cacheErr := s.cacheService.Set(ctx, cacheKey, pubKey, 24*time.Hour); cacheErr != nil {
			log.Printf("Warning: Failed to cache public key for %s: %v", normalizedAddress, cacheErr)
		}
	}

	return pubKey, nil
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
	s.setAPIKeyHeader(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			return "", fmt.Errorf("jetton wallet not found")
		}
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

	// Skip API call if address normalization failed (corrupted/uppercase address)
	if normalizedAddress == "" {
		return 0, fmt.Errorf("invalid address format: %s", contractAddress[:min(16, len(contractAddress))])
	}

	// Use TON API v2 to get account balance
	url := fmt.Sprintf("%s/v2/accounts/%s", s.apiURL, normalizedAddress)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return 0, err
	}

	// Add API key to header if provided
	if s.apiKey != "" {
		req.Header.Set(headerAPIKey, s.apiKey)
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
		req.Header.Set(headerAPIKey, s.apiKey)
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
