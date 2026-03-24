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

// --- Shared error message constants ---
const (
	errAuthRequired = "authentication required"
	errTxStartFail  = "transaction start failed"
	errWalletNotFound = "wallet not found"
	errCommitFailed = "commit failed"
)

// requireAuth extracts the authenticated wallet address from the
// Gin context. Returns ("", false) and writes a 401 if missing.
func requireAuth(c *gin.Context) (string, bool) {
	w, exists := c.Get("wallet_address")
	if !exists {
		c.JSON(401, gin.H{"error": errAuthRequired})
		return "", false
	}
	return w.(string), true
}

// beginTx starts a database transaction and writes a 500 on failure.
// Caller MUST defer tx.Rollback() on success.
func beginTx(c *gin.Context, db *sql.DB) (*sql.Tx, bool) {
	tx, err := db.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(500, gin.H{"error": errTxStartFail})
		return nil, false
	}
	return tx, true
}

// queryBalance scans a single float64 column from the user row.
// Returns (value, true) on success, or (0, false) and writes an error.
func queryBalance(c *gin.Context, tx *sql.Tx, query string, wallet string) (float64, bool) {
	var val float64
	err := tx.QueryRowContext(c.Request.Context(), query, wallet).Scan(&val)
	if err != nil {
		c.JSON(400, gin.H{"error": errWalletNotFound})
		return 0, false
	}
	return val, true
}

// commitTx commits the transaction and writes 500 on failure.
func commitTx(c *gin.Context, tx *sql.Tx) bool {
	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": errCommitFailed})
		return false
	}
	return true
}

// POST /wallet/transfer — transfer GSTD between wallets (off-chain)
func walletTransfer(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		doWalletTransfer(c, db)
	}
}

