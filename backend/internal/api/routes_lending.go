package api

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

const (
	lendingWalletHeader   = "X-Wallet-Address"
	lendingErrWallet      = "wallet address required"
	lendingErrAmount      = "invalid amount"
	lendingRateLimit      = 10  // max ops per wallet per window
	lendingRateWindowSecs = 60  // rate limit window in seconds
)

// ═══════════════════════════════════════════════════════════════
// LENDING API HANDLER — Gold-Backed Credit Lines
//
// Routes:
//   GET  /api/v1/lending/vault          — Get/create user vault
//   POST /api/v1/lending/deposit        — Deposit GSTD collateral
//   POST /api/v1/lending/borrow         — Borrow against collateral
//   POST /api/v1/lending/repay          — Repay loan
//   POST /api/v1/lending/withdraw       — Withdraw excess collateral
//   GET  /api/v1/lending/transactions   — Transaction history
//   GET  /api/v1/lending/stats          — Global lending stats
//   GET  /api/v1/lending/config         — Lending parameters
// ═══════════════════════════════════════════════════════════════

type LendingHandler struct {
	lending *services.LendingService
}

func NewLendingHandler(lending *services.LendingService) *LendingHandler {
	return &LendingHandler{lending: lending}
}

// ═══ Per-Wallet Rate Limiter ═══

type walletBucket struct {
	count    int
	resetAt  time.Time
}

var (
	walletBuckets   = make(map[string]*walletBucket)
	walletBucketsMu sync.Mutex
)

func lendingRateLimiter() gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetHeader(lendingWalletHeader)
		if wallet == "" {
			c.Next()
			return
		}

		walletBucketsMu.Lock()
		b, ok := walletBuckets[wallet]
		now := time.Now()
		if !ok || now.After(b.resetAt) {
			b = &walletBucket{count: 0, resetAt: now.Add(time.Duration(lendingRateWindowSecs) * time.Second)}
			walletBuckets[wallet] = b
		}
		b.count++
		exceeded := b.count > lendingRateLimit
		walletBucketsMu.Unlock()

		if exceeded {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate limit exceeded",
				"retry_after": lendingRateWindowSecs,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

func (h *LendingHandler) getWallet(c *gin.Context) string {
	return c.GetHeader(lendingWalletHeader)
}

func (h *LendingHandler) readAmount(c *gin.Context) (float64, bool) {
	var req struct {
		Amount float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": lendingErrAmount})
		return 0, false
	}
	return req.Amount, true
}

func (h *LendingHandler) HandleGetVault(c *gin.Context) {
	wallet := h.getWallet(c)
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": lendingErrWallet})
		return
	}
	vault, err := h.lending.GetOrCreateVault(c.Request.Context(), wallet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vault)
}

func (h *LendingHandler) HandleDeposit(c *gin.Context) {
	wallet := h.getWallet(c)
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": lendingErrWallet})
		return
	}
	amount, ok := h.readAmount(c)
	if !ok {
		return
	}
	vault, err := h.lending.DepositCollateral(c.Request.Context(), wallet, amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vault)
}

func (h *LendingHandler) HandleBorrow(c *gin.Context) {
	wallet := h.getWallet(c)
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": lendingErrWallet})
		return
	}
	amount, ok := h.readAmount(c)
	if !ok {
		return
	}
	vault, err := h.lending.Borrow(c.Request.Context(), wallet, amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vault)
}

func (h *LendingHandler) HandleRepay(c *gin.Context) {
	wallet := h.getWallet(c)
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": lendingErrWallet})
		return
	}
	amount, ok := h.readAmount(c)
	if !ok {
		return
	}
	vault, err := h.lending.Repay(c.Request.Context(), wallet, amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vault)
}

func (h *LendingHandler) HandleWithdraw(c *gin.Context) {
	wallet := h.getWallet(c)
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": lendingErrWallet})
		return
	}
	amount, ok := h.readAmount(c)
	if !ok {
		return
	}
	vault, err := h.lending.Withdraw(c.Request.Context(), wallet, amount)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vault)
}

func (h *LendingHandler) HandleTransactions(c *gin.Context) {
	wallet := h.getWallet(c)
	if wallet == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": lendingErrWallet})
		return
	}
	limit := 20
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	txs, err := h.lending.GetTransactions(c.Request.Context(), wallet, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if txs == nil {
		txs = []services.LendingTransaction{}
	}
	c.JSON(http.StatusOK, txs)
}

func (h *LendingHandler) HandleStats(c *gin.Context) {
	stats, err := h.lending.GetStats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

func (h *LendingHandler) HandleConfig(c *gin.Context) {
	cfg, err := h.lending.GetConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *LendingHandler) HandleRiskyVaults(c *gin.Context) {
	threshold := 1.5
	if t := c.Query("threshold"); t != "" {
		if n, err := strconv.ParseFloat(t, 64); err == nil {
			threshold = n
		}
	}
	vaults, err := h.lending.GetRiskyVaults(c.Request.Context(), threshold)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if vaults == nil {
		vaults = []services.RiskyVault{}
	}
	c.JSON(http.StatusOK, gin.H{
		"count":  len(vaults),
		"vaults": vaults,
	})
}

func (h *LendingHandler) HandleOracleStatus(c *gin.Context) {
	status := h.lending.GetOracleStatus()
	c.JSON(http.StatusOK, status)
}

// SetupLendingRoutes registers all lending endpoints under /api/v1/lending
func SetupLendingRoutes(rg *gin.RouterGroup, lending *services.LendingService) {
	if lending == nil {
		return
	}
	h := NewLendingHandler(lending)
	lg := rg.Group("/lending")
	lg.Use(lendingRateLimiter())
	{
		// Public (no wallet needed)
		lg.GET("/stats", h.HandleStats)
		lg.GET("/config", h.HandleConfig)
		lg.GET("/risky-vaults", h.HandleRiskyVaults)
		lg.GET("/oracle-status", h.HandleOracleStatus)

		// Wallet-required
		lg.GET("/vault", h.HandleGetVault)
		lg.POST("/deposit", h.HandleDeposit)
		lg.POST("/borrow", h.HandleBorrow)
		lg.POST("/repay", h.HandleRepay)
		lg.POST("/withdraw", h.HandleWithdraw)
		lg.GET("/transactions", h.HandleTransactions)
	}
}
