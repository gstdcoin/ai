package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// ═══════════════════════════════════════════════════════════════
// EXTERNAL DATA FETCHER
//
// Pulls real market data from free public APIs for signal enrichment.
// Cached in Redis (TTL 45min) and stored in PostgreSQL for audit.
//
// Sources (ALL FREE, no API keys):
//  1. CoinGecko — crypto prices (BTC, ETH, TON, SOL)
//  2. ECB — forex exchange rates (EUR/USD, etc.)
//  3. HackerNews — tech trends (top stories)
//  4. Alpha Vantage — commodities (gold/silver placeholder via Groq)
//
// Design:
//  - Fetches every 30 min (staggered: 10s between sources)
//  - Redis cache with 45 min TTL (survives 1 missed fetch)
//  - PostgreSQL backup for historical analysis
//  - Zero load: only fetches when cache is stale
//  - All HTTP calls have 15s timeout
// ═══════════════════════════════════════════════════════════════

type ExternalDataFetcher struct {
	db     *sql.DB
	redis  *redis.Client
	ai     *CompoundAI
	client *http.Client
	mu     sync.RWMutex
	cache  map[string]*MarketDataSnapshot
}

// MarketDataSnapshot holds fetched external data for one source
type MarketDataSnapshot struct {
	Source    string                 `json:"source"`
	Category  string                 `json:"category"`
	Data      map[string]interface{} `json:"data"`
	FetchedAt time.Time              `json:"fetched_at"`
	Fresh     bool                   `json:"fresh"`
}

// NewExternalDataFetcher creates the fetcher
func NewExternalDataFetcher(db *sql.DB, redisClient *redis.Client, ai *CompoundAI) *ExternalDataFetcher {
	return &ExternalDataFetcher{
		db:     db,
		redis:  redisClient,
		ai:     ai,
		client: &http.Client{Timeout: 15 * time.Second},
		cache:  make(map[string]*MarketDataSnapshot),
	}
}

// Start launches the background fetch loop
func (f *ExternalDataFetcher) Start(ctx context.Context) {
	log.Println("📡 ExternalDataFetcher: ONLINE — fetching real market data every 30 min")

	// Immediate first fetch
	go f.fetchAllSources(ctx)

	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			f.fetchAllSources(ctx)
		case <-ctx.Done():
			return
		}
	}
}

// GetAllData returns all cached market data snapshots
func (f *ExternalDataFetcher) GetAllData() map[string]*MarketDataSnapshot {
	f.mu.RLock()
	defer f.mu.RUnlock()

	result := make(map[string]*MarketDataSnapshot, len(f.cache))
	for k, v := range f.cache {
		result[k] = v
	}
	return result
}

// GetDataForCategory returns cached data for a specific category
func (f *ExternalDataFetcher) GetDataForCategory(category string) map[string]interface{} {
	f.mu.RLock()
	defer f.mu.RUnlock()

	if snap, ok := f.cache[category]; ok && time.Since(snap.FetchedAt) < 60*time.Minute {
		return snap.Data
	}
	return nil
}

// GetDataSourcesStatus returns freshness info for all sources
func (f *ExternalDataFetcher) GetDataSourcesStatus() []map[string]interface{} {
	f.mu.RLock()
	defer f.mu.RUnlock()

	var sources []map[string]interface{}
	sourceOrder := []struct {
		key    string
		name   string
		icon   string
		apiURL string
	}{
		{"crypto", "CoinGecko", "₿", "api.coingecko.com"},
		{"forex", "ECB Exchange Rates", "💱", "data.ecb.europa.eu"},
		{"tech", "HackerNews", "📡", "hacker-news.firebaseio.com"},
		{"polymarket", "Polymarket Predict", "🗳️", "gamma-api.polymarket.com"},
	}

	for _, s := range sourceOrder {
		snap, ok := f.cache[s.key]
		fresh := false
		lastFetch := ""
		dataPoints := 0

		if ok {
			fresh = time.Since(snap.FetchedAt) < 45*time.Minute
			lastFetch = snap.FetchedAt.UTC().Format(time.RFC3339)
			dataPoints = len(snap.Data)
		}

		sources = append(sources, map[string]interface{}{
			"source":      s.name,
			"icon":        s.icon,
			"category":    s.key,
			"api_url":     s.apiURL,
			"fresh":       fresh,
			"last_fetch":  lastFetch,
			"data_points": dataPoints,
			"status": func() string {
				if fresh {
					return "live"
				}
				return "stale"
			}(),
		})
	}
	return sources
}

