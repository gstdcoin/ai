package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"distributed-computing-platform/internal/config"
)

// PaymentTracker tracks payout transactions on blockchain and reconciles with database
type PaymentTracker struct {
	db          *sql.DB
	tonService  *TONService
	tonConfig   config.TONConfig
	contractAddr string
	stopChan    chan struct{}
}

// NewPaymentTracker creates a new payment tracker service
func NewPaymentTracker(db *sql.DB, tonService *TONService, tonConfig config.TONConfig) *PaymentTracker {
	contractAddr := tonConfig.ContractAddress
	if contractAddr == "" {
		contractAddr = "EQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqZ7_" // Default from requirements
	}

	return &PaymentTracker{
		db:           db,
		tonService:   tonService,
		tonConfig:    tonConfig,
		contractAddr: contractAddr,
		stopChan:     make(chan struct{}),
	}
}

// Start begins tracking payments every 2 minutes
func (pt *PaymentTracker) Start(ctx context.Context) {
	log.Printf("PaymentTracker: Starting payment tracking for contract %s", pt.contractAddr)
	
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	// Initial check
	pt.reconcilePayments(ctx)

	for {
		select {
		case <-ticker.C:
			pt.reconcilePayments(ctx)
		case <-pt.stopChan:
			log.Println("PaymentTracker: Stopping payment tracking")
			return
		case <-ctx.Done():
			log.Println("PaymentTracker: Context cancelled, stopping")
			return
		}
	}
}

// Stop stops the payment tracker
func (pt *PaymentTracker) Stop() {
	close(pt.stopChan)
}

