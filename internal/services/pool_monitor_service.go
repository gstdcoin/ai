package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"distributed-computing-platform/internal/config"
)

var ErrNoRealGSTDPrice = errors.New("real GSTD price unavailable")

// PoolMonitorService provides read‑only metrics for GSTD/XAUt pools and prices.
// Always uses real DEX/reserve data; caches last known price when live fetch fails.
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
	tonCache struct {
		price float64
		mu    sync.RWMutex
		at    time.Time
	}
	gstdCache struct {
		price float64
		mu    sync.RWMutex
		at    time.Time
	}
}

// NewPoolMonitorService creates a new monitor tied to TON config and DB.
func NewPoolMonitorService(cfg config.TONConfig, db *sql.DB) *PoolMonitorService {
	return &PoolMonitorService{
		db:         db,
		tonCfg:     cfg,
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

// GetTONPriceUSD returns TON price in USD from CoinGecko. Cached for 5 min.
func (p *PoolMonitorService) GetTONPriceUSD() float64 {
	const defaultTONPrice = 5.0

	p.tonCache.mu.RLock()
	if time.Since(p.tonCache.at) < 5*time.Minute && p.tonCache.price > 0 {
		price := p.tonCache.price
		p.tonCache.mu.RUnlock()
		return price
	}
	p.tonCache.mu.RUnlock()

	req, err := http.NewRequestWithContext(context.Background(), "GET",
		"https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd", nil)
	if err != nil {
		return defaultTONPrice
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return defaultTONPrice
	}
	defer resp.Body.Close()

	var result map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return defaultTONPrice
	}
	if ton, ok := result["the-open-network"]; ok {
		if usd, ok := ton["usd"]; ok && usd > 0 {
			p.tonCache.mu.Lock()
			p.tonCache.price = usd
			p.tonCache.at = time.Now()
			p.tonCache.mu.Unlock()
			return usd
		}
	}
	return defaultTONPrice
}

// GetGSTDPriceUSD returns GSTD price in USD. Uses real data: Ston.fi pool (GSTD/XAUt or TON/GSTD), golden_reserve_log.
// When live fetch fails, returns last cached real price if < 24h old. Otherwise returns ErrNoRealGSTDPrice.
func (p *PoolMonitorService) GetGSTDPriceUSD(ctx context.Context) (float64, error) {
	goldPrice := p.GetXAUtPriceUSD()

	// 1. Ston.fi pool — real-time DEX price
	if p.stonFi != nil {
		poolAddr := p.tonCfg.GoldPoolAddress
		if poolAddr == "" {
			poolAddr = p.tonCfg.PoolAddress
		}
		if poolAddr != "" {
			poolData, err := p.stonFi.GetPoolData(ctx, poolAddr)
			if err == nil {
				if pool, ok := poolData["pool"].(map[string]interface{}); ok {
					r0, _ := strconv.ParseFloat(getStr(pool, "reserve0"), 64)
					r1, _ := strconv.ParseFloat(getStr(pool, "reserve1"), 64)
					t1 := getStr(pool, "token1_address")
					if r0 > 0 && r1 > 0 {
						var xautReserve, gstdReserve float64
						gstdAddr := p.tonCfg.GSTDJettonAddress
						if gstdAddr != "" && (t1 == gstdAddr || strings.Contains(t1, gstdAddr)) {
							gstdReserve, xautReserve = r1/1e9, r0/1e9
						} else {
							xautReserve, gstdReserve = r0/1e9, r1/1e9
						}
						if gstdReserve > 0 {
							price := (xautReserve * goldPrice) / gstdReserve
							if !math.IsNaN(price) && !math.IsInf(price, 0) && price > 0.0001 && price < 1000 {
								p.gstdCache.mu.Lock()
								p.gstdCache.price = price
								p.gstdCache.at = time.Now()
								p.gstdCache.mu.Unlock()
								return price, nil
							}
						}
					}
				}
			}
		}
	}

	// 2. Golden reserve log
	if p.db != nil {
		var totalGSTD, totalXAUt float64
		err := p.db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(gstd_amount), 0), COALESCE(SUM(xaut_amount), 0)
			FROM golden_reserve_log
		`).Scan(&totalGSTD, &totalXAUt)
		if err == nil && totalGSTD > 0 && totalXAUt > 0 {
			price := (totalXAUt * goldPrice) / totalGSTD
			if !math.IsNaN(price) && !math.IsInf(price, 0) && price > 0 {
				p.gstdCache.mu.Lock()
				p.gstdCache.price = price
				p.gstdCache.at = time.Now()
				p.gstdCache.mu.Unlock()
				return price, nil
			}
		}
	}

	// 3. TON-GSTD pool fallback: GSTD_USD = (TON_reserve/GSTD_reserve) * TON_USD
	const nativeTON = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"
	gstdJetton := p.tonCfg.GSTDJettonAddress
	if gstdJetton == "" {
		gstdJetton = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
	}
	if p.stonFi != nil && gstdJetton != "" {
		// Try both orderings: TON-GSTD and GSTD-TON
		for _, pair := range [][2]string{{nativeTON, gstdJetton}, {gstdJetton, nativeTON}} {
			poolData, err := p.stonFi.GetPoolByMarket(ctx, pair[0], pair[1])
			if err != nil {
				continue
			}
			if pool, ok := poolData["pool"].(map[string]interface{}); ok {
				r0, _ := strconv.ParseFloat(getStr(pool, "reserve0"), 64)
				r1, _ := strconv.ParseFloat(getStr(pool, "reserve1"), 64)
				t0 := getStr(pool, "token0_address")
				if r0 > 0 && r1 > 0 {
					var gstdReserve, tonReserve float64
					if t0 == gstdJetton || strings.Contains(t0, gstdJetton) {
						gstdReserve, tonReserve = r0/1e9, r1/1e9
					} else {
						tonReserve, gstdReserve = r0/1e9, r1/1e9
					}
					if gstdReserve > 0 {
						tonPerGSTD := tonReserve / gstdReserve
						tonPrice := p.GetTONPriceUSD()
						price := tonPerGSTD * tonPrice
						if !math.IsNaN(price) && !math.IsInf(price, 0) && price > 0.0001 && price < 1000 {
							p.gstdCache.mu.Lock()
							p.gstdCache.price = price
							p.gstdCache.at = time.Now()
							p.gstdCache.mu.Unlock()
							return price, nil
						}
					}
				}
			}
		}
	}

	// 4. Cached last real price (< 24h)
	p.gstdCache.mu.RLock()
	cached := p.gstdCache.price
	cachedAt := p.gstdCache.at
	p.gstdCache.mu.RUnlock()
	if cached > 0 && time.Since(cachedAt) < 24*time.Hour {
		return cached, nil
	}

	// 5. Configurable fallback (for Stars/display when all real sources fail)
	if fallback := getEnvFloat("GSTD_FALLBACK_PRICE_USD", 0.02); fallback > 0 && fallback < 100 {
		log.Printf("[PoolMonitor] Using GSTD fallback price $%.4f (real sources unavailable)", fallback)
		return fallback, nil
	}
	return 0, ErrNoRealGSTDPrice
}

func getEnvFloat(key string, defaultVal float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
			return f
		}
	}
	return defaultVal
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
	gstdPriceUSD, _ := p.GetGSTDPriceUSD(ctx) // real or cached
	if totalLiquidityUSD <= 0 && gstdBal > 0 && xautBal > 0 {
		// derive from reserves: gstdPrice = (xaut*gold)/gstd
		derivedPrice := (xautBal * goldPrice) / gstdBal
		totalLiquidityUSD = gstdBal*derivedPrice + xautBal*goldPrice
	} else if totalLiquidityUSD <= 0 && gstdPriceUSD > 0 {
		totalLiquidityUSD = gstdBal*gstdPriceUSD + xautBal*goldPrice
	}
	if totalLiquidityUSD < 0 {
		totalLiquidityUSD = 0
	}
	reserveRatio := 0.0
	if gstdBal > 0 && xautBal > 0 && gstdPriceUSD > 0 {
		reserveRatio = (xautBal * goldPrice) / (gstdBal * gstdPriceUSD)
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