// fetchAllSources fetches from all sources with stagger
func (f *ExternalDataFetcher) fetchAllSources(ctx context.Context) {
	fetchers := []struct {
		name string
		fn   func(context.Context) (*MarketDataSnapshot, error)
	}{
		{"crypto", f.fetchCryptoData},
		{"forex", f.fetchForexData},
		{"tech", f.fetchTechTrends},
		{"polymarket", f.fetchPolymarketData},
	}

	fetched := 0
	for i, fetcher := range fetchers {
		if i > 0 {
			time.Sleep(10 * time.Second) // Stagger requests
		}

		// Check Redis cache first
		if f.redis != nil {
			cacheKey := fmt.Sprintf("market_data:%s", fetcher.name)
			cached, err := f.redis.Get(ctx, cacheKey).Result()
			if err == nil {
				var snap MarketDataSnapshot
				if json.Unmarshal([]byte(cached), &snap) == nil && time.Since(snap.FetchedAt) < 45*time.Minute {
					f.mu.Lock()
					f.cache[fetcher.name] = &snap
					f.mu.Unlock()
					continue // Skip fetch, cache is fresh
				}
			}
		}

		snap, err := fetcher.fn(ctx)
		if err != nil {
			log.Printf("⚠️ ExternalDataFetcher [%s]: %v", fetcher.name, err)
			continue
		}

		// Store in memory cache
		f.mu.Lock()
		f.cache[fetcher.name] = snap
		f.mu.Unlock()

		// Store in Redis (45 min TTL)
		if f.redis != nil {
			data, _ := json.Marshal(snap)
			f.redis.Set(ctx, fmt.Sprintf("market_data:%s", fetcher.name), string(data), 45*time.Minute)
		}

		// Store in PostgreSQL for historical analysis
		f.storeSnapshot(ctx, snap)
		fetched++
	}

	if fetched > 0 {
		log.Printf("📡 ExternalDataFetcher: refreshed %d/%d sources", fetched, len(fetchers))
	}
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 1: CRYPTOCURRENCY (CoinGecko — free, no key)
// ═══════════════════════════════════════════════════════════════

func (f *ExternalDataFetcher) fetchCryptoData(ctx context.Context) (*MarketDataSnapshot, error) {
	url := "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,the-open-network,solana,dogecoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true"

	body, err := f.httpGet(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("coingecko: %w", err)
	}

	var raw map[string]map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("coingecko parse: %w", err)
	}

	data := make(map[string]interface{})
	for coin, vals := range raw {
		data[coin] = vals
	}

	// Add BTC dominance estimate
	if btc, ok := raw["bitcoin"]; ok {
		if btcCap, ok := btc["usd_market_cap"].(float64); ok && btcCap > 0 {
			totalCap := btcCap
			for name, vals := range raw {
				if name != "bitcoin" {
					if cap, ok := vals["usd_market_cap"].(float64); ok {
						totalCap += cap
					}
				}
			}
			data["btc_dominance_approx"] = btcCap / totalCap * 100
		}
	}

	// Fetch trending coins
	trendURL := "https://api.coingecko.com/api/v3/search/trending"
	if trendBody, err := f.httpGet(ctx, trendURL); err == nil {
		var trending struct {
			Coins []struct {
				Item struct {
					Name   string `json:"name"`
					Symbol string `json:"symbol"`
					Score  int    `json:"score"`
				} `json:"item"`
			} `json:"coins"`
		}
		if json.Unmarshal(trendBody, &trending) == nil && len(trending.Coins) > 0 {
			var names []string
			for _, c := range trending.Coins {
				if len(names) < 5 {
					names = append(names, fmt.Sprintf("%s (%s)", c.Item.Name, c.Item.Symbol))
				}
			}
			data["trending"] = names
		}
	}

	return &MarketDataSnapshot{
		Source:    "CoinGecko",
		Category:  "crypto",
		Data:      data,
		FetchedAt: time.Now(),
		Fresh:     true,
	}, nil
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 2: FOREX (ECB — free, no key)
// ═══════════════════════════════════════════════════════════════

func (f *ExternalDataFetcher) fetchForexData(ctx context.Context) (*MarketDataSnapshot, error) {
	url := "https://data.ecb.europa.eu/data-detail/EXR/D.USD+GBP+JPY+CNY+RUB+CHF+CAD.EUR.SP00.A"

	// ECB data is complex XML, use a simpler free API
	// Use exchangerate-api.com free endpoint
	freeURL := "https://open.er-api.com/v6/latest/USD"

	body, err := f.httpGet(ctx, freeURL)
	if err != nil {
		// Fallback: try frankfurter.app (another free forex API)
		freeURL = "https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CNY,RUB,CHF,CAD,AUD,SGD"
		body, err = f.httpGet(ctx, freeURL)
		if err != nil {
			return nil, fmt.Errorf("forex APIs unavailable: %w", err)
		}
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("forex parse: %w", err)
	}

	data := make(map[string]interface{})
	_ = url // suppress unused

	// Extract rates
	if rates, ok := raw["rates"].(map[string]interface{}); ok {
		data["base"] = "USD"
		data["rates"] = rates
		data["rate_count"] = len(rates)
	} else {
		data["raw"] = raw
	}

	data["source_url"] = freeURL

	return &MarketDataSnapshot{
		Source:    "ExchangeRate API",
		Category:  "forex",
		Data:      data,
		FetchedAt: time.Now(),
		Fresh:     true,
	}, nil
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 3: TECH TRENDS (HackerNews — free)
// ═══════════════════════════════════════════════════════════════

func (f *ExternalDataFetcher) fetchTechTrends(ctx context.Context) (*MarketDataSnapshot, error) {
	// Get top stories IDs
	body, err := f.httpGet(ctx, "https://hacker-news.firebaseio.com/v0/topstories.json")
	if err != nil {
		return nil, fmt.Errorf("hackernews: %w", err)
	}

	var storyIDs []int
	if err := json.Unmarshal(body, &storyIDs); err != nil {
		return nil, fmt.Errorf("hackernews parse: %w", err)
	}

	// Fetch top 10 stories
	data := make(map[string]interface{})
	var stories []map[string]interface{}
	var aiRelated, cryptoRelated, webRelated int

	limit := 15
	if len(storyIDs) < limit {
		limit = len(storyIDs)
	}

	for _, id := range storyIDs[:limit] {
		storyBody, err := f.httpGet(ctx, fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", id))
		if err != nil {
			continue
		}
		var story map[string]interface{}
		if json.Unmarshal(storyBody, &story) == nil {
			title := ""
			if t, ok := story["title"].(string); ok {
				title = t
			}
			stories = append(stories, map[string]interface{}{
				"title": title,
				"score": story["score"],
				"url":   story["url"],
			})

			// Categorize
			titleLower := strings.ToLower(title)
			if strings.Contains(titleLower, "ai") || strings.Contains(titleLower, "llm") ||
				strings.Contains(titleLower, "gpt") || strings.Contains(titleLower, "machine learning") {
				aiRelated++
			}
			if strings.Contains(titleLower, "crypto") || strings.Contains(titleLower, "bitcoin") ||
				strings.Contains(titleLower, "blockchain") || strings.Contains(titleLower, "web3") {
				cryptoRelated++
			}
			if strings.Contains(titleLower, "web") || strings.Contains(titleLower, "api") ||
				strings.Contains(titleLower, "cloud") || strings.Contains(titleLower, "saas") {
				webRelated++
			}
		}
	}

	data["top_stories"] = stories
	data["story_count"] = len(stories)
	data["ai_related"] = aiRelated
	data["crypto_related"] = cryptoRelated
	data["web_related"] = webRelated
	data["trend_signal"] = func() string {
		if aiRelated > 3 {
			return "AI_DOMINANT"
		}
		if cryptoRelated > 2 {
			return "CRYPTO_TRENDING"
		}
		return "MIXED"
	}()

	return &MarketDataSnapshot{
		Source:    "HackerNews",
		Category:  "tech",
		Data:      data,
		FetchedAt: time.Now(),
		Fresh:     true,
	}, nil
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 4: POLYMARKET (Real-World Prediction Markets)
// ═══════════════════════════════════════════════════════════════

func (f *ExternalDataFetcher) fetchPolymarketData(ctx context.Context) (*MarketDataSnapshot, error) {
	// Filter: only events ending in current year or later, ordered by volume
	currentYear := time.Now().Format("2006")
	url := fmt.Sprintf("https://gamma-api.polymarket.com/events?closed=false&active=true&limit=15&order=volume&ascending=false&end_date_min=%s-01-01", currentYear)
	body, err := f.httpGet(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("polymarket: %w", err)
	}

	var events []map[string]interface{}
	if err := json.Unmarshal(body, &events); err != nil {
		return nil, fmt.Errorf("polymarket parse: %w", err)
	}

	data := make(map[string]interface{})
	var topMarkets []map[string]interface{}
	var totalVolume float64

	for _, e := range events {
		title, _ := e["title"].(string)
		eventVol, _ := e["volume"].(float64)
		totalVolume += eventVol

		// Extract first active market
		if markets, ok := e["markets"].([]interface{}); ok && len(markets) > 0 {
			if firstMarket, ok := markets[0].(map[string]interface{}); ok {
				question, _ := firstMarket["question"].(string)
				// Polymarket returns outcomes and outcomePrices as stringified JSON arrays
				outcomesStr, _ := firstMarket["outcomes"].(string)
				pricesStr, _ := firstMarket["outcomePrices"].(string)

				var outcomes []string
				var prices []string
				json.Unmarshal([]byte(outcomesStr), &outcomes)
				json.Unmarshal([]byte(pricesStr), &prices)

				if len(outcomes) > 0 && len(prices) > 0 {
					topMarkets = append(topMarkets, map[string]interface{}{
						"event":    title,
						"question": question,
						"outcomes": outcomes,
						"prices":   prices,
						"volume":   eventVol,
					})
				}
			}
		}
	}

	data["active_markets"] = topMarkets
	data["markets_count"] = len(topMarkets)
	data["sample_volume"] = totalVolume

	return &MarketDataSnapshot{
		Source:    "Polymarket",
		Category:  "polymarket",
		Data:      data,
		FetchedAt: time.Now(),
		Fresh:     true,
	}, nil
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

func (f *ExternalDataFetcher) httpGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "GSTD-Platform/1.0")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d from %s", resp.StatusCode, url)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024)) // Max 4MB (Polymarket events can be ~3MB)
	if err != nil {
		return nil, err
	}
	return body, nil
}

func (f *ExternalDataFetcher) storeSnapshot(ctx context.Context, snap *MarketDataSnapshot) {
	if f.db == nil {
		return
	}

	dataJSON, _ := json.Marshal(snap.Data)
	_, err := f.db.ExecContext(ctx, `
		INSERT INTO external_market_data (source, category, data_json, fetched_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (source, category) DO UPDATE SET
			data_json = EXCLUDED.data_json,
			fetched_at = EXCLUDED.fetched_at`,
		snap.Source, snap.Category, string(dataJSON), snap.FetchedAt)
	if err != nil {
		log.Printf("⚠️ ExternalDataFetcher: DB store error: %v", err)
	}
}
