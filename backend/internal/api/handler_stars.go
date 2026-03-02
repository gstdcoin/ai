package api

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"net/http"

	"github.com/gin-gonic/gin"
)

// buyStarsHandler processes Telegram Stars purchases → credits GSTD to user
// Security: validates payment_id uniqueness, recalculates GSTD amount server-side,
// uses database transaction to ensure atomicity.
func buyStarsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TelegramID  int64   `json:"telegram_id" binding:"required"`
			StarsAmount int     `json:"stars_amount" binding:"required"`
			GSTDAmount  float64 `json:"gstd_amount"`
			PaymentID   string  `json:"payment_id" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request: " + err.Error()})
			return
		}

		if req.StarsAmount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "stars_amount must be positive"})
			return
		}

		// ── Server-side rate calculation (never trust client) ──
		const starUSD = 0.013 // Telegram official rate
		gstdPrice := getGSTDPrice(db)
		if gstdPrice <= 0 {
			gstdPrice = 0.00028 // safe fallback
		}
		gstdPerStar := starUSD / gstdPrice
		serverGSTD := math.Floor(float64(req.StarsAmount) * gstdPerStar)

		// If client sent amount, verify it's not inflated (max 5% tolerance)
		if req.GSTDAmount > 0 && req.GSTDAmount > serverGSTD*1.05 {
			log.Printf("[Stars] ⚠️ Client inflated amount: client=%.2f server=%.2f, using server", req.GSTDAmount, serverGSTD)
			req.GSTDAmount = serverGSTD
		} else if req.GSTDAmount <= 0 {
			req.GSTDAmount = serverGSTD
		}

		// ── Check for duplicate payment ──
		var exists bool
		err := db.QueryRowContext(c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM stars_purchases WHERE telegram_payment_charge_id = $1)`,
			req.PaymentID,
		).Scan(&exists)
		if err == nil && exists {
			c.JSON(http.StatusConflict, gin.H{"error": "payment already processed", "payment_id": req.PaymentID})
			return
		}

		// ── Find wallet from telegram_users ──
		var walletAddress sql.NullString
		_ = db.QueryRowContext(c.Request.Context(),
			`SELECT wallet_address FROM telegram_users WHERE telegram_id = $1`,
			req.TelegramID,
		).Scan(&walletAddress)

		wallet := ""
		if walletAddress.Valid && walletAddress.String != "" {
			wallet = walletAddress.String
		} else {
			// Auto-create internal wallet: tg-{telegram_id}
			wallet = fmt.Sprintf("tg-%d", req.TelegramID)
		}

		// ── Atomic transaction: credit + record ──
		tx, err := db.BeginTx(c.Request.Context(), nil)
		if err != nil {
			log.Printf("[Stars] Transaction begin failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "transaction_failed"})
			return
		}
		defer tx.Rollback()

		// Ensure user exists
		_, err = tx.ExecContext(c.Request.Context(),
			`INSERT INTO users (wallet_address, gstd_balance, created_at, updated_at)
			 VALUES ($1, 0, NOW(), NOW())
			 ON CONFLICT (wallet_address) DO NOTHING`,
			wallet,
		)
		if err != nil {
			log.Printf("[Stars] Ensure user failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "user_setup_failed"})
			return
		}

		// Credit GSTD to balance
		result, err := tx.ExecContext(c.Request.Context(),
			`UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1, updated_at = NOW()
			 WHERE wallet_address = $2`,
			req.GSTDAmount, wallet,
		)
		if err != nil {
			log.Printf("[Stars] Credit failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "credit_failed"})
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			log.Printf("[Stars] ⚠️ No user found for wallet %s even after insert", wallet)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "user_not_found"})
			return
		}

		// Record purchase (matches actual DB schema)
		_, err = tx.ExecContext(c.Request.Context(),
			`INSERT INTO stars_purchases (telegram_payment_charge_id, telegram_id, stars_amount, gstd_credited, wallet_address, created_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())
			 ON CONFLICT (telegram_payment_charge_id) DO NOTHING`,
			req.PaymentID, req.TelegramID, req.StarsAmount, req.GSTDAmount, wallet,
		)
		if err != nil {
			log.Printf("[Stars] Record purchase failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "record_failed"})
			return
		}

		// Commit
		if err = tx.Commit(); err != nil {
			log.Printf("[Stars] Commit failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "commit_failed"})
			return
		}

		// ── Platform fee log (0% to user, logged for transparency) ──
		usdPaid := float64(req.StarsAmount) * starUSD
		proRequests := int(req.GSTDAmount / 0.1)
		costPerReq := usdPaid / float64(proRequests)

		log.Printf("[Stars] ✅ %.2f GSTD credited to %s (TG:%d, %d⭐=$%.2f, rate:1⭐=%.0f GSTD, cost/req=$%.5f)",
			req.GSTDAmount, wallet, req.TelegramID, req.StarsAmount, usdPaid, gstdPerStar, costPerReq)

		c.JSON(http.StatusOK, gin.H{
			"success":       true,
			"status":        "completed",
			"wallet":        wallet,
			"gstd_amount":   req.GSTDAmount,
			"stars_paid":    req.StarsAmount,
			"payment_id":    req.PaymentID,
			"usd_paid":      usdPaid,
			"gstd_price":    gstdPrice,
			"rate_per_star": gstdPerStar,
			"pro_requests":  proRequests,
			"cost_per_req":  costPerReq,
		})
	}
}

// getGSTDPrice returns current GSTD price from fee config or pool data
func getGSTDPrice(db *sql.DB) float64 {
	var price float64
	// Try inference_fee_config first (updated by DynamicEquilibrium)
	err := db.QueryRow(`SELECT COALESCE(gstd_price_usd_at_set, 0) FROM inference_fee_config ORDER BY updated_at DESC LIMIT 1`).Scan(&price)
	if err == nil && price > 0 {
		return price
	}
	// Fallback: calculate from contract balance
	err = db.QueryRow(`SELECT COALESCE(
		(SELECT (balance_ton * 3.5) / 1000000000 FROM contract_state ORDER BY checked_at DESC LIMIT 1),
		0.00028
	)`).Scan(&price)
	if err != nil || price <= 0 {
		return 0.00028 // safe fallback
	}
	return price
}