func doWalletTransfer(c *gin.Context, db *sql.DB) {
	sender, ok := requireAuth(c)
	if !ok {
		return
	}

	var req struct {
		To          string  `json:"to" binding:"required"`
		Amount      float64 `json:"amount" binding:"required"`
		Description string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "to and amount are required"})
		return
	}
	if errMsg := validateTransferInput(sender, req.To, req.Amount); errMsg != "" {
		c.JSON(400, gin.H{"error": errMsg})
		return
	}

	tx, ok := beginTx(c, db)
	if !ok {
		return
	}
	defer tx.Rollback()

	senderBalance, ok := queryBalance(c, tx,
		`SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`, sender)
	if !ok {
		return
	}
	if senderBalance < req.Amount {
		c.JSON(400, gin.H{"error": "insufficient balance", "available": senderBalance, "requested": req.Amount})
		return
	}

	if err := executeTransfer(c, tx, sender, req.To, req.Amount); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	desc := req.Description
	if desc == "" {
		desc = fmt.Sprintf("Transfer %.4f GSTD", req.Amount)
	}
	txID := recordTransferTx(c, tx, sender, req.To, req.Amount, desc)

	if !commitTx(c, tx) {
		return
	}

	log.Printf("💸 Transfer: %s → %s: %.4f GSTD", sender[:12], req.To[:min(12, len(req.To))], req.Amount)

	c.JSON(200, gin.H{
		"status":    "completed",
		"tx_id":     txID,
		"from":      sender,
		"to":        req.To,
		"amount":    req.Amount,
		"fee":       0.0,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// validateTransferInput checks transfer request parameters.
func validateTransferInput(sender, to string, amount float64) string {
	switch {
	case amount <= 0:
		return "amount must be positive"
	case amount > 1e9:
		return "amount too large"
	case sender == to:
		return "cannot transfer to yourself"
	default:
		return ""
	}
}

// executeTransfer performs the debit/credit inside an existing tx.
func executeTransfer(c *gin.Context, tx *sql.Tx, sender, to string, amount float64) error {
	ctx := c.Request.Context()

	// Ensure recipient exists
	_, _ = tx.ExecContext(ctx,
		`INSERT INTO users (wallet_address, created_at, updated_at) 
		 VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING`, to)

	// Debit sender
	res, err := tx.ExecContext(ctx,
		`UPDATE users SET gstd_balance = gstd_balance - $1, updated_at = NOW() 
		 WHERE wallet_address = $2 AND gstd_balance >= $1`, amount, sender)
	if err != nil {
		return fmt.Errorf("debit failed")
	}
	rowsAff, _ := res.RowsAffected()
	if rowsAff == 0 {
		return fmt.Errorf("insufficient balance or race condition detected")
	}

	// Credit recipient
	_, err = tx.ExecContext(ctx,
		`UPDATE users SET gstd_balance = gstd_balance + $1, updated_at = NOW() 
		 WHERE wallet_address = $2`, amount, to)
	if err != nil {
		return fmt.Errorf("credit failed")
	}
	return nil
}

// recordTransferTx writes a transfer record and returns the tx ID.
func recordTransferTx(c *gin.Context, tx *sql.Tx, from, to string, amount float64, desc string) string {
	txID := uuid.New().String()[:16]
	_, _ = tx.ExecContext(c.Request.Context(),
		`INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
		 VALUES ($1, $2, $3, $4, 'transfer', $5, NOW())`,
		txID, from, to, amount, desc)
	return txID
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
		doStakingStake(c, db)
	}
}

func doStakingStake(c *gin.Context, db *sql.DB) {
	wallet, ok := requireAuth(c)
	if !ok {
		return
	}

	var req struct {
		Amount   float64 `json:"amount" binding:"required"`
		LockDays int     `json:"lock_days"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "amount is required"})
		return
	}
	if errMsg := validateStakeInput(req.Amount); errMsg != "" {
		c.JSON(400, gin.H{"error": errMsg})
		return
	}

	if req.LockDays <= 0 {
		req.LockDays = 30
	}
	apy := stakingAPY(req.LockDays)
	unlockAt := time.Now().Add(time.Duration(req.LockDays) * 24 * time.Hour)

	tx, ok := beginTx(c, db)
	if !ok {
		return
	}
	defer tx.Rollback()

	available, ok := queryBalance(c, tx,
		`SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`, wallet)
	if !ok {
		return
	}
	if available < req.Amount {
		c.JSON(402, gin.H{"error": "insufficient GSTD balance", "available": available, "requested": req.Amount})
		return
	}

	positionID, txID, err := executeStake(c, tx, wallet, req.Amount, apy, req.LockDays, unlockAt)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if !commitTx(c, tx) {
		return
	}

	var frozen float64
	_ = db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(gstd_frozen, 0) FROM users WHERE wallet_address = $1`, wallet).Scan(&frozen)

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

// validateStakeInput checks stake amount boundaries.
func validateStakeInput(amount float64) string {
	switch {
	case amount < 1.0:
		return "minimum stake is 1 GSTD"
	case amount > 1e9:
		return "amount too large"
	default:
		return ""
	}
}

// executeStake locks funds, records the position, and returns IDs.
func executeStake(c *gin.Context, tx *sql.Tx, wallet string, amount, apy float64, lockDays int, unlockAt time.Time) (positionID, txID string, err error) {
	ctx := c.Request.Context()

	res, execErr := tx.ExecContext(ctx,
		`UPDATE users SET 
			gstd_balance = gstd_balance - $1,
			gstd_frozen = COALESCE(gstd_frozen, 0) + $1,
			updated_at = NOW()
		 WHERE wallet_address = $2 AND gstd_balance >= $1`, amount, wallet)
	if execErr != nil {
		return "", "", fmt.Errorf("stake operation failed")
	}
	rowsAff, _ := res.RowsAffected()
	if rowsAff == 0 {
		return "", "", fmt.Errorf("insufficient balance or race condition detected during staking")
	}

	positionID = uuid.New().String()[:16]
	_, _ = tx.ExecContext(ctx,
		`INSERT INTO staking_positions (id, wallet_address, amount, apy, lock_days, unlock_at, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
		 ON CONFLICT DO NOTHING`,
		positionID, wallet, amount, apy, lockDays, unlockAt)

	txID = uuid.New().String()[:16]
	_, _ = tx.ExecContext(ctx,
		`INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
		 VALUES ($1, $2, $2, $3, 'stake', $4, NOW())`,
		txID, wallet, amount, fmt.Sprintf("Staked %.2f GSTD for %d days at %.0f%% APY", amount, lockDays, apy))

	return positionID, txID, nil
}

// POST /staking/unstake — unlock staked GSTD
func stakingUnstake(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		doStakingUnstake(c, db)
	}
}

func doStakingUnstake(c *gin.Context, db *sql.DB) {
	wallet, ok := requireAuth(c)
	if !ok {
		return
	}

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

	tx, ok := beginTx(c, db)
	if !ok {
		return
	}
	defer tx.Rollback()

	frozen, ok := queryBalance(c, tx,
		`SELECT COALESCE(gstd_frozen, 0) FROM users WHERE wallet_address = $1`, wallet)
	if !ok {
		return
	}
	if frozen < req.Amount {
		c.JSON(400, gin.H{"error": "insufficient staked balance", "staked": frozen, "requested": req.Amount})
		return
	}

	txID, err := executeUnstake(c, tx, wallet, req.Amount)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if !commitTx(c, tx) {
		return
	}

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

// executeUnstake unfreezes tokens and records the ledger entry.
func executeUnstake(c *gin.Context, tx *sql.Tx, wallet string, amount float64) (string, error) {
	ctx := c.Request.Context()

	res, err := tx.ExecContext(ctx,
		`UPDATE users SET 
			gstd_frozen = gstd_frozen - $1,
			gstd_balance = gstd_balance + $1,
			updated_at = NOW()
		 WHERE wallet_address = $2 AND gstd_frozen >= $1`, amount, wallet)
	if err != nil {
		return "", fmt.Errorf("unstake operation failed")
	}
	rowsAff, _ := res.RowsAffected()
	if rowsAff == 0 {
		return "", fmt.Errorf("insufficient staked balance during unstaking")
	}

	txID := uuid.New().String()[:16]
	_, _ = tx.ExecContext(ctx,
		`INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
		 VALUES ($1, $2, $2, $3, 'unstake', 'Unstaked GSTD', NOW())`,
		txID, wallet, amount)

	return txID, nil
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
		var userAPY float64 = 8.0 // Default (Flex tier)
		if wallet != "" {
			_ = db.QueryRowContext(c.Request.Context(),
				`SELECT COALESCE(gstd_frozen, 0), COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`,
				wallet).Scan(&staked, &balance)

			// Get the best APY from active staking positions
			var maxAPY sql.NullFloat64
			_ = db.QueryRowContext(c.Request.Context(),
				`SELECT MAX(apy) FROM staking_positions WHERE wallet_address = $1 AND status = 'active'`,
				wallet).Scan(&maxAPY)
			if maxAPY.Valid && maxAPY.Float64 > 0 {
				userAPY = maxAPY.Float64
			} else if staked > 0 {
				// Fallback: estimate from amount (flex tier)
				userAPY = 8.0
			}
		}

		// Platform-wide staking stats
		var totalStaked float64
		var stakerCount int
		_ = db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(gstd_frozen), 0), COUNT(*) FROM users WHERE gstd_frozen > 0`).Scan(&totalStaked, &stakerCount)

		dailyRate := userAPY / 365.0 / 100.0
		dailyReward := staked * dailyRate
		monthlyReward := staked * userAPY / 12.0 / 100.0

		c.JSON(200, gin.H{
			"wallet": gin.H{
				"address":        wallet,
				"staked":         staked,
				"available":      balance,
				"apy":            userAPY,
				"daily_reward":   math.Round(dailyReward*10000) / 10000,
				"monthly_reward": math.Round(monthlyReward*10000) / 10000,
			},
			"platform": gin.H{
				"total_staked": totalStaked,
				"staker_count": stakerCount,
				"min_stake":    1.0,
				"reward_token": "GSTD",
			},
			"tiers": []gin.H{
				{"name": "Flex", "lock_days": 30, "apy": 8, "benefits": "Basic staking rewards, flexible unlock"},
				{"name": "Silver", "lock_days": 90, "apy": 15, "benefits": "Staking + fee discount 10%"},
				{"name": "Gold", "lock_days": 180, "apy": 24, "benefits": "Staking + fee discount 25% + priority tasks"},
				{"name": "Diamond", "lock_days": 365, "apy": 36, "benefits": "Staking + fee discount 50% + Ultra AI access"},
			},
		})
	}
}

// GET /wallet/history — transaction history for a wallet
func walletHistory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		addr, ok := requireAuth(c)
		if !ok {
			return
		}

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
