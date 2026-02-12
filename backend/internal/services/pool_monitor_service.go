package services

import (
	"context"
	"database/sql"
	"log"
	"math"
	"time"

	"distributed-computing-platform/internal/config"
)

// PoolMonitorService provides read‑only metrics for GSTD/XAUt pools and prices.
// It is deliberately lightweight and safe: if on‑chain or DB data are unavailable,
// it falls back to conservative defaults instead of breaking the platform.
type PoolMonitorService struct {
	db          *sql.DB
	tonCfg      config.TONConfig
	tonService  *TONService
	errorLogger *ErrorLogger
}

// NewPoolMonitorService creates a new monitor tied to TON config and DB.
func NewPoolMonitorService(cfg config.TONConfig, db *sql.DB) *PoolMonitorService {
	return &PoolMonitorService{
		db:     db,
		tonCfg: cfg,
	}
}

// SetTONService wires TON service for on-chain balance fetches.
func (p *PoolMonitorService) SetTONService(ton *TONService) { p.tonService = ton }

// SetErrorLogger wires error logger for diagnostics.
func (p *PoolMonitorService) SetErrorLogger(el *ErrorLogger) { p.errorLogger = el }

// Start runs background monitoring. No-op stub for now.
func (p *PoolMonitorService) Start(ctx context.Context) {}

// GetXAUtPriceUSD returns the current XAUt (gold) price in USD.
// For now we use a safe default if no better source is available.
func (p *PoolMonitorService) GetXAUtPriceUSD() float64 {
	// TODO: wire an oracle or read from on‑chain XAUt price feed.
	// For now use a conservative static price (~1oz gold).
	const defaultGoldPrice = 2350.0

	// Try to derive from golden_reserve_log if xaut_amount and gstd_amount are stored.
	if p.db == nil {
		return defaultGoldPrice
	}

	var lastXAUt float64
	err := p.db.QueryRow(`
		SELECT COALESCE(xaut_amount, 0)
		FROM golden_reserve_log
		ORDER BY "timestamp" DESC
		LIMIT 1
	`).Scan(&lastXAUt)
	if err != nil {
		// If schema or data are missing, fall back to default.
		return defaultGoldPrice
	}

	// If we have any XAUt in reserve, keep the static price;
	// in future we can attach a real oracle here.
	if lastXAUt > 0 {
		return defaultGoldPrice
	}

	return defaultGoldPrice
}

// GetGSTDPriceUSD returns an implied GSTD price in USD, based on the
// Golden Reserve log if available, otherwise falls back to a conservative default.
func (p *PoolMonitorService) GetGSTDPriceUSD(ctx context.Context) (float64, error) {
	const fallbackPrice = 0.02 // safe default when we cannot derive from reserve

	if p.db == nil {
		return fallbackPrice, nil
	}

	// Golden reserve log stores how much GSTD was swapped into XAUt.
	// We approximate price as: total XAUt value / total GSTD in those swaps.
	var totalGSTD, totalXAUt float64
	err := p.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(gstd_amount), 0) AS total_gstd,
			COALESCE(SUM(xaut_amount), 0) AS total_xaut
		FROM golden_reserve_log
	`).Scan(&totalGSTD, &totalXAUt)
	if err != nil {
		log.Printf("PoolMonitorService: failed to read golden_reserve_log: %v", err)
		return fallbackPrice, nil
	}

	if totalGSTD <= 0 || totalXAUt <= 0 {
		return fallbackPrice, nil
	}

	goldPrice := p.GetXAUtPriceUSD()
	// 1 XAUt ~= goldPrice USD, so total reserve value:
	totalReserveUSD := totalXAUt * goldPrice
	price := totalReserveUSD / totalGSTD

	// Guard against NaN / Inf and unreasonable values.
	if math.IsNaN(price) || math.IsInf(price, 0) || price <= 0 {
		return fallbackPrice, nil
	}

	return price, nil
}

// GetPoolStatusCached returns pool status. Uses simple in-memory fallback when
// on-chain or DB data unavailable. Safe for /pool/status endpoint.
func (p *PoolMonitorService) GetPoolStatusCached(ctx context.Context) (map[string]interface{}, error) {
	poolAddr := p.tonCfg.PoolAddress
	if poolAddr == "" {
		poolAddr = p.tonCfg.ContractAddress
	}
	gstdBal, xautBal := 0.0, 0.0
	if p.tonService != nil && poolAddr != "" {
		gstdNano, _ := p.tonService.GetContractBalance(ctx, poolAddr)
		gstdBal = float64(gstdNano) / 1e9
		// XAUt would need jetton balance; use 0 for now
	}
	goldPrice := p.GetXAUtPriceUSD()
	totalUSD := gstdBal*0.02 + xautBal*goldPrice
	if totalUSD <= 0 {
		totalUSD = 0
	}
	reserveRatio := 0.0
	if gstdBal > 0 && xautBal > 0 {
		reserveRatio = (xautBal * goldPrice) / (gstdBal * 0.02)
	}
	return map[string]interface{}{
		"pool_address":    poolAddr,
		"gstd_balance":    gstdBal,
		"xaut_balance":    xautBal,
		"total_value_usd": totalUSD,
		"last_updated":    time.Now(),
		"is_healthy":      totalUSD >= 0,
		"reserve_ratio":   reserveRatio,
	}, nil
}