// reconcilePayments checks blockchain transactions and reconciles with database
func (pt *PaymentTracker) reconcilePayments(ctx context.Context) {
	// Check database connection first
	if err := pt.db.PingContext(ctx); err != nil {
		log.Printf("PaymentTracker: Database not available, skipping reconciliation: %v", err)
		return
	}

	log.Printf("PaymentTracker: Starting reconciliation cycle")

	// Get pending transactions from database
	rows, err := pt.db.QueryContext(ctx, `
		SELECT id, task_id, executor_address, tx_hash, query_id, status, created_at,
		       executor_reward_ton, platform_fee_ton, nonce
		FROM payout_transactions
		WHERE status IN ('pending', 'sent')
		ORDER BY created_at ASC
		LIMIT 100
	`)
	if err != nil {
		log.Printf("PaymentTracker: Error querying pending transactions: %v", err)
		return
	}
	defer rows.Close()

	var transactions []struct {
		ID               int
		TaskID           string
		ExecutorAddr     string
		TxHash           sql.NullString
		QueryID          sql.NullInt64
		Status           string
		CreatedAt        time.Time
		ExecutorReward   float64
		PlatformFee      float64
		Nonce            int64
	}

	for rows.Next() {
		var tx struct {
			ID               int
			TaskID           string
			ExecutorAddr     string
			TxHash           sql.NullString
			QueryID          sql.NullInt64
			Status           string
			CreatedAt        time.Time
			ExecutorReward   float64
			PlatformFee      float64
			Nonce            int64
		}
		err := rows.Scan(&tx.ID, &tx.TaskID, &tx.ExecutorAddr, &tx.TxHash, &tx.QueryID, &tx.Status, &tx.CreatedAt,
			&tx.ExecutorReward, &tx.PlatformFee, &tx.Nonce)
		if err != nil {
			log.Printf("PaymentTracker: Error scanning transaction: %v", err)
			continue
		}
		transactions = append(transactions, tx)
	}

	if len(transactions) == 0 {
		log.Printf("PaymentTracker: No pending transactions to reconcile")
		return
	}

	log.Printf("PaymentTracker: Found %d pending transactions to reconcile", len(transactions))

	// Get recent transactions from blockchain
	blockchainTxs, err := pt.tonService.GetContractTransactions(ctx, pt.contractAddr, 50)
	if err != nil {
		log.Printf("PaymentTracker: Error fetching blockchain transactions: %v", err)
		// Continue with timeout checks even if API fails
	}

	// Process each pending transaction
	for _, dbTx := range transactions {
		// Check if transaction is older than 24 hours
		if time.Since(dbTx.CreatedAt) > 24*time.Hour {
			// Mark as failed if no transaction found or transaction is stuck
			log.Printf("PaymentTracker: Transaction %d (task: %s) timed out after 24 hours, marking as failed and refunding balance",
				dbTx.ID, dbTx.TaskID)
			
			// Mark transaction as failed and refund balance to user
			err := pt.markTransactionFailedAndRefund(ctx, dbTx.ID, dbTx.TaskID, dbTx.ExecutorAddr, dbTx.ExecutorReward)
			if err != nil {
				log.Printf("PaymentTracker: Error marking transaction as failed and refunding: %v", err)
			}
			continue
		}

		// Check blockchain for transaction
		if dbTx.TxHash.Valid && dbTx.TxHash.String != "" {
			// Transaction hash is set - check if it's confirmed
			if pt.isTransactionConfirmed(blockchainTxs, dbTx.TxHash.String) {
				log.Printf("PaymentTracker: Transaction %s confirmed for task %s",
					dbTx.TxHash.String, dbTx.TaskID)
				
				pt.markTransactionConfirmed(ctx, dbTx.ID, dbTx.TaskID, dbTx.TxHash.String, dbTx.ExecutorReward, dbTx.PlatformFee, dbTx.Nonce, dbTx.QueryID)
				continue
			}
		}

		// Check by query_id or comment
		if dbTx.QueryID.Valid {
			// Try to find transaction by query_id
			for _, bcTx := range blockchainTxs {
				if bcTx.QueryID == dbTx.QueryID.Int64 && bcTx.Success {
					log.Printf("PaymentTracker: Found confirmed transaction by query_id %d for task %s",
						dbTx.QueryID.Int64, dbTx.TaskID)
					
					pt.markTransactionConfirmed(ctx, dbTx.ID, dbTx.TaskID, bcTx.Hash, dbTx.ExecutorReward, dbTx.PlatformFee, dbTx.Nonce, dbTx.QueryID)
					break
				}
			}
		}

		// Try to find by comment (task_id in payload)
		for _, bcTx := range blockchainTxs {
			if bcTx.InMsg.Comment != "" && strings.Contains(bcTx.InMsg.Comment, dbTx.TaskID) {
				if bcTx.Success {
					log.Printf("PaymentTracker: Found confirmed transaction by comment for task %s (hash: %s)",
						dbTx.TaskID, bcTx.Hash)
					
					pt.markTransactionConfirmed(ctx, dbTx.ID, dbTx.TaskID, bcTx.Hash, dbTx.ExecutorReward, dbTx.PlatformFee, dbTx.Nonce, dbTx.QueryID)
					break
				}
			}
		}
	}

	log.Printf("PaymentTracker: Reconciliation cycle completed")
}

// isTransactionConfirmed checks if a transaction hash exists in blockchain transactions
func (pt *PaymentTracker) isTransactionConfirmed(blockchainTxs []Transaction, txHash string) bool {
	for _, tx := range blockchainTxs {
		if tx.Hash == txHash && tx.Success {
			return true
		}
	}
	return false
}

