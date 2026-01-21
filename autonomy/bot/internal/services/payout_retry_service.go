package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

type PayoutRetryService struct {
	db            *sql.DB
	rewardEngine  *RewardEngine
	checkInterval time.Duration
	stopChan      chan struct{}
}

func NewPayoutRetryService(db *sql.DB, rewardEngine *RewardEngine) *PayoutRetryService {
	return &PayoutRetryService{
		db:            db,
		rewardEngine:  rewardEngine,
		checkInterval: 15 * time.Minute,
		stopChan:      make(chan struct{}),
	}
}

// Start begins the retry service
func (prs *PayoutRetryService) Start(ctx context.Context) {
	log.Println("PayoutRetryService: Starting retry mechanism")
	
	ticker := time.NewTicker(prs.checkInterval)
	defer ticker.Stop()

	// Initial check
	prs.retryFailedPayouts(ctx)

	for {
		select {
		case <-ticker.C:
			prs.retryFailedPayouts(ctx)
		case <-prs.stopChan:
			log.Println("PayoutRetryService: Stopping retry mechanism")
			return
		case <-ctx.Done():
			log.Println("PayoutRetryService: Context cancelled, stopping")
			return
		}
	}
}

// Stop stops the retry service
func (prs *PayoutRetryService) Stop() {
	close(prs.stopChan)
}

// retryFailedPayouts processes all pending failed payouts
func (prs *PayoutRetryService) retryFailedPayouts(ctx context.Context) {
	rows, err := prs.db.QueryContext(ctx, `
		SELECT id, task_id, payout_type, recipient_address, amount_gstd, 
		       error_message, retry_count, max_retries
		FROM failed_payouts
		WHERE status = 'pending' AND retry_count < max_retries
		ORDER BY created_at ASC
		LIMIT 10
	`)
	if err != nil {
		log.Printf("PayoutRetryService: Error querying failed payouts: %v", err)
		return
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var id int
		var taskID, payoutType, recipientAddress sql.NullString
		var amountGSTD float64
		var errorMsg sql.NullString
		var retryCount, maxRetries int

		err := rows.Scan(&id, &taskID, &payoutType, &recipientAddress, &amountGSTD, &errorMsg, &retryCount, &maxRetries)
		if err != nil {
			continue
		}

		log.Printf("PayoutRetryService: Retrying payout %d (task: %s, type: %s, attempt: %d/%d)",
			id, taskID.String, payoutType.String, retryCount+1, maxRetries)

		// Update status to retrying
		prs.db.ExecContext(ctx, `
			UPDATE failed_payouts
			SET status = 'retrying', last_retry_at = NOW()
			WHERE id = $1
		`, id)

		// Retry the payout
		success := false
		if payoutType.String == "worker" && recipientAddress.Valid {
			// Retry worker payout
			err := prs.rewardEngine.sendGSTDToWorker(ctx, recipientAddress.String, amountGSTD, taskID.String)
			if err == nil {
				success = true
			} else {
				log.Printf("PayoutRetryService: Retry failed for payout %d: %v", id, err)
			}
		} else if payoutType.String == "swap" {
			// Retry swap (would need swap-specific retry logic)
			// For now, mark as succeeded if we can't retry
			success = false
		}

		// Update payout status
		if success {
			prs.db.ExecContext(ctx, `
				UPDATE failed_payouts
				SET status = 'succeeded', retry_count = retry_count + 1
				WHERE id = $1
			`, id)
			log.Printf("PayoutRetryService: Successfully retried payout %d", id)
		} else {
			newRetryCount := retryCount + 1
			newStatus := "pending"
			if newRetryCount >= maxRetries {
				newStatus = "failed"
			}
			prs.db.ExecContext(ctx, `
				UPDATE failed_payouts
				SET status = $1, retry_count = $2, error_message = $3
				WHERE id = $4
			`, newStatus, newRetryCount, errorMsg.String, id)
		}

		count++
	}

	if count > 0 {
		log.Printf("PayoutRetryService: Processed %d failed payouts", count)
	}
}

// LogFailedPayout records a failed payout for retry
func (prs *PayoutRetryService) LogFailedPayout(ctx context.Context, taskID, payoutType, recipientAddress string, amountGSTD float64, errorMsg string) error {
	_, err := prs.db.ExecContext(ctx, `
		INSERT INTO failed_payouts (
			task_id, payout_type, recipient_address, amount_gstd, error_message
		) VALUES ($1, $2, $3, $4, $5)
	`, taskID, payoutType, recipientAddress, amountGSTD, errorMsg)
	return err
}

