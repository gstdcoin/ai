package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"distributed-computing-platform/internal/config"
)

// PoolMonitorService monitors GSTD/XAUt pool status
type PoolMonitorService struct {
	poolAddress     string
	apiURL          string
	apiKey          string
	httpClient      *http.Client
	tonService      *TONService // For getting jetton balances
	gstdJettonAddr  string
	xautJettonAddr  string
	errorLogger     *ErrorLogger // For logging errors to database
}

// PoolStatus represents the current state of the GSTD/XAUt pool
type PoolStatus struct {
	PoolAddress     string    `json:"pool_address"`
	GSTDBalance     float64   `json:"gstd_balance"`
	XAUtBalance     float64   `json:"xaut_balance"`
	TotalValueUSD   float64   `json:"total_value_usd"`
	LastUpdated     time.Time `json:"last_updated"`
	IsHealthy       bool      `json:"is_healthy"`
	ReserveRatio    float64   `json:"reserve_ratio"` // GSTD/XAUt ratio
}

// NewPoolMonitorService creates a new pool monitor service
func NewPoolMonitorService(tonConfig config.TONConfig) *PoolMonitorService {
	poolAddress := tonConfig.PoolAddress
	if poolAddress == "" {
		poolAddress = "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp" // Default pool address
	}

	return &PoolMonitorService{
		poolAddress:    poolAddress,
		apiURL:         tonConfig.APIURL,
		apiKey:         tonConfig.APIKey,
		gstdJettonAddr: tonConfig.GSTDJettonAddress,
		xautJettonAddr: tonConfig.XAUtJettonAddress,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SetTONService sets the TON service for getting jetton balances
func (pms *PoolMonitorService) SetTONService(tonService *TONService) {
	pms.tonService = tonService
}

// SetErrorLogger sets the error logger for logging errors to database
func (pms *PoolMonitorService) SetErrorLogger(errorLogger *ErrorLogger) {
	pms.errorLogger = errorLogger
}

// GetPoolStatus retrieves current pool status from TON API
func (pms *PoolMonitorService) GetPoolStatus(ctx context.Context) (*PoolStatus, error) {
	log.Printf("📊 Fetching pool status for: %s", pms.poolAddress)

	// Get pool contract state from TON API
	url := fmt.Sprintf("%s/v2/accounts/%s", pms.apiURL, pms.poolAddress)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if pms.apiKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", pms.apiKey))
	}

	resp, err := pms.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch pool status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var accountData struct {
		Balance json.Number `json:"balance"` // Use json.Number to handle both string and number formats
		State   string      `json:"state"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&accountData); err != nil {
		// Log JSON decode error to database if errorLogger is available
		if pms.errorLogger != nil {
			pms.errorLogger.LogError(ctx, "JSON_DECODE_ERROR", err, SeverityError, map[string]interface{}{
				"pool_address": pms.poolAddress,
				"api_url":      pms.apiURL,
				"service":      "pool_monitor",
			})
		}
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Parse balance (in nanotons) - json.Number handles both number and string formats
	var balanceNano int64
	if balanceStr := accountData.Balance.String(); balanceStr != "" {
		balanceNanoInt, err := accountData.Balance.Int64()
		if err != nil {
			// If Int64 fails, try parsing as float64 first (some APIs return decimals)
			if balanceFloat, floatErr := accountData.Balance.Float64(); floatErr == nil {
				balanceNano = int64(balanceFloat)
			} else {
				// Log balance parsing error to database if errorLogger is available
				if pms.errorLogger != nil {
					pms.errorLogger.LogError(ctx, "pool_monitor_balance_parse", err, SeverityError, map[string]interface{}{
						"pool_address": pms.poolAddress,
						"balance_str":  accountData.Balance.String(),
					})
				}
				return nil, fmt.Errorf("failed to parse balance: %w", err)
			}
		} else {
			balanceNano = balanceNanoInt
		}
	}
	balanceTON := float64(balanceNano) / 1e9

	// For DEX pools, we need to query jetton balances
	// This is a simplified version - actual implementation would query jetton wallets
	// For now, we'll return a basic status structure
	
	status := &PoolStatus{
		PoolAddress:  pms.poolAddress,
		GSTDBalance:  0, // Will be populated by actual jetton balance query
		XAUtBalance:  0, // Will be populated by actual jetton balance query
		TotalValueUSD: 0, // Will be calculated from balances
		LastUpdated:   time.Now(),
		IsHealthy:     balanceNano > 0, // Pool is healthy if it has balance
		ReserveRatio:  0, // Will be calculated from balances
	}

	// Get real jetton balances from pool contract's jetton wallets
	// Errors are handled gracefully - if balance cannot be retrieved, use 0 instead of failing
	if pms.tonService != nil && pms.gstdJettonAddr != "" && pms.xautJettonAddr != "" {
		// Get GSTD jetton wallet address for the pool
		gstdWalletAddr, err := pms.tonService.GetJettonWalletAddress(ctx, pms.poolAddress, pms.gstdJettonAddr)
		if err == nil {
			// Get GSTD balance - handle errors gracefully (return 0 if not found)
			gstdBalance, err := pms.tonService.GetJettonBalance(ctx, gstdWalletAddr, pms.gstdJettonAddr)
			if err == nil {
				status.GSTDBalance = gstdBalance
				log.Printf("📊 GSTD balance: %.9f", gstdBalance)
			} else {
				// Log error but continue with 0 balance (non-critical)
				log.Printf("⚠️  Failed to get GSTD balance (using 0): %v", err)
				// Log to database if errorLogger is available
				if pms.errorLogger != nil {
					pms.errorLogger.LogInternalError(ctx, "EXTERNAL_API_ERROR", err, SeverityWarning)
				}
				status.GSTDBalance = 0
			}
		} else {
			// Log error but continue with 0 balance (non-critical)
			log.Printf("⚠️  Failed to get GSTD jetton wallet address (using 0): %v", err)
			status.GSTDBalance = 0
		}

		// Get XAUt jetton wallet address for the pool
		xautWalletAddr, err := pms.tonService.GetJettonWalletAddress(ctx, pms.poolAddress, pms.xautJettonAddr)
		if err == nil {
			// Get XAUt balance - handle errors gracefully (return 0 if not found)
			xautBalance, err := pms.tonService.GetJettonBalance(ctx, xautWalletAddr, pms.xautJettonAddr)
			if err == nil {
				status.XAUtBalance = xautBalance
				log.Printf("📊 XAUt balance: %.9f", xautBalance)
			} else {
				// Log error but continue with 0 balance (non-critical)
				log.Printf("⚠️  Failed to get XAUt balance (using 0): %v", err)
				// Log to database if errorLogger is available
				if pms.errorLogger != nil {
					pms.errorLogger.LogInternalError(ctx, "EXTERNAL_API_ERROR", err, SeverityWarning)
				}
				status.XAUtBalance = 0
			}
		} else {
			// Log error but continue with 0 balance (non-critical)
			log.Printf("⚠️  Failed to get XAUt jetton wallet address (using 0): %v", err)
			status.XAUtBalance = 0
		}

		// Calculate reserve ratio and total value
		if status.GSTDBalance > 0 && status.XAUtBalance > 0 {
			status.ReserveRatio = status.GSTDBalance / status.XAUtBalance
			// Estimate USD value (XAUt ≈ $2000 per token, simplified)
			status.TotalValueUSD = status.XAUtBalance * 2000.0
		}
	} else {
		log.Printf("⚠️  TON service or jetton addresses not configured for pool monitoring")
	}
	
	log.Printf("✅ Pool status retrieved: balance=%.2f TON, GSTD=%.9f, XAUt=%.9f, healthy=%v", 
		balanceTON, status.GSTDBalance, status.XAUtBalance, status.IsHealthy)

	return status, nil
}

// GetPoolStatusCached returns cached pool status (if available) or fetches new
func (pms *PoolMonitorService) GetPoolStatusCached(ctx context.Context) (*PoolStatus, error) {
	// In production, this would use Redis cache with TTL
	// For now, always fetch fresh data
	return pms.GetPoolStatus(ctx)
}

// IsPoolHealthy checks if the pool has sufficient reserves
func (pms *PoolMonitorService) IsPoolHealthy(ctx context.Context) (bool, error) {
	status, err := pms.GetPoolStatus(ctx)
	if err != nil {
		return false, err
	}
	return status.IsHealthy && status.GSTDBalance > 0 && status.XAUtBalance > 0, nil
}

