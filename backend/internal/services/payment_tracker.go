package services

import (
	"context"
	"database/sql"
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
		SELECT id, task_id, executor_address, tx_hash, query_id, status, created_at
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
		ID             int
		TaskID         string
		ExecutorAddr   string
		TxHash         sql.NullString
		QueryID        sql.NullInt64
		Status         string
		CreatedAt      time.Time
	}

	for rows.Next() {
		var tx struct {
			ID             int
			TaskID         string
			ExecutorAddr   string
			TxHash         sql.NullString
			QueryID        sql.NullInt64
			Status         string
			CreatedAt     time.Time
		}
		err := rows.Scan(&tx.ID, &tx.TaskID, &tx.ExecutorAddr, &tx.TxHash, &tx.QueryID, &tx.Status, &tx.CreatedAt)
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
		// Check if transaction is older than 20 minutes
		if time.Since(dbTx.CreatedAt) > 20*time.Minute {
			// Mark as failed if no transaction found
			if !dbTx.TxHash.Valid || dbTx.TxHash.String == "" {
				log.Printf("PaymentTracker: Transaction %d (task: %s) timed out after 20 minutes, marking as failed",
					dbTx.ID, dbTx.TaskID)
				
				_, err := pt.db.ExecContext(ctx, `
					UPDATE payout_transactions
					SET status = 'failed', failed_at = NOW(),
					    error_message = 'Transaction not found in blockchain after 20 minutes'
					WHERE id = $1
				`, dbTx.ID)
				if err != nil {
					log.Printf("PaymentTracker: Error marking transaction as failed: %v", err)
				}

				// Update task status to allow retry
				_, err = pt.db.ExecContext(ctx, `
					UPDATE tasks
					SET executor_payout_status = 'failed'
					WHERE task_id = $1
				`, dbTx.TaskID)
				if err != nil {
					log.Printf("PaymentTracker: Error updating task status: %v", err)
				}
			}
			continue
		}

		// Check blockchain for transaction
		if dbTx.TxHash.Valid && dbTx.TxHash.String != "" {
			// Transaction hash is set - check if it's confirmed
			if pt.isTransactionConfirmed(blockchainTxs, dbTx.TxHash.String) {
				log.Printf("PaymentTracker: Transaction %s confirmed for task %s",
					dbTx.TxHash.String, dbTx.TaskID)
				
				pt.markTransactionConfirmed(ctx, dbTx.ID, dbTx.TaskID, dbTx.TxHash.String)
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
					
					pt.markTransactionConfirmed(ctx, dbTx.ID, dbTx.TaskID, bcTx.Hash)
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
					
					pt.markTransactionConfirmed(ctx, dbTx.ID, dbTx.TaskID, bcTx.Hash)
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
func (pt *PaymentTracker) markTransactionConfirmed(ctx context.Context, txID int, taskID, txHash string) {
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

	log.Printf("PaymentTracker: Successfully marked transaction %d (task: %s) as confirmed", txID, taskID)
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
