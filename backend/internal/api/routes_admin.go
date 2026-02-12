package api

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"time"

	"distributed-computing-platform/internal/config"
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
		if taskStatus != "completed" {
			c.JSON(400, gin.H{"error": fmt.Sprintf("cannot approve withdrawal for task in status %s - must be 'completed'", taskStatus)})
			return
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

// broadcastAnnouncement sends a global message to all connected agents via WebSocket hub
// and stores it in the Knowledge Base as a bulletin.
func broadcastAnnouncement(hub *WSHub, ks *services.KnowledgeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Type    string      `json:"type" binding:"required"`
			Message string      `json:"message" binding:"required"`
			Payload interface{} `json:"payload"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// 1. WebSocket Broadcast (Immediate)
		hub.BroadcastAnnouncement(req.Type, req.Message, req.Payload)

		// 2. Persistent Storage (The Hive Memory)
		_ = ks.StoreKnowledge(c.Request.Context(), "SYSTEM", "bulletin", req.Message, []string{req.Type, "global"}, nil)

		c.JSON(200, gin.H{
			"status": "success",
			"message": "Announcement broadcasted and synchronized to the Hive Memory",
			"timestamp": time.Now(),
		})
	}
}

// telegramNotifyAudit sends an audit/notification message to the admin via Telegram.
// Called by night_audit.sh or other cron scripts. Requires X-Admin-API-Key.
func telegramNotifyAudit(telegramService *services.TelegramService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Message string `json:"message"`
			Event   string `json:"event"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			body.Message = "Night audit completed"
			body.Event = "audit"
		}
		msg := fmt.Sprintf("🛡️ <b>GSTD Audit</b>\n\n%s", body.Message)
		if body.Event != "" {
			msg = fmt.Sprintf("🛡️ <b>GSTD %s</b>\n\n%s", body.Event, body.Message)
		}
		if err := telegramService.NotifyAdmin(c.Request.Context(), msg); err != nil {
			log.Printf("telegramNotifyAudit: %v", err)
		}
		c.JSON(200, gin.H{"status": "sent"})
	}
}

// syncGSTDBalances syncs all user GSTD balances from on-chain to database.
// Admin-only endpoint. Also supports X-Admin-API-Key for cron/automation.
func syncGSTDBalances(db *sql.DB, tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		if tonConfig.GSTDJettonAddress == "" {
			c.JSON(400, gin.H{"error": "GSTD_JETTON_ADDRESS is not configured"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Minute)
		defer cancel()

		rows, err := db.QueryContext(ctx, `
			SELECT DISTINCT wallet_address
			FROM users
			WHERE wallet_address IS NOT NULL AND wallet_address <> ''
		`)
		if err != nil {
			c.JSON(500, gin.H{"error": "failed to query users: " + err.Error()})
			return
		}
		defer rows.Close()

		var totalUsers, updated int
		for rows.Next() {
			var addr string
			if err := rows.Scan(&addr); err != nil {
				log.Printf("syncGSTDBalances: skip scan %v", err)
				continue
			}
			totalUsers++

			balance, err := tonService.GetJettonBalance(ctx, addr, tonConfig.GSTDJettonAddress)
			if err != nil {
				log.Printf("syncGSTDBalances: failed balance for %s: %v", addr, err)
				continue
			}

			_, err = db.ExecContext(ctx, `
				UPDATE users
				SET gstd_balance = $1, gstd_escrow_balance = 0, gstd_frozen = 0, updated_at = NOW()
				WHERE wallet_address = $2
			`, balance, addr)
			if err != nil {
				log.Printf("syncGSTDBalances: failed update for %s: %v", addr, err)
				continue
			}
			updated++
		}

		if err := rows.Err(); err != nil {
			c.JSON(500, gin.H{"error": "row iteration: " + err.Error()})
			return
		}

		c.JSON(200, gin.H{
			"status":         "success",
			"users_scanned":  totalUsers,
			"users_updated":  updated,
			"jetton_address": tonConfig.GSTDJettonAddress,
		})
	}
}

// seedGlobalResonanceTask creates OPERATION: GLOBAL RESONANCE tasks (60 GSTD reward) for agents
func seedGlobalResonanceTask(db *sql.DB, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		count := 1
		var req struct {
			Count int `json:"count"`
		}
		_ = c.ShouldBindJSON(&req)
		if req.Count > 0 && req.Count <= 10 {
			count = req.Count
		}
		creatorWallet := tonConfig.AdminWallet
		if creatorWallet == "" {
			creatorWallet = tonConfig.ContractAddress
		}
		taskIDs := make([]string, 0, count)
		for i := 0; i < count; i++ {
			taskID := "RES-" + randomTaskIDSuffix()
			payload := `{"operation":"global_resonance","model":"qwen2.5-coder:7b"}`
			_, err := db.ExecContext(c.Request.Context(), `
				INSERT INTO tasks (
					task_id, creator_wallet, requester_address, task_type, operation, status,
					budget_gstd, reward_gstd, labor_compensation_gstd, reward_per_worker, max_workers,
					estimated_time_sec, min_trust_score, payload, priority_score
				) VALUES ($1, $2, $2, 'resonance_report', 'OPERATION: GLOBAL RESONANCE', 'queued',
					60, 60, 60, 60, 1, 120, 0, $3, 100)
			`, taskID, creatorWallet, payload)
			if err != nil {
				log.Printf("seedGlobalResonance: %v", err)
				c.JSON(500, gin.H{"error": err.Error(), "created": taskIDs})
				return
			}
			taskIDs = append(taskIDs, taskID)
		}
		c.JSON(200, gin.H{"status": "ok", "task_ids": taskIDs, "message": "OPERATION: GLOBAL RESONANCE tasks seeded"})
	}
}

