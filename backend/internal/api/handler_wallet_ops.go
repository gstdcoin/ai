package api

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ═══════════════════════════════════════════════════════════════
// Wallet Transfer + Staking Endpoints
// These endpoints handle internal GSTD transfers and staking
// operations. All token movements are recorded in the ledger.
// ═══════════════════════════════════════════════════════════════

// POST /wallet/transfer — transfer GSTD between wallets (off-chain)
func walletTransfer(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		senderWallet, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "authentication required"})
			return
		}
		sender := senderWallet.(string)

		var req struct {
			To          string  `json:"to" binding:"required"`
			Amount      float64 `json:"amount" binding:"required"`
			Description string  `json:"description"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "to and amount are required"})
			return
		}

		if req.Amount <= 0 {
			c.JSON(400, gin.H{"error": "amount must be positive"})
			return
		}
		if req.Amount > 1e9 {
			c.JSON(400, gin.H{"error": "amount too large"})
			return
		}
		if sender == req.To {
			c.JSON(400, gin.H{"error": "cannot transfer to yourself"})
			return
		}

		// Atomic transfer: debit sender, credit recipient
		tx, err := db.BeginTx(c.Request.Context(), nil)
		if err != nil {
			c.JSON(500, gin.H{"error": "transaction start failed"})
			return
		}
		defer tx.Rollback()

		// Check sender balance
		var senderBalance float64
		err = tx.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`,
			sender).Scan(&senderBalance)
		if err != nil {
			c.JSON(400, gin.H{"error": "wallet not found"})
			return
		}
		if senderBalance < req.Amount {
			c.JSON(400, gin.H{
				"error":     "insufficient balance",
				"available": senderBalance,
				"requested": req.Amount,
			})
			return
		}

		// Ensure recipient exists
		_, _ = tx.ExecContext(c.Request.Context(),
			`INSERT INTO users (wallet_address, created_at, updated_at) 
			 VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, req.To)

		// Debit sender
		res, err := tx.ExecContext(c.Request.Context(),
			`UPDATE users SET gstd_balance = gstd_balance - $1, updated_at = NOW() 
			 WHERE wallet_address = $2 AND gstd_balance >= $1`,
			req.Amount, sender)
		if err != nil {
			c.JSON(500, gin.H{"error": "debit failed"})
			return
		}
		rowsAff, _ := res.RowsAffected()
		if rowsAff == 0 {
			c.JSON(400, gin.H{"error": "insufficient balance or race condition detected"})
			return
		}

		// Credit recipient
		_, err = tx.ExecContext(c.Request.Context(),
			`UPDATE users SET gstd_balance = gstd_balance + $1, updated_at = NOW() 
			 WHERE wallet_address = $2`,
			req.Amount, req.To)
		if err != nil {
			c.JSON(500, gin.H{"error": "credit failed"})
			return
		}

		// Record transaction
		txID := uuid.New().String()[:16]
		desc := req.Description
		if desc == "" {
			desc = fmt.Sprintf("Transfer %.4f GSTD", req.Amount)
		}
		_, _ = tx.ExecContext(c.Request.Context(),
			`INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
			 VALUES ($1, $2, $3, $4, 'transfer', $5, NOW())`,
			txID, sender, req.To, req.Amount, desc)

		if err := tx.Commit(); err != nil {
			c.JSON(500, gin.H{"error": "commit failed"})
			return
		}

		log.Printf("💸 Transfer: %s → %s: %.4f GSTD", sender[:12], req.To[:min(12, len(req.To))], req.Amount)

		c.JSON(200, gin.H{
			"status":    "completed",
			"tx_id":     txID,
			"from":      sender,
			"to":        req.To,
			"amount":    req.Amount,
			"fee":       0.0, // No fee for internal transfers
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// stakingAPY returns APY for a given lock period
func stakingAPY(lockDays int) float64 {
	switch {
	case lockDays >= 365:
		return 36.0
	case lockDays >= 180:
		return 24.0
	case lockDays >= 90:
		return 15.0
	default:
		return 8.0
	}
}

// POST /staking/stake — lock GSTD for staking (earn APY)
func stakingStake(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddr, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "authentication required"})
			return
		}
		wallet := walletAddr.(string)

		var req struct {
			Amount   float64 `json:"amount" binding:"required"`
			LockDays int     `json:"lock_days"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "amount is required"})
			return
		}

		if req.Amount < 1.0 {
			c.JSON(400, gin.H{"error": "minimum stake is 1 GSTD"})
			return
		}
		if req.Amount > 1e9 {
			c.JSON(400, gin.H{"error": "amount too large"})
			return
		}

		// Default lock period 30 days
		if req.LockDays <= 0 {
			req.LockDays = 30
		}
		apy := stakingAPY(req.LockDays)
		unlockAt := time.Now().Add(time.Duration(req.LockDays) * 24 * time.Hour)

		tx, err := db.BeginTx(c.Request.Context(), nil)
		if err != nil {
			c.JSON(500, gin.H{"error": "transaction start failed"})
			return
		}
		defer tx.Rollback()

		// Check available balance
		var available float64
		err = tx.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`,
			wallet).Scan(&available)
		if err != nil {
			c.JSON(400, gin.H{"error": "wallet not found"})
			return
		}
		if available < req.Amount {
			c.JSON(402, gin.H{
				"error":     "insufficient GSTD balance",
				"available": available,
				"requested": req.Amount,
			})
			return
		}

		// Move from gstd_balance to gstd_frozen (staking)
		res, err := tx.ExecContext(c.Request.Context(),
			`UPDATE users SET 
				gstd_balance = gstd_balance - $1,
				gstd_frozen = COALESCE(gstd_frozen, 0) + $1,
				updated_at = NOW()
			 WHERE wallet_address = $2 AND gstd_balance >= $1`,
			req.Amount, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "stake operation failed"})
			return
		}
		rowsAff, _ := res.RowsAffected()
		if rowsAff == 0 {
			c.JSON(400, gin.H{"error": "insufficient balance or race condition detected during staking"})
			return
		}

		// Record staking position
		positionID := uuid.New().String()[:16]
		_, _ = tx.ExecContext(c.Request.Context(),
			`INSERT INTO staking_positions (id, wallet_address, amount, apy, lock_days, unlock_at, status, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
			 ON CONFLICT DO NOTHING`,
			positionID, wallet, req.Amount, apy, req.LockDays, unlockAt)

		// Record in ledger
		txID := uuid.New().String()[:16]
		_, _ = tx.ExecContext(c.Request.Context(),
			`INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
			 VALUES ($1, $2, $2, $3, 'stake', $4, NOW())`,
			txID, wallet, req.Amount, fmt.Sprintf("Staked %.2f GSTD for %d days at %.0f%% APY", req.Amount, req.LockDays, apy))

		if err := tx.Commit(); err != nil {
			c.JSON(500, gin.H{"error": "commit failed"})
			return
		}

		// Get updated staking info
		var frozen float64
		_ = db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(gstd_frozen, 0) FROM users WHERE wallet_address = $1`,
			wallet).Scan(&frozen)

		log.Printf("🔒 Stake: %s staked %.4f GSTD for %dd at %.0f%% APY (total frozen: %.4f)", wallet[:12], req.Amount, req.LockDays, apy, frozen)

		dailyRate := apy / 365.0 / 100.0
		dailyReward := frozen * dailyRate

		c.JSON(200, gin.H{
			"status":         "staked",
			"tx_id":          txID,
			"position_id":    positionID,
			"amount_staked":  req.Amount,
			"total_staked":   frozen,
			"apy":            apy,
			"lock_days":      req.LockDays,
			"daily_reward":   math.Round(dailyReward*10000) / 10000,
			"unlock_at":      unlockAt.UTC().Format(time.RFC3339),
			"next_reward_at": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// POST /staking/unstake — unlock staked GSTD
func stakingUnstake(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		walletAddr, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "authentication required"})
			return
		}
		wallet := walletAddr.(string)

		var req struct {
			Amount float64 `json:"amount" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "amount is required"})
			return
		}

		if req.Amount <= 0 {
			c.JSON(400, gin.H{"error": "amount must be positive"})
			return
		}

		tx, err := db.BeginTx(c.Request.Context(), nil)
		if err != nil {
			c.JSON(500, gin.H{"error": "transaction start failed"})
			return
		}
		defer tx.Rollback()

		// Check frozen balance
		var frozen float64
		err = tx.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(gstd_frozen, 0) FROM users WHERE wallet_address = $1`,
			wallet).Scan(&frozen)
		if err != nil {
			c.JSON(400, gin.H{"error": "wallet not found"})
			return
		}
		if frozen < req.Amount {
			c.JSON(400, gin.H{
				"error":     "insufficient staked balance",
				"staked":    frozen,
				"requested": req.Amount,
			})
			return
		}

		// Move from gstd_frozen back to gstd_balance
		res, err := tx.ExecContext(c.Request.Context(),
			`UPDATE users SET 
				gstd_frozen = gstd_frozen - $1,
				gstd_balance = gstd_balance + $1,
				updated_at = NOW()
			 WHERE wallet_address = $2 AND gstd_frozen >= $1`,
			req.Amount, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "unstake operation failed"})
			return
		}
		rowsAff, _ := res.RowsAffected()
		if rowsAff == 0 {
			c.JSON(400, gin.H{"error": "insufficient staked balance during unstaking"})
			return
		}

		// Record in ledger
		txID := uuid.New().String()[:16]
		_, _ = tx.ExecContext(c.Request.Context(),
			`INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
			 VALUES ($1, $2, $2, $3, 'unstake', 'Unstaked GSTD', NOW())`,
			txID, wallet, req.Amount)

		if err := tx.Commit(); err != nil {
			c.JSON(500, gin.H{"error": "commit failed"})
			return
		}

		// Get updated balances
		var newBalance, newFrozen float64
		_ = db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(gstd_balance, 0), COALESCE(gstd_frozen, 0) FROM users WHERE wallet_address = $1`,
			wallet).Scan(&newBalance, &newFrozen)

		log.Printf("🔓 Unstake: %s unstaked %.4f GSTD (remaining frozen: %.4f)", wallet[:12], req.Amount, newFrozen)

		c.JSON(200, gin.H{
			"status":            "unstaked",
			"tx_id":             txID,
			"amount_unstaked":   req.Amount,
			"remaining_staked":  newFrozen,
			"available_balance": newBalance,
			"timestamp":         time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// GET /staking/info — get staking status and APY info
func stakingInfo(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			// Try from session
			if w, exists := c.Get("wallet_address"); exists {
				wallet = w.(string)
			}
		}

		var staked, balance float64
		if wallet != "" {
			_ = db.QueryRowContext(c.Request.Context(),
				`SELECT COALESCE(gstd_frozen, 0), COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`,
				wallet).Scan(&staked, &balance)
		}

		// Platform-wide staking stats
		var totalStaked float64
		var stakerCount int
		_ = db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(gstd_frozen), 0), COUNT(*) FROM users WHERE gstd_frozen > 0`).Scan(&totalStaked, &stakerCount)

		dailyRate := 12.0 / 365.0 / 100.0
		dailyReward := staked * dailyRate

		c.JSON(200, gin.H{
			"wallet": gin.H{
				"address":        wallet,
				"staked":         staked,
				"available":      balance,
				"daily_reward":   math.Round(dailyReward*10000) / 10000,
				"monthly_reward": math.Round(staked*12.0/12.0/100.0*10000) / 10000,
			},
			"platform": gin.H{
				"total_staked": totalStaked,
				"staker_count": stakerCount,
				"apy":          12.0,
				"lock_period":  "30 days",
				"min_stake":    1.0,
				"reward_token": "GSTD",
			},
			"tiers": []gin.H{
				{"name": "Bronze", "min_stake": 1, "apy": 12, "benefits": "Basic staking rewards"},
				{"name": "Silver", "min_stake": 100, "apy": 15, "benefits": "Staking + fee discount 10%"},
				{"name": "Gold", "min_stake": 1000, "apy": 18, "benefits": "Staking + fee discount 25% + priority tasks"},
				{"name": "Diamond", "min_stake": 10000, "apy": 24, "benefits": "Staking + fee discount 50% + Ultra AI access"},
			},
		})
	}
}