// markTransactionConfirmed marks a transaction as confirmed and updates task status
// Also logs the successful transaction to payout_history
func (pt *PaymentTracker) markTransactionConfirmed(ctx context.Context, txID int, taskID, txHash string, executorReward, platformFee float64, nonce int64, queryID sql.NullInt64) {
	tx, err := pt.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("PaymentTracker: Error beginning transaction: %v", err)
		return
	}
	defer tx.Rollback()

	// Update payout_transactions
	_, err = tx.ExecContext(ctx, `
		UPDATE payout_transactions
		SET status = 'confirmed', tx_hash = $1, confirmed_at = NOW()
		WHERE id = $2
	`, txHash, txID)
	if err != nil {
		log.Printf("PaymentTracker: Error updating transaction status: %v", err)
		return
	}

	// Log successful transaction to payout_history
	var queryIDValue *int64
	if queryID.Valid {
		queryIDValue = &queryID.Int64
	}
	
	// Get executor_address from payout_transactions
	var executorAddress string
	err = tx.QueryRowContext(ctx, `SELECT executor_address FROM payout_transactions WHERE id = $1`, txID).Scan(&executorAddress)
	if err != nil {
		log.Printf("PaymentTracker: Error getting executor address: %v", err)
		// Continue anyway - history logging is not critical
	} else {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO payout_history (
				payout_transaction_id, task_id, executor_address, tx_hash, query_id,
				executor_reward_ton, platform_fee_ton, nonce, confirmed_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		`, txID, taskID, executorAddress, txHash, queryIDValue, executorReward, platformFee, nonce)
		if err != nil {
			log.Printf("PaymentTracker: Error logging to payout_history: %v", err)
			// Continue anyway - history logging is not critical
		} else {
			log.Printf("PaymentTracker: Successfully logged transaction %d to payout_history", txID)
		}
	}

	// Update payout_intents
	_, err = tx.ExecContext(ctx, `
		UPDATE payout_intents
		SET used = TRUE, used_at = NOW()
		WHERE task_id = $1
	`, taskID)
	if err != nil {
		log.Printf("PaymentTracker: Error updating intent status: %v", err)
		// Continue anyway
	}

	// Update task status
	_, err = tx.ExecContext(ctx, `
		UPDATE tasks
		SET executor_payout_status = 'completed'
		WHERE task_id = $1
	`, taskID)
	if err != nil {
		log.Printf("PaymentTracker: Error updating task status: %v", err)
		return
	}

	if err := tx.Commit(); err != nil {
		log.Printf("PaymentTracker: Error committing transaction: %v", err)
		return
	}

	log.Printf("PaymentTracker: Successfully marked transaction %d (task: %s) as confirmed and logged to history", txID, taskID)
}

// markTransactionFailedAndRefund marks a transaction as failed after 24 hours timeout
// and refunds the balance to the user's available balance for retry
func (pt *PaymentTracker) markTransactionFailedAndRefund(ctx context.Context, txID int, taskID, executorAddress string, executorReward float64) error {
	tx, err := pt.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error beginning transaction: %w", err)
	}
	defer tx.Rollback()

	// Mark transaction as failed
	_, err = tx.ExecContext(ctx, `
		UPDATE payout_transactions
		SET status = 'failed', failed_at = NOW(),
		    error_message = 'Transaction stuck in TON network for more than 24 hours - refunded to user balance'
		WHERE id = $1
	`, txID)
	if err != nil {
		return fmt.Errorf("error marking transaction as failed: %w", err)
	}

	// Update task status to allow retry
	_, err = tx.ExecContext(ctx, `
		UPDATE tasks
		SET executor_payout_status = 'failed'
		WHERE task_id = $1
	`, taskID)
	if err != nil {
		return fmt.Errorf("error updating task status: %w", err)
	}

	// Refund balance to user
	// Add executor_reward back to user's available balance
	// Try to update users table with wallet_address field
	_, err = tx.ExecContext(ctx, `
		UPDATE users
		SET balance = COALESCE(balance, 0) + $1,
		    updated_at = NOW()
		WHERE wallet_address = $2 OR address = $2
	`, executorReward, executorAddress)
	if err != nil {
		// If users table doesn't have balance or address doesn't exist, log but continue
		log.Printf("PaymentTracker: Warning - could not refund balance to user %s: %v (transaction still marked as failed)", executorAddress, err)
		// Continue anyway - transaction is marked as failed
	} else {
		log.Printf("PaymentTracker: Refunded %.9f TON to user %s for failed transaction %d", executorReward, executorAddress, txID)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("error committing transaction: %w", err)
	}

	log.Printf("PaymentTracker: Successfully marked transaction %d (task: %s) as failed and refunded balance to %s", txID, taskID, executorAddress)
	return nil
}

// UpdateTransactionStatus updates transaction status when user reports it
func (pt *PaymentTracker) UpdateTransactionStatus(ctx context.Context, taskID, txHash string, status string) error {
	_, err := pt.db.ExecContext(ctx, `
		UPDATE payout_transactions
		SET status = $1, tx_hash = $2, sent_at = NOW()
		WHERE task_id = $3 AND status = 'pending'
	`, status, txHash, taskID)
	return err
}
