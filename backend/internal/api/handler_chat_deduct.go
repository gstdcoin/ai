package api

import (
	"context"
	"database/sql"
	"log"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// chatDeductHandler handles GSTD deduction for paid Collective Intelligence tiers.
// Called by the frontend /api/chat route BEFORE querying Groq experts.
// Flow: Frontend → POST /chat/deduct → deduct GSTD + 50% reserve + 5% burn → 200 OK → frontend calls Groq
func chatDeductHandler(db *sql.DB, burnService *services.BurnService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WalletAddress string  `json:"wallet_address" binding:"required"`
			Amount        float64 `json:"amount" binding:"required"`
			Tier          string  `json:"tier"`
			TierName      string  `json:"tier_name"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "wallet_address and amount required"})
			return
		}

		if req.Amount <= 0 || req.Amount > 10 {
			c.JSON(400, gin.H{"error": "invalid amount"})
			return
		}

		// Check balance
		var balance float64
		err := db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) 
			FROM users WHERE wallet_address = $1
		`, req.WalletAddress).Scan(&balance)
		if err != nil {
			c.JSON(402, gin.H{
				"error":   "wallet_not_found",
				"message": "Wallet not found. Connect your TON wallet first.",
				"balance": 0,
			})
			return
		}
		if balance < req.Amount {
			c.JSON(402, gin.H{
				"error":   "insufficient_balance",
				"message": "Not enough GSTD. Top up or switch to free tier.",
				"balance": balance,
				"cost":    req.Amount,
				"deficit": req.Amount - balance,
			})
			return
		}

		// Deduct from gstd_balance first, then balance
		res, err := db.ExecContext(c.Request.Context(), `
			UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) - $1, updated_at = NOW()
			WHERE wallet_address = $2 AND COALESCE(gstd_balance, 0) >= $1
		`, req.Amount, req.WalletAddress)
		if err != nil {
			c.JSON(500, gin.H{"error": "deduction_failed"})
			return
		}
		if rows, _ := res.RowsAffected(); rows == 0 {
			// Try balance column
			res2, err := db.ExecContext(c.Request.Context(), `
				UPDATE users SET balance = COALESCE(balance, 0) - $1, updated_at = NOW()
				WHERE wallet_address = $2 AND COALESCE(balance, 0) >= $1
			`, req.Amount, req.WalletAddress)
			if err != nil {
				c.JSON(500, gin.H{"error": "deduction_failed"})
				return
			}
			if rows2, _ := res2.RowsAffected(); rows2 == 0 {
				c.JSON(402, gin.H{"error": "insufficient_balance", "message": "Failed to deduct due to insufficient balance or race condition."})
				return
			}
		}

		log.Printf("💰 [Chat Deduct] %.4f GSTD from %s for %s", req.Amount, req.WalletAddress[:min(12, len(req.WalletAddress))], req.TierName)

		// ═══ FEE SPLIT: 50% Golden Reserve, 5% Burn, 20% Mobile Nodes, 25% Platform ═══
		go func() {
			bgCtx := context.Background()
			reserveFee := req.Amount * 0.50
			burnFee := req.Amount * 0.05
			mobileFee := req.Amount * 0.20 // Phone Nodes Network Support Fee

			// 1. Golden Reserve (staking reward pool)
			if reserveFee > 0 {
				_, err := db.ExecContext(bgCtx, `
					INSERT INTO golden_reserve_log (task_id, gstd_amount, treasury_wallet, timestamp)
					VALUES ($1, $2, 'STAKING_POOL', NOW())`,
					"ci-"+req.WalletAddress[:min(8, len(req.WalletAddress))]+"-"+time.Now().Format("150405"), reserveFee)
				if err != nil {
					log.Printf("⚠️  Golden Reserve deposit failed: %v", err)
				}
			}

			// 2. Token burn
			if burnService != nil && burnFee > 0 {
				burnService.RecordBurn(bgCtx, &services.BurnRecord{
					TransactionID:   "ci-" + req.WalletAddress[:min(8, len(req.WalletAddress))] + "-" + time.Now().Format("150405"),
					TransactionType: "collective_intelligence",
					OriginalAmount:  req.Amount,
					BurnAmount:      burnFee,
					SourceWallet:    req.WalletAddress,
				})
			}

			// 3. Mobile Nodes Network Support Cut
			if mobileFee > 0 {
				// Find active nodes running in "mobile" app mode
				rows, err := db.QueryContext(bgCtx, `
					SELECT wallet_address, id 
					FROM nodes 
					WHERE status = 'online' AND specs->>'device_type' = 'mobile' AND last_seen > NOW() - INTERVAL '15 minutes'
				`)
				if err == nil {
					defer rows.Close()
					type nTarget struct{ w, i string }
					var targets []nTarget
					for rows.Next() {
						var w, i string
						if rows.Scan(&w, &i) == nil {
							targets = append(targets, nTarget{w, i})
						}
					}

					if len(targets) > 0 {
						rewardPerNode := mobileFee / float64(len(targets))
						for _, t := range targets {
							_, _ = db.ExecContext(bgCtx, `
								INSERT INTO node_pending_rewards (owner_wallet, node_id, amount_gstd, reward_type, description, created_at)
								VALUES ($1, $2, $3, 'tx_fee', 'Mobile Node Network Support Fee (Swarm L1)', NOW())
							`, t.w, t.i, rewardPerNode)
						}
						log.Printf("📱 [Mobile Nodes] Distributed %.4f GSTD fee among %d active phone nodes", mobileFee, len(targets))
					}
				}
			}
		}()

		// Get remaining balance
		var remaining float64
		_ = db.QueryRowContext(c.Request.Context(), `
			SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1
		`, req.WalletAddress).Scan(&remaining)

		c.JSON(200, gin.H{
			"status":    "deducted",
			"amount":    req.Amount,
			"remaining": remaining,
			"tier":      req.Tier,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}
}
