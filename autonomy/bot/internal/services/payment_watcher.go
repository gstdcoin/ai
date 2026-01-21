package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"distributed-computing-platform/internal/config"
)

type PaymentWatcher struct {
	db                 *sql.DB
	tonService         *TONService
	tonConfig          config.TONConfig
	taskPaymentService *TaskPaymentService
	platformWallet     string
	jettonAddress      string
	lastCheckedBlock   *int64
	stopChan           chan struct{}
}

type JettonTransfer struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Amount    string `json:"amount"`
	Comment   string `json:"comment"`
	TxHash    string `json:"tx_hash"`
	Timestamp int64  `json:"timestamp"`
}

type TonAPIJettonTransfer struct {
	From struct {
		Address string `json:"address"`
	} `json:"from"`
	To struct {
		Address string `json:"address"`
	} `json:"to"`
	Amount string `json:"amount"`
	Comment string `json:"comment"`
	Transaction struct {
		Hash string `json:"hash"`
		LT   string `json:"lt"`
	} `json:"transaction"`
	Timestamp int64 `json:"timestamp"`
}

func NewPaymentWatcher(
	db *sql.DB,
	tonService *TONService,
	tonConfig config.TONConfig,
	taskPaymentService *TaskPaymentService,
) *PaymentWatcher {
	return &PaymentWatcher{
		db:                db,
		tonService:        tonService,
		tonConfig:         tonConfig,
		taskPaymentService: taskPaymentService,
		platformWallet:    tonConfig.AdminWallet,
		jettonAddress:     tonConfig.GSTDJettonAddress,
		stopChan:          make(chan struct{}),
	}
}

// Start begins monitoring for payments
func (pw *PaymentWatcher) Start(ctx context.Context, interval time.Duration) {
	if pw.platformWallet == "" {
		log.Printf("PaymentWatcher: AdminWallet not configured, skipping payment monitoring")
		return
	}
	log.Printf("PaymentWatcher: Starting payment monitoring for wallet %s", pw.platformWallet)
	
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Initial check
	pw.checkPayments(ctx)

	for {
		select {
		case <-ticker.C:
			pw.checkPayments(ctx)
		case <-pw.stopChan:
			log.Println("PaymentWatcher: Stopping payment monitoring")
			return
		case <-ctx.Done():
			log.Println("PaymentWatcher: Context cancelled, stopping")
			return
		}
	}
}

// Stop stops the payment watcher
func (pw *PaymentWatcher) Stop() {
	close(pw.stopChan)
}

// checkPayments checks for incoming GSTD transfers to the platform wallet
func (pw *PaymentWatcher) checkPayments(ctx context.Context) {
	// Wait for rate limiter
	select {
	case <-pw.tonService.rateLimiter:
	case <-ctx.Done():
		return
	}

	// Get recent jetton transfers to platform wallet
	transfers, err := pw.getRecentJettonTransfers(ctx)
	if err != nil {
		// Log DNS/network errors but don't spam - only log every 5th error
		if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "i/o timeout") || strings.Contains(err.Error(), "no such host") {
			log.Printf("PaymentWatcher: DNS/Network error (will retry): %v", err)
		} else if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "not found") {
			// 404 errors are not critical - API endpoint might not exist yet or jetton address is invalid
			// Log only occasionally to avoid spam
			log.Printf("PaymentWatcher: TON API endpoint not found (404) - may be temporary: %v", err)
		} else {
			log.Printf("PaymentWatcher: Error fetching transfers: %v", err)
		}
		// Don't crash on errors - just return and retry on next interval
		return
	}

	log.Printf("PaymentWatcher: Found %d recent transfers", len(transfers))

	// Process each transfer
	for _, transfer := range transfers {
		if err := pw.processTransfer(ctx, transfer); err != nil {
			log.Printf("PaymentWatcher: Error processing transfer %s: %v", transfer.TxHash, err)
		}
	}
}

