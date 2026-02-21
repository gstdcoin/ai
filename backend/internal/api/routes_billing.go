package api

import (
	"net/http"
	"strconv"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SetupBillingRoutes registers Financial API endpoints
func SetupBillingRoutes(v1 *gin.RouterGroup, billing *services.BillingService) {
	if billing == nil {
		return
	}

	v1.GET("/billing/balance/:wallet", func(c *gin.Context) {
		wallet := c.Param("wallet")
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet required"})
			return
		}

		balance, err := billing.GetWalletBalance(c.Request.Context(), wallet)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, balance)
	})

	// Escrow 2.0: Golden Gateway — recent transactions for TMA
	v1.GET("/billing/transactions/:wallet", func(c *gin.Context) {
		wallet := c.Param("wallet")
		if wallet == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "wallet required"})
			return
		}
		limit := 30
		if l := c.Query("limit"); l != "" {
			if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
				limit = n
			}
		}

		txs, err := billing.GetWalletTransactions(c.Request.Context(), wallet, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if txs == nil {
			txs = []services.TransactionRecord{}
		}
		c.JSON(http.StatusOK, gin.H{"transactions": txs})
	})
}
