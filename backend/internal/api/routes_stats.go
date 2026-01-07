package api

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

func getPublicStats(db *sql.DB, tonService *services.TONService, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get total tasks completed
		var totalTasksCompleted int
		db.QueryRow(`
			SELECT COUNT(*)
			FROM tasks
			WHERE status = 'completed'
		`).Scan(&totalTasksCompleted)

		// Get total workers paid and total GSTD paid
		var totalWorkersPaid int
		var totalGSTDPaid sql.NullFloat64
		db.QueryRow(`
			SELECT 
				COUNT(DISTINCT assigned_device),
				COALESCE(SUM(reward_gstd), 0)
			FROM tasks
			WHERE status = 'completed' AND reward_gstd IS NOT NULL
		`).Scan(&totalWorkersPaid, &totalGSTDPaid)

		// Get XAUt history from golden reserve log
		var xautHistory []map[string]interface{}
		rows, err := db.Query(`
			SELECT timestamp, COALESCE(SUM(xaut_amount), 0) as cumulative_xaut
			FROM golden_reserve_log
			WHERE xaut_amount IS NOT NULL
			GROUP BY timestamp
			ORDER BY timestamp ASC
		`)
		if err == nil {
			defer rows.Close()
			var cumulative float64
			for rows.Next() {
				var timestamp interface{}
				var xautAmount sql.NullFloat64
				if err := rows.Scan(&timestamp, &xautAmount); err == nil {
					if xautAmount.Valid {
						cumulative += xautAmount.Float64
					}
					xautHistory = append(xautHistory, map[string]interface{}{
						"timestamp": timestamp,
						"amount":    cumulative,
					})
				}
			}
		}

		// Get current XAUt balance from treasury
		treasuryWallet := tonConfig.TreasuryWallet
		if treasuryWallet == "" {
			treasuryWallet = "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
		}
		
		var goldenReserveXAUt float64
		
		// Try to get from last entry in history first (faster)
		if len(xautHistory) > 0 {
			if amount, ok := xautHistory[len(xautHistory)-1]["amount"].(float64); ok {
				goldenReserveXAUt = amount
			}
		}

		// If no history or balance is 0, fetch from TonAPI
		if goldenReserveXAUt == 0 && tonService != nil && tonConfig.XAUtJettonAddress != "" {
			ctx := context.Background()
			balance, err := tonService.GetJettonBalance(ctx, treasuryWallet, tonConfig.XAUtJettonAddress)
			if err != nil {
				log.Printf("Failed to fetch XAUt balance from TonAPI: %v", err)
				// Keep 0 if fetch fails, don't break the response
			} else {
				goldenReserveXAUt = balance
			}
		}

		// Get last 3 swaps for Golden Reserve feed
		var lastSwaps []map[string]interface{}
		swapRows, err := db.Query(`
			SELECT task_id, gstd_amount, xaut_amount, swap_tx_hash, timestamp
			FROM golden_reserve_log
			WHERE swap_tx_hash IS NOT NULL AND xaut_amount IS NOT NULL
			ORDER BY timestamp DESC
			LIMIT 3
		`)
		if err == nil {
			defer swapRows.Close()
			for swapRows.Next() {
				var taskID, txHash sql.NullString
				var gstdAmount, xautAmount sql.NullFloat64
				var timestamp interface{}

				if err := swapRows.Scan(&taskID, &gstdAmount, &xautAmount, &txHash, &timestamp); err == nil {
					lastSwaps = append(lastSwaps, map[string]interface{}{
						"task_id":     taskID.String,
						"gstd_amount": gstdAmount.Float64,
						"xaut_amount": xautAmount.Float64,
						"tx_hash":     txHash.String,
						"timestamp":   timestamp,
					})
				}
			}
		}

		c.JSON(200, gin.H{
			"total_tasks_completed": totalTasksCompleted,
			"total_workers_paid":    totalWorkersPaid,
			"total_gstd_paid":       totalGSTDPaid.Float64,
			"golden_reserve_xaut":   goldenReserveXAUt,
			"xaut_history":          xautHistory,
			"system_status":         "Operational",
			"last_swaps":            lastSwaps,
		})
	}
}

