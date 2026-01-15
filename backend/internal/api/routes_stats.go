package api

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

func getPublicStats(db *sql.DB, tonService *services.TONService, tonConfig config.TONConfig, errorLogger *services.ErrorLogger) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Recover from any panics to prevent 500 errors
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic in getPublicStats handler: %v", r)
				c.JSON(200, gin.H{
					"total_tasks_completed": 0,
					"total_workers_paid":    0,
					"total_gstd_paid":       0.0,
					"golden_reserve_xaut":   0.0,
					"xaut_history":          []interface{}{},
					"system_status":         "Operational",
					"last_swaps":            []interface{}{},
				})
			}
		}()

		// Get total tasks completed
		var totalTasksCompleted int
		if err := db.QueryRow(`
			SELECT COUNT(*)
			FROM tasks
			WHERE status = 'completed'
		`).Scan(&totalTasksCompleted); err != nil {
			log.Printf("Error getting total tasks completed: %v", err)
			totalTasksCompleted = 0
		}

		// Get total workers paid and total GSTD paid
		var totalWorkersPaid int
		var totalGSTDPaid sql.NullFloat64
		if err := db.QueryRow(`
			SELECT 
				COUNT(DISTINCT assigned_device),
				COALESCE(SUM(reward_gstd), 0)
			FROM tasks
			WHERE status = 'completed' AND reward_gstd IS NOT NULL
		`).Scan(&totalWorkersPaid, &totalGSTDPaid); err != nil {
			log.Printf("Error getting total workers paid: %v", err)
			totalWorkersPaid = 0
			totalGSTDPaid = sql.NullFloat64{Valid: false, Float64: 0}
		}

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
		// Wrap in recover to handle any panics from external API calls
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("Panic while fetching XAUt balance from TonAPI: %v", r)
					goldenReserveXAUt = 0
				}
			}()
			
			if goldenReserveXAUt == 0 && tonService != nil && tonConfig.XAUtJettonAddress != "" {
				ctx := context.Background()
				balance, err := tonService.GetJettonBalance(ctx, treasuryWallet, tonConfig.XAUtJettonAddress)
				if err != nil {
					log.Printf("Failed to fetch XAUt balance from TonAPI: %v", err)
					// Log error to database if errorLogger is available
					if errorLogger != nil {
						errorLogger.LogInternalError(ctx, "EXTERNAL_API_ERROR", err, services.SeverityError)
					}
					// Keep 0 if fetch fails, don't break the response
					goldenReserveXAUt = 0
				} else {
					goldenReserveXAUt = balance
				}
			}
		}()
		
		// Ensure balance is never negative and defaults to 0 if not found
		if goldenReserveXAUt < 0 {
			goldenReserveXAUt = 0
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

func getTaskCompletionHistory(statsService *services.StatsService) gin.HandlerFunc {
	return func(c *gin.Context) {
		period := c.DefaultQuery("period", "day") // hour, day, week
		
		data, err := statsService.GetTaskCompletionHistory(c.Request.Context(), period)
		if err != nil {
			log.Printf("Error getting task completion history: %v", err)
			// Return empty array instead of 500 error to prevent frontend crashes
			c.JSON(200, gin.H{
				"period": period,
				"data":   []interface{}{},
			})
			return
		}
		
		// Ensure we always return an array, even if nil
		if data == nil {
			data = []services.TaskCompletionData{}
		}
		
		c.JSON(200, gin.H{
			"period": period,
			"data":   data,
		})
	}
}

func getNetworkStats(statsService *services.StatsService) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := statsService.GetNetworkStats(c.Request.Context())
		if err != nil {
			log.Printf("Error getting network stats: %v", err)
			c.JSON(500, gin.H{"error": "Failed to fetch network stats"})
			return
		}
		c.JSON(200, stats)
	}
}


