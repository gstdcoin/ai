package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// buyStarsHandler processes Telegram Stars purchases → credits GSTD to user's wallet
func buyStarsHandler(db *sql.DB, bonusService *services.WelcomeBonusService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TelegramID  int64   `json:"telegram_id" binding:"required"`
			StarsAmount int     `json:"stars_amount" binding:"required"`
			GSTDAmount  float64 `json:"gstd_amount" binding:"required"`
			PaymentID   string  `json:"payment_id" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request: " + err.Error()})
			return
		}

		// Validate amounts
		if req.StarsAmount <= 0 || req.GSTDAmount <= 0 {
			c.JSON(400, gin.H{"error": "amounts must be positive"})
			return
		}

		// Check for duplicate payment
		var exists bool
		err := db.QueryRowContext(c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM stars_purchases WHERE payment_id = $1)`,
			req.PaymentID,
		).Scan(&exists)
		if err == nil && exists {
			c.JSON(409, gin.H{"error": "payment already processed"})
			return
		}

		// Look up user's linked wallet
		var walletAddress string
		err = db.QueryRowContext(c.Request.Context(),
			`SELECT wallet_address FROM telegram_links WHERE telegram_id = $1`,
			req.TelegramID,
		).Scan(&walletAddress)
		if err != nil {
			// Create a pending credit if wallet not linked yet
			log.Printf("[Stars] No wallet linked for TG ID %d, creating pending credit", req.TelegramID)

			// Store pending credit
			_, err = db.ExecContext(c.Request.Context(),
				`INSERT INTO stars_purchases (telegram_id, stars_amount, gstd_amount, payment_id, status, created_at)
				 VALUES ($1, $2, $3, $4, 'pending', NOW())
				 ON CONFLICT (payment_id) DO NOTHING`,
				req.TelegramID, req.StarsAmount, req.GSTDAmount, req.PaymentID,
			)
			if err != nil {
				log.Printf("[Stars] Failed to store pending credit: %v", err)
			}

			c.JSON(200, gin.H{
				"success":     true,
				"status":      "pending",
				"message":     "Tokens will be credited when wallet is linked",
				"gstd_amount": req.GSTDAmount,
			})
			return
		}

		// Credit GSTD to user's balance
		_, err = db.ExecContext(c.Request.Context(),
			`UPDATE users SET gstd_balance = gstd_balance + $1, updated_at = NOW()
			 WHERE wallet_address = $2`,
			req.GSTDAmount, walletAddress,
		)
		if err != nil {
			log.Printf("[Stars] Failed to credit balance: %v", err)
			c.JSON(500, gin.H{"error": "failed to credit tokens"})
			return
		}

		// Record the purchase
		_, err = db.ExecContext(c.Request.Context(),
			`INSERT INTO stars_purchases (telegram_id, wallet_address, stars_amount, gstd_amount, payment_id, status, created_at)
			 VALUES ($1, $2, $3, $4, 'completed', $5)
			 ON CONFLICT (payment_id) DO NOTHING`,
			req.TelegramID, walletAddress, req.StarsAmount, req.GSTDAmount, req.PaymentID, time.Now(),
		)
		if err != nil {
			log.Printf("[Stars] Failed to record purchase: %v", err)
			// Don't fail — tokens already credited
		}

		log.Printf("[Stars] ✅ %f GSTD credited to %s (TG: %d, Stars: %d, Payment: %s)",
			req.GSTDAmount, walletAddress, req.TelegramID, req.StarsAmount, req.PaymentID)

		c.JSON(200, gin.H{
			"success":     true,
			"status":      "completed",
			"wallet":      walletAddress,
			"gstd_amount": req.GSTDAmount,
			"stars_paid":  req.StarsAmount,
			"payment_id":  req.PaymentID,
		})
	}
}