// getRecentJettonTransfers fetches recent jetton transfers to the platform wallet
func (pw *PaymentWatcher) getRecentJettonTransfers(ctx context.Context) ([]JettonTransfer, error) {
	// Use TonAPI v2 to get jetton transfers
	// Format: GET /v2/accounts/{account_id}/jettons/{jetton_id}/history
	// First, normalize the platform wallet address for TON API
	normalizedWallet := NormalizeAddressForAPI(pw.platformWallet)
	normalizedJetton := NormalizeAddressForAPI(pw.jettonAddress)
	
	// TON API v2 endpoint for jetton transfer history
	url := fmt.Sprintf("%s/v2/accounts/%s/jettons/%s/history?limit=100", 
		pw.tonService.apiURL, normalizedWallet, normalizedJetton)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	// Use only X-API-Key header (TonAPI v2 format)
	if pw.tonService.apiKey != "" {
		req.Header.Set("X-API-Key", pw.tonService.apiKey)
		// Remove Bearer Authorization to avoid base32 errors
	}

	resp, err := pw.tonService.client.Do(req)
	if err != nil {
		// Check for DNS/network errors
		if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "no such host") {
			return nil, fmt.Errorf("DNS/network error: %w", err)
		}
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		// Don't treat 404 as critical - might be temporary API issue
		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("TON API endpoint not found (404) - may be temporary: %s", string(body))
		}
		return nil, fmt.Errorf("TON API error (%d): %s", resp.StatusCode, string(body))
	}

	// TON API v2 returns different structure - try both formats
	var result struct {
		Events []TonAPIJettonTransfer `json:"events"`
		// Alternative structure for v2
		History []struct {
			From struct {
				Address string `json:"address"`
			} `json:"from"`
			To struct {
				Address string `json:"address"`
			} `json:"to"`
			Amount string `json:"amount"`
			Comment string `json:"comment"`
			Transaction struct {
				Hash string `json:"hash"`
				LT   string `json:"lt"`
			} `json:"transaction"`
			Timestamp int64 `json:"timestamp"`
		} `json:"history"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Filter for incoming transfers (to platform wallet) and convert
	var transfers []JettonTransfer
	
	// Process v2 history format (preferred)
	if len(result.History) > 0 {
		for _, event := range result.History {
			// Only process transfers TO the platform wallet
			if strings.EqualFold(event.To.Address, normalizedWallet) {
				// Parse amount (in nanotons) and convert to GSTD
				amountNano, err := strconv.ParseInt(event.Amount, 10, 64)
				if err != nil {
					log.Printf("PaymentWatcher: Failed to parse amount: %v", err)
					continue
				}
				amountGSTD := float64(amountNano) / 1e9
				
				transfers = append(transfers, JettonTransfer{
					From:      event.From.Address,
					To:        event.To.Address,
					Amount:    fmt.Sprintf("%.9f", amountGSTD),
					Comment:   event.Comment,
					TxHash:    event.Transaction.Hash,
					Timestamp: event.Timestamp,
				})
			}
		}
		return transfers, nil
	}
	
	// Fallback: Process old events format if history is empty
	if len(transfers) == 0 && len(result.Events) > 0 {
		for _, event := range result.Events {
			// Only process transfers TO the platform wallet
			if strings.EqualFold(event.To.Address, pw.platformWallet) {
				// Convert amount from nanotons to GSTD (assuming 9 decimals)
				amountNano, err := strconv.ParseInt(event.Amount, 10, 64)
				if err != nil {
					continue
				}
				amountGSTD := float64(amountNano) / 1e9

				transfers = append(transfers, JettonTransfer{
					From:      event.From.Address,
					To:        event.To.Address,
					Amount:    fmt.Sprintf("%.9f", amountGSTD),
					Comment:   event.Comment,
					TxHash:    event.Transaction.Hash,
					Timestamp: event.Timestamp,
				})
			}
		}
	}

	return transfers, nil
}

// processTransfer processes a single transfer and matches it to a task
func (pw *PaymentWatcher) processTransfer(ctx context.Context, transfer JettonTransfer) error {
	// Extract payment memo from comment
	paymentMemo := strings.TrimSpace(transfer.Comment)
	if paymentMemo == "" {
		// No memo, skip
		return nil
	}

	// Get task by payment memo
	task, err := pw.taskPaymentService.GetTaskByPaymentMemo(ctx, paymentMemo)
	if err != nil {
		// Task not found or already processed
		return nil
	}

	// Check if task is still pending payment
	if task.Status != "pending_payment" {
		log.Printf("PaymentWatcher: Task %s already processed (status: %s)", task.TaskID, task.Status)
		return nil
	}

	// Verify amount matches (with small tolerance for rounding)
	expectedAmount := *task.BudgetGSTD
	receivedAmount, err := strconv.ParseFloat(transfer.Amount, 64)
	if err != nil {
		return fmt.Errorf("invalid amount format: %w", err)
	}

	// Allow 1% tolerance for rounding
	tolerance := expectedAmount * 0.01
	if receivedAmount < expectedAmount-tolerance || receivedAmount > expectedAmount+tolerance {
		log.Printf("PaymentWatcher: Amount mismatch for task %s: expected %.9f, got %.9f", 
			task.TaskID, expectedAmount, receivedAmount)
		return nil
	}

	// SECURITY: Check if this transaction hash has been processed before (replay attack prevention)
	var existingTxHash string
	err = pw.db.QueryRowContext(ctx, `
		SELECT tx_hash
		FROM processed_payments
		WHERE tx_hash = $1
	`, transfer.TxHash).Scan(&existingTxHash)
	
	if err == nil && existingTxHash != "" {
		log.Printf("PaymentWatcher: Transaction %s already processed (replay attack prevented)", transfer.TxHash)
		return fmt.Errorf("transaction %s has already been processed", transfer.TxHash)
	}
	
	// Mark task as paid
	log.Printf("PaymentWatcher: Payment verified for task %s (tx: %s)", task.TaskID, transfer.TxHash)
	if err := pw.taskPaymentService.MarkTaskAsPaid(ctx, task.TaskID, transfer.TxHash); err != nil {
		return fmt.Errorf("failed to mark task as paid: %w", err)
	}
	
	// Record processed payment to prevent replay attacks
	_, err = pw.db.ExecContext(ctx, `
		INSERT INTO processed_payments (tx_hash, task_id, processed_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (tx_hash) DO NOTHING
	`, transfer.TxHash, task.TaskID)
	
	if err != nil {
		log.Printf("PaymentWatcher: Warning - failed to record processed payment: %v", err)
		// Don't fail the entire operation, but log the error
	}

	log.Printf("PaymentWatcher: Task %s status updated to 'queued'", task.TaskID)
	return nil
}

