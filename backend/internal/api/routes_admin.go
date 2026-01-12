package api

import (
	"context"
	"database/sql"
	"fmt"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func getAdminHealth(
	db *sql.DB,
	redisClient *redis.Client,
	rewardEngine *services.RewardEngine,
	payoutRetry *services.PayoutRetryService,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check database status
		dbStatus := "healthy"
		if err := db.Ping(); err != nil {
			dbStatus = "unhealthy: " + err.Error()
		}

		// Check Redis status
		redisStatus := "healthy"
		if redisClient != nil {
			if err := redisClient.Ping(c.Request.Context()).Err(); err != nil {
				redisStatus = "unhealthy: " + err.Error()
			}
		} else {
			redisStatus = "not configured"
		}

		// Get last 5 XAUt swap results
		var swaps []map[string]interface{}
		rows, err := db.Query(`
			SELECT task_id, gstd_amount, xaut_amount, swap_tx_hash, timestamp
			FROM golden_reserve_log
			WHERE swap_tx_hash IS NOT NULL
			ORDER BY timestamp DESC
			LIMIT 5
		`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var taskID, txHash sql.NullString
				var gstdAmount, xautAmount sql.NullFloat64
				var timestamp interface{}

				if err := rows.Scan(&taskID, &gstdAmount, &xautAmount, &txHash, &timestamp); err == nil {
					swaps = append(swaps, map[string]interface{}{
						"task_id":     taskID.String,
						"gstd_amount": gstdAmount.Float64,
						"xaut_amount": xautAmount.Float64,
						"tx_hash":     txHash.String,
						"timestamp":   timestamp,
					})
				}
			}
		}

		// Get number of pending retries
		var pendingRetries int
		db.QueryRow(`
			SELECT COUNT(*)
			FROM failed_payouts
			WHERE status = 'pending' AND retry_count < max_retries
		`).Scan(&pendingRetries)

		c.JSON(200, gin.H{
			"database": gin.H{
				"status": dbStatus,
			},
			"redis": gin.H{
				"status": redisStatus,
			},
			"last_xaut_swaps": swaps,
			"pending_retries":  pendingRetries,
		})
	}
}

// getPendingWithdrawals returns all withdrawal locks with 'pending_approval' status
func getPendingWithdrawals(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(`
			SELECT id, task_id, worker_wallet, amount_gstd, status, created_at, notes
			FROM withdrawal_locks
			WHERE status = 'pending_approval'
			ORDER BY created_at DESC
		`)
		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
		}
		defer rows.Close()

		var withdrawals []map[string]interface{}
		for rows.Next() {
			var id int
			var taskID, workerWallet, status, notes sql.NullString
			var amountGSTD float64
			var createdAt interface{}

			if err := rows.Scan(&id, &taskID, &workerWallet, &amountGSTD, &status, &createdAt, &notes); err != nil {
				continue
			}

			withdrawals = append(withdrawals, map[string]interface{}{
				"id":            id,
				"task_id":       taskID.String,
				"worker_wallet": workerWallet.String,
				"amount_gstd":   amountGSTD,
				"status":        status.String,
				"created_at":    createdAt,
				"notes":         notes.String,
			})
		}

		c.JSON(200, gin.H{
			"pending_withdrawals": withdrawals,
			"count":               len(withdrawals),
		})
	}
}

// approveWithdrawal approves a withdrawal lock and triggers payout
func approveWithdrawal(db *sql.DB, rewardEngine *services.RewardEngine) gin.HandlerFunc {
	return func(c *gin.Context) {
		withdrawalID := c.Param("id")
		if withdrawalID == "" {
			c.JSON(400, gin.H{"error": "withdrawal ID is required"})
			return
		}

		// Get withdrawal lock details
		var taskID, workerWallet sql.NullString
		var amountGSTD float64
		var currentStatus string

		err := db.QueryRow(`
			SELECT task_id, worker_wallet, amount_gstd, status
			FROM withdrawal_locks
			WHERE id = $1
		`, withdrawalID).Scan(&taskID, &workerWallet, &amountGSTD, &currentStatus)

		if err != nil {
			c.JSON(404, gin.H{"error": "withdrawal lock not found"})
			return
		}

		// Verify it's pending approval
		if currentStatus != "pending_approval" {
			c.JSON(400, gin.H{"error": "withdrawal is not pending approval"})
			return
		}

		// Update status to approved
		_, err = db.Exec(`
			UPDATE withdrawal_locks
			SET status = 'approved',
			    approved_by = 'admin_api',
			    approved_at = NOW()
			WHERE id = $1
		`, withdrawalID)

		if err != nil {
			c.JSON(500, gin.H{"error": SanitizeError(err)})
			return
		}

		// Trigger payout via RewardEngine
		// We need to get the task to pass to DistributeRewards
		var task models.Task
		var creatorWallet, depositID, paymentMemo, payload sql.NullString
		var budgetGSTD, rewardGSTD sql.NullFloat64
		var taskStatus string

		err = db.QueryRow(`
			SELECT task_id, creator_wallet, requester_address, task_type, status,
			       budget_gstd, reward_gstd, deposit_id, payment_memo, payload,
			       created_at, priority_score
			FROM tasks
			WHERE task_id = $1
		`, taskID.String).Scan(
			&task.TaskID,
			&creatorWallet,
			&task.RequesterAddress,
			&task.TaskType,
			&taskStatus,
			&budgetGSTD,
			&rewardGSTD,
			&depositID,
			&paymentMemo,
			&payload,
			&task.CreatedAt,
			&task.PriorityScore,
		)

		if err != nil {
			c.JSON(500, gin.H{"error": "failed to retrieve task for payout"})
			return
		}

		// Build task object
		if creatorWallet.Valid {
			task.CreatorWallet = &creatorWallet.String
		}
		if budgetGSTD.Valid {
			task.BudgetGSTD = &budgetGSTD.Float64
		}
		if rewardGSTD.Valid {
			task.RewardGSTD = &rewardGSTD.Float64
		}
		task.Status = "completed"

		// Trigger payout in background
		go func() {
			bgCtx := context.Background()
			if err := rewardEngine.DistributeRewards(bgCtx, &task, workerWallet.String); err != nil {
				// Log error but don't fail the approval
				fmt.Printf("Error processing approved withdrawal %s: %v\n", withdrawalID, err)
			}
		}()

		c.JSON(200, gin.H{
			"message": "Withdrawal approved",
			"withdrawal_id": withdrawalID,
			"task_id": taskID.String,
			"amount_gstd": amountGSTD,
		})
	}
}