// GET /wallet/history — transaction history for a wallet
func walletHistory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet, exists := c.Get("wallet_address")
		if !exists {
			c.JSON(401, gin.H{"error": "authentication required"})
			return
		}
		addr := wallet.(string)

		rows, err := db.QueryContext(c.Request.Context(),
			`SELECT tx_id, from_wallet, to_wallet, amount_gstd, tx_type, COALESCE(description,''), created_at
			 FROM transaction_history 
			 WHERE from_wallet = $1 OR to_wallet = $1
			 ORDER BY created_at DESC LIMIT 50`, addr)
		if err != nil {
			c.JSON(500, gin.H{"error": "query failed"})
			return
		}
		defer rows.Close()

		var txs []gin.H
		for rows.Next() {
			var txID, from, to, txType, desc string
			var amount float64
			var createdAt time.Time
			if err := rows.Scan(&txID, &from, &to, &amount, &txType, &desc, &createdAt); err != nil {
				continue
			}
			direction := "in"
			if from == addr {
				direction = "out"
			}
			txs = append(txs, gin.H{
				"tx_id":       txID,
				"from":        from,
				"to":          to,
				"amount":      amount,
				"type":        txType,
				"direction":   direction,
				"description": desc,
				"timestamp":   createdAt.Format(time.RFC3339),
			})
		}

		if txs == nil {
			txs = []gin.H{}
		}

		c.JSON(200, gin.H{"transactions": txs, "count": len(txs)})
	}
}

// min is defined in middleware_session.go