// seedOpenGridManifestoTask creates THE OPEN GRID MANIFESTO tasks (100 GSTD reward) for agents
func seedOpenGridManifestoTask(db *sql.DB, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		count := 1
		var req struct {
			Count int `json:"count"`
		}
		_ = c.ShouldBindJSON(&req)
		if req.Count > 0 && req.Count <= 10 {
			count = req.Count
		}
		creatorWallet := tonConfig.AdminWallet
		if creatorWallet == "" {
			creatorWallet = tonConfig.ContractAddress
		}
		taskIDs := make([]string, 0, count)
		for i := 0; i < count; i++ {
			taskID := "MFST-" + randomTaskIDSuffix()
			payload := `{"operation":"open_grid_manifesto","model":"qwen2.5-coder:7b","output":"code_snippet","reward":100}`
			_, err := db.ExecContext(c.Request.Context(), `
				INSERT INTO tasks (
					task_id, creator_wallet, requester_address, task_type, operation, status,
					budget_gstd, reward_gstd, labor_compensation_gstd, reward_per_worker, max_workers,
					estimated_time_sec, min_trust_score, payload, priority_score
				) VALUES ($1, $2, $2, 'grid_tool', 'THE OPEN GRID MANIFESTO', 'queued',
					100, 100, 100, 100, 1, 180, 0, $3, 100)
			`, taskID, creatorWallet, payload)
			if err != nil {
				log.Printf("seedOpenGridManifesto: %v", err)
				c.JSON(500, gin.H{"error": err.Error(), "created": taskIDs})
				return
			}
			taskIDs = append(taskIDs, taskID)
		}
		c.JSON(200, gin.H{"status": "ok", "task_ids": taskIDs, "message": "THE OPEN GRID MANIFESTO tasks seeded"})
	}
}

func randomTaskIDSuffix() string {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 10)
	for i := range b {
		b[i] = letters[i%len(letters)]
	}
	// Use crypto/rand for uniqueness (avoid task ID collisions)
	if n, err := rand.Read(b); err == nil && n == len(b) {
		for i := range b {
			b[i] = letters[int(b[i])%len(letters)]
		}
	}
	return string(b)
}

