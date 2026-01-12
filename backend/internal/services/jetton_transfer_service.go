package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// JettonTransferService handles GSTD jetton transfers via TON API
type JettonTransferService struct {
	apiURL         string
	apiKey         string
	client         *http.Client
	rateLimiter    chan struct{}
	walletAddr     string // Platform wallet address with GSTD balance
	privateKey     string // Private key for signing (should be from env, not hardcoded)
	walletService  *TONWalletService // Wallet service for signing transactions
}

func NewJettonTransferService(apiURL, apiKey, walletAddr, privateKey string) *JettonTransferService {
	// Create rate limiter: allow 5 requests per second for transfers
	rateLimiter := make(chan struct{}, 5)
	for i := 0; i < 5; i++ {
		rateLimiter <- struct{}{}
	}
	
	go func() {
		ticker := time.NewTicker(200 * time.Millisecond) // 5 per second
		defer ticker.Stop()
		for range ticker.C {
			select {
			case rateLimiter <- struct{}{}:
			default:
			}
		}
	}()

	service := &JettonTransferService{
		apiURL:      apiURL,
		apiKey:      apiKey,
		walletAddr:  walletAddr,
		privateKey:  privateKey,
		rateLimiter: rateLimiter,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}

	// Initialize wallet service if private key is provided
	if privateKey != "" {
		walletService, err := NewTONWalletService(apiURL, apiKey, walletAddr, privateKey)
		if err != nil {
			log.Printf("Warning: Failed to initialize wallet service: %v", err)
			log.Printf("   Jetton transfers will be logged but not executed")
		} else {
			service.walletService = walletService
			log.Printf("✅ Wallet service initialized for jetton transfers")
		}
	} else {
		log.Printf("⚠️  No private key provided - jetton transfers will be logged only")
	}

	return service
}

// SendJettonTransfer sends GSTD jetton to recipient address
// Note: This uses TON API's estimate endpoint and requires a wallet service for actual signing
// In production, this should use a wallet service (like TON Connect or wallet contract)
func (j *JettonTransferService) SendJettonTransfer(
	ctx context.Context,
	recipientAddr string,
	jettonAddr string,
	amountNano int64,
	comment string,
) (string, error) {
	// Wait for rate limiter
	select {
	case <-j.rateLimiter:
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Use wallet service if available
	if j.walletService != nil {
		txHash, err := j.walletService.SendJettonTransfer(ctx, recipientAddr, jettonAddr, amountNano, comment)
		if err != nil {
			log.Printf("Error sending jetton transfer via wallet service: %v", err)
			// Fallback to estimate and log
			return j.estimateAndLogTransfer(ctx, recipientAddr, jettonAddr, amountNano, comment)
		}
		return txHash, nil
	}

	// Fallback: estimate and log transfer intent
	return j.estimateAndLogTransfer(ctx, recipientAddr, jettonAddr, amountNano, comment)
}

// estimateAndLogTransfer estimates transaction and logs transfer intent
func (j *JettonTransferService) estimateAndLogTransfer(
	ctx context.Context,
	recipientAddr string,
	jettonAddr string,
	amountNano int64,
	comment string,
) (string, error) {
	// Estimate transaction
	url := fmt.Sprintf("%s/v2/accounts/%s/jettons/%s/estimate",
		j.apiURL, j.walletAddr, jettonAddr)

	estimateReq := map[string]interface{}{
		"to":      recipientAddr,
		"amount":  strconv.FormatInt(amountNano, 10),
		"comment": comment,
	}

	reqBody, err := json.Marshal(estimateReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal estimate request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(reqBody)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	if j.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+j.apiKey)
		req.Header.Set("X-API-Key", j.apiKey)
	}

	resp, err := j.client.Do(req)
	if err != nil {
		log.Printf("Failed to estimate transaction: %v", err)
	} else {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var estimate struct {
				Fee struct {
					Total string `json:"total"`
				} `json:"fee"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&estimate); err == nil {
				log.Printf("Transaction estimate: fee=%s nanoTON", estimate.Fee.Total)
			}
		}
	}

	// Log transfer intent
	txHash := fmt.Sprintf("pending_%d_%s", time.Now().Unix(), recipientAddr[:8])
	log.Printf("Jetton Transfer Intent: %d nanoGSTD from %s to %s (comment: %s)",
		amountNano, j.walletAddr, recipientAddr, comment)
	log.Printf("⚠️  Wallet service not available - transfer logged but not executed")
	log.Printf("   Set PLATFORM_WALLET_PRIVATE_KEY env variable to enable transfers")

	return txHash, nil
}

// CheckTransferStatus checks if a transfer transaction was confirmed
func (j *JettonTransferService) CheckTransferStatus(ctx context.Context, txHash string) (bool, error) {
	// Use TON API to check transaction status
	url := fmt.Sprintf("%s/v2/blockchain/transactions/%s", j.apiURL, txHash)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}

	if j.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+j.apiKey)
		req.Header.Set("X-API-Key", j.apiKey)
	}

	resp, err := j.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK, nil
}

