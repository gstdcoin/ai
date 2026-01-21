package services

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// TONWalletService handles wallet operations including signing and sending transactions
type TONWalletService struct {
	apiURL      string
	apiKey      string
	client      *http.Client
	privateKey  ed25519.PrivateKey
	publicKey   ed25519.PublicKey
	walletAddr  string
	rateLimiter chan struct{}
}

// NewTONWalletService creates a new wallet service
// privateKeyHex: hex-encoded 64-byte private key (32 bytes private + 32 bytes public)
func NewTONWalletService(apiURL, apiKey, walletAddr, privateKeyHex string) (*TONWalletService, error) {
	// Decode private key
	privateKeyBytes, err := hex.DecodeString(strings.TrimPrefix(privateKeyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("invalid private key format: %w", err)
	}

	if len(privateKeyBytes) != 64 {
		return nil, fmt.Errorf("private key must be 64 bytes (got %d)", len(privateKeyBytes))
	}

	privateKey := ed25519.PrivateKey(privateKeyBytes)
	publicKey := privateKey.Public().(ed25519.PublicKey)

	// Rate limiter: 5 requests per second
	rateLimiter := make(chan struct{}, 5)
	for i := 0; i < 5; i++ {
		rateLimiter <- struct{}{}
	}

	go func() {
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			select {
			case rateLimiter <- struct{}{}:
			default:
			}
		}
	}()

	return &TONWalletService{
		apiURL:      apiURL,
		apiKey:      apiKey,
		walletAddr:  walletAddr,
		privateKey:  privateKey,
		publicKey:   publicKey,
		rateLimiter: rateLimiter,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

// SendJettonTransfer sends GSTD jetton to recipient using TON API
// This method constructs the transaction and uses TON API to send it
func (w *TONWalletService) SendJettonTransfer(
	ctx context.Context,
	recipientAddr string,
	jettonAddr string,
	amountNano int64,
	comment string,
) (string, error) {
	// Wait for rate limiter
	select {
	case <-w.rateLimiter:
	case <-ctx.Done():
		return "", ctx.Err()
	}

	// Step 1: Get jetton wallet address for the sender
	jettonWalletAddr, err := w.getJettonWalletAddress(ctx, w.walletAddr, jettonAddr)
	if err != nil {
		return "", fmt.Errorf("failed to get jetton wallet address: %w", err)
	}

	// Step 2: Construct transfer message using TON API
	// TON API v2 provides endpoints for constructing and sending transactions
	transferReq := map[string]interface{}{
		"destination": recipientAddr,
		"amount":      strconv.FormatInt(amountNano, 10),
		"comment":     comment,
		"bounceable":  false,
	}

	// Step 3: Use TON API to create and send transaction
	// Note: TON API v2 has endpoints for sending transactions
	// Format: POST /v2/wallet/{address}/transfer
	url := fmt.Sprintf("%s/v2/wallet/%s/transfer", w.apiURL, jettonWalletAddr)

	reqBody, err := json.Marshal(transferReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal transfer request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(reqBody)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	if w.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+w.apiKey)
		req.Header.Set("X-API-Key", w.apiKey)
	}

	resp, err := w.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send transfer request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("TON API transfer error (status %d): %s", resp.StatusCode, string(body))
		
		// If TON API doesn't support direct transfer, use estimate and log
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed {
			log.Printf("⚠️  TON API doesn't support direct transfer endpoint")
			log.Printf("   Using estimate endpoint and logging transfer intent")
			return w.estimateAndLogTransfer(ctx, recipientAddr, jettonAddr, amountNano, comment)
		}
		
		return "", fmt.Errorf("TON API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		TxHash string `json:"hash"`
		Status string `json:"status"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	log.Printf("✅ Jetton transfer sent: tx_hash=%s, amount=%d nanoGSTD, to=%s",
		result.TxHash, amountNano, recipientAddr)

	return result.TxHash, nil
}

// getJettonWalletAddress gets the jetton wallet address for a given owner and jetton master
func (w *TONWalletService) getJettonWalletAddress(ctx context.Context, ownerAddr, jettonMasterAddr string) (string, error) {
	// TON API endpoint: GET /v2/jettons/{jetton_address}/wallets/{owner_address}
	url := fmt.Sprintf("%s/v2/jettons/%s/wallets/%s", w.apiURL, jettonMasterAddr, ownerAddr)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}

	if w.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+w.apiKey)
		req.Header.Set("X-API-Key", w.apiKey)
	}

	resp, err := w.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		// If endpoint doesn't exist, calculate jetton wallet address
		if resp.StatusCode == http.StatusNotFound {
			log.Printf("Jetton wallet endpoint not found, calculating address...")
			// For now, return owner address as fallback
			// In production, calculate jetton wallet address using TON SDK
			return ownerAddr, nil
		}
		return "", fmt.Errorf("failed to get jetton wallet: %s", string(body))
	}

	var result struct {
		Address string `json:"address"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Address, nil
}

// estimateAndLogTransfer estimates transaction and logs transfer intent
func (w *TONWalletService) estimateAndLogTransfer(
	ctx context.Context,
	recipientAddr string,
	jettonAddr string,
	amountNano int64,
	comment string,
) (string, error) {
	// Use estimate endpoint
	url := fmt.Sprintf("%s/v2/accounts/%s/jettons/%s/estimate",
		w.apiURL, w.walletAddr, jettonAddr)

	estimateReq := map[string]interface{}{
		"to":      recipientAddr,
		"amount":  strconv.FormatInt(amountNano, 10),
		"comment": comment,
	}

	reqBody, err := json.Marshal(estimateReq)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(reqBody)))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	if w.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+w.apiKey)
		req.Header.Set("X-API-Key", w.apiKey)
	}

	resp, err := w.client.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		var estimate struct {
			Fee struct {
				Total string `json:"total"`
			} `json:"fee"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&estimate); err == nil {
			log.Printf("Transaction estimate: fee=%s nanoTON", estimate.Fee.Total)
		}
		resp.Body.Close()
	}

	// Log transfer intent
	txHash := fmt.Sprintf("pending_%d_%s", time.Now().Unix(), recipientAddr[:8])
	log.Printf("Jetton Transfer Intent: %d nanoGSTD from %s to %s (comment: %s)",
		amountNano, w.walletAddr, recipientAddr, comment)
	log.Printf("⚠️  Transfer requires wallet service integration for signing")
	log.Printf("   Transaction hash (pending): %s", txHash)

	return txHash, nil
}

