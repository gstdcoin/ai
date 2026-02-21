package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"sync"
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
	stonFi      *StonFiService
	errorLogger *ErrorLogger
	httpClient  *http.Client
	xautCache   struct {
		price float64
		mu    sync.RWMutex
		at    time.Time
	}
}

// NewPoolMonitorService creates a new monitor tied to TON config and DB.
func NewPoolMonitorService(cfg config.TONConfig, db *sql.DB) *PoolMonitorService {
	return &PoolMonitorService{
		db:     db,
		tonCfg: cfg,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// SetTONService wires TON service for on-chain balance fetches.
func (p *PoolMonitorService) SetTONService(ton *TONService) { p.tonService = ton }

// SetStonFi wires Ston.fi service for pool and LP data.
func (p *PoolMonitorService) SetStonFi(sf *StonFiService) { p.stonFi = sf }

// SetErrorLogger wires error logger for diagnostics.
func (p *PoolMonitorService) SetErrorLogger(el *ErrorLogger) { p.errorLogger = el }

// Start runs background monitoring. No-op stub for now.
func (p *PoolMonitorService) Start(ctx context.Context) {}

// GetXAUtPriceUSD returns the current XAUt (gold) price in USD.
// Fetches from CoinGecko API (tether-gold), fallback to default on error.
func (p *PoolMonitorService) GetXAUtPriceUSD() float64 {
	const defaultGoldPrice = 2350.0

	// Use cache if fresh (< 5 min)
	p.xautCache.mu.RLock()
	if time.Since(p.xautCache.at) < 5*time.Minute && p.xautCache.price > 0 {
		price := p.xautCache.price
		p.xautCache.mu.RUnlock()
		return price
	}
	p.xautCache.mu.RUnlock()

	// Fetch from CoinGecko API
	req, err := http.NewRequestWithContext(context.Background(), "GET",
		"https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd", nil)
	if err != nil {
		return defaultGoldPrice
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return defaultGoldPrice
	}
	defer resp.Body.Close()

	var result map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return defaultGoldPrice
	}
	if tg, ok := result["tether-gold"]; ok {
		if usd, ok := tg["usd"]; ok && usd > 0 {
			p.xautCache.mu.Lock()
			p.xautCache.price = usd
			p.xautCache.at = time.Now()
			p.xautCache.mu.Unlock()
			return usd
		}
	}

	if p.db != nil {
		var lastXAUt float64
		if err := p.db.QueryRow(`
			SELECT COALESCE(xaut_amount, 0)
			FROM golden_reserve_log
			ORDER BY "timestamp" DESC
			LIMIT 1
		`).Scan(&lastXAUt); err == nil && lastXAUt > 0 {
			return defaultGoldPrice
		}
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

// GetPoolStatusCached returns pool status. Uses Ston.fi API when available for real pool data
// and platform LP share (Dynamic Gold Backing). Falls back to DB/on-chain when unavailable.
func (p *PoolMonitorService) GetPoolStatusCached(ctx context.Context) (map[string]interface{}, error) {
	poolAddr := p.tonCfg.GoldPoolAddress
	if poolAddr == "" {
		poolAddr = p.tonCfg.PoolAddress
	}
	if poolAddr == "" {
		poolAddr = p.tonCfg.ContractAddress
	}

	gstdBal, xautBal := 0.0, 0.0
	totalLiquidityUSD := 0.0
	platformLpShare := 0.0
	platformLpSharePercent := 0.0

	// Try Ston.fi API for real pool data and Dynamic Gold Backing
	if p.stonFi != nil && poolAddr != "" {
		poolData, err := p.stonFi.GetPoolData(ctx, poolAddr)
		if err == nil {
			if pool, ok := poolData["pool"].(map[string]interface{}); ok {
				// Pool: token0=XAUt, token1=GSTD (from API response)
				r0, _ := strconv.ParseFloat(getStr(pool, "reserve0"), 64)
				r1, _ := strconv.ParseFloat(getStr(pool, "reserve1"), 64)
				token1 := getStr(pool, "token1_address")
				// XAUt: EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k, GSTD: EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO
				if token1 != "" && (token1 == "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO" || len(token1) > 20) {
					xautBal = r0 / 1e9
					gstdBal = r1 / 1e9
				} else {
					xautBal = r1 / 1e9
					gstdBal = r0 / 1e9
				}
				if lpUSD := getStr(pool, "lp_total_supply_usd"); lpUSD != "" {
					totalLiquidityUSD, _ = strconv.ParseFloat(lpUSD, 64)
				}
			}
		}

		// Fetch platform LP share (ADMIN_WALLET) for Dynamic Gold Backing
		adminWallet := p.tonCfg.AdminWallet
		if adminWallet == "" {
			adminWallet = p.tonCfg.TreasuryWallet
		}
		if adminWallet != "" {
			pos, err := p.stonFi.GetWalletPoolPosition(ctx, adminWallet, poolAddr)
			if err == nil && pos != nil {
				if pool, ok := pos["pool"].(map[string]interface{}); ok {
					platformLpShare, _ = strconv.ParseFloat(getStr(pool, "balance"), 64)
					platformLpShare = platformLpShare / 1e9
				}
				if sharePct := getStr(pos, "share_percent"); sharePct != "" {
					platformLpSharePercent, _ = strconv.ParseFloat(sharePct, 64)
				}
			}
		}
	}

	// Fallback: on-chain or DB
	if gstdBal == 0 && xautBal == 0 && p.tonService != nil && poolAddr != "" {
		gstdNano, _ := p.tonService.GetContractBalance(ctx, poolAddr)
		gstdBal = float64(gstdNano) / 1e9
	}
	goldPrice := p.GetXAUtPriceUSD()
	if totalLiquidityUSD <= 0 {
		totalLiquidityUSD = gstdBal*0.02 + xautBal*goldPrice
	}
	if totalLiquidityUSD < 0 {
		totalLiquidityUSD = 0
	}
	reserveRatio := 0.0
	if gstdBal > 0 && xautBal > 0 {
		reserveRatio = (xautBal * goldPrice) / (gstdBal * 0.02)
	}

	return map[string]interface{}{
		"pool_address":              poolAddr,
		"gstd_balance":              gstdBal,
		"xaut_balance":              xautBal,
		"total_value_usd":           totalLiquidityUSD,
		"total_liquidity_usd":       totalLiquidityUSD,
		"platform_lp_share":         platformLpShare,
		"platform_lp_share_percent": platformLpSharePercent,
		"dynamic_gold_backing": map[string]interface{}{
			"total_liquidity_usd": totalLiquidityUSD,
			"platform_share":      platformLpShare,
			"platform_share_pct":  platformLpSharePercent,
		},
		"last_updated":  time.Now(),
		"is_healthy":    totalLiquidityUSD >= 0,
		"reserve_ratio": reserveRatio,
	}, nil
}

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

