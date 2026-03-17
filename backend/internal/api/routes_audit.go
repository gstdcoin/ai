package api

import (
	"context"
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// getReservesAudit returns public verification of gold reserves vs tokens (ТЗ: Night Audit).
// GET /api/v1/audit/reserves — публичная проверка соответствия золотых резервов количеству токенов.
func getReservesAudit(db *sql.DB, tonService *services.TONService, tonConfig config.TONConfig, poolMonitor *services.PoolMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic in getReservesAudit: %v", r)
				c.JSON(200, gin.H{
					"gold_reserve_xaut": 0.0,
					"circulating_gstd":  0.0,
					"reserve_ratio":     0.0,
					"audit_timestamp":   nil,
					"status":            "error",
					"message":           "Audit temporarily unavailable",
				})
			}
		}()

		ctx := context.Background()

		// 1. Gold reserve (XAUt) from treasury
		treasuryWallet := tonConfig.TreasuryWallet
		if treasuryWallet == "" {
			treasuryWallet = tonConfig.AdminWallet
		}
		if treasuryWallet == "" {
			treasuryWallet = "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
		}

		var goldReserveXAUt float64
		if tonService != nil && tonConfig.XAUtJettonAddress != "" {
			balance, err := tonService.GetJettonBalance(ctx, treasuryWallet, tonConfig.XAUtJettonAddress)
			if err != nil {
				log.Printf("getReservesAudit: XAUt fetch error: %v", err)
			} else {
				goldReserveXAUt = balance
			}
		}

		// 2. Platform gold_reserve balance (GSTD) from DB
		var goldReserveGSTD float64
		_ = db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd, 0) FROM platform_funds WHERE fund_type = 'gold_reserve'`).Scan(&goldReserveGSTD)

		// 3. Circulating GSTD: sum of user balances + escrow (approximation)
		var circulatingGSTD float64
		_ = db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(COALESCE(gstd_balance, 0) + COALESCE(gstd_escrow_balance, 0)), 0) FROM users
		`).Scan(&circulatingGSTD)

		// 4. Total supply reference (1B from ТЗ)
		const totalSupplyGSTD = 21_000_000.0
		reserveRatio := 0.0
		if circulatingGSTD > 0 && goldReserveXAUt > 0 && poolMonitor != nil {
			goldValueUSD := goldReserveXAUt * 3200
			if goldPrice := poolMonitor.GetXAUtPriceUSD(); goldPrice > 0 {
				goldValueUSD = goldReserveXAUt * goldPrice
			}
			if gstdPriceUSD, err := poolMonitor.GetGSTDPriceUSD(ctx); err == nil && gstdPriceUSD > 0 {
				reserveRatio = goldValueUSD / (circulatingGSTD * gstdPriceUSD)
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"gold_reserve_xaut": goldReserveXAUt,
			"gold_reserve_gstd": goldReserveGSTD,
			"circulating_gstd":  circulatingGSTD,
			"total_supply_gstd": totalSupplyGSTD,
			"reserve_ratio":     reserveRatio,
			"audit_timestamp":   time.Now().UTC().Format(time.RFC3339),
			"status":            "ok",
			"message":           "Night Audit: Gold reserves vs tokens verification",
		})
	}
}
