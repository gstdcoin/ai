package leviathan

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// ─── TON Center API — blockchain analytics for GSTD ecosystem ───────────────

// FetchTONCenter retrieves TON network stats (masterchain block, tx count, validator count).
// No API key required for public endpoints.
func (g *GlobalSenses) FetchTONCenter(ctx context.Context) (txVolume string, err error) {
	// TON Center public API — masterchain info
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://toncenter.com/api/v2/getMasterchainInfo", nil)
	if err != nil {
		return "", err
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("TON API unavailable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("TON API HTTP %d", resp.StatusCode)
	}
	var data struct {
		OK     bool `json:"ok"`
		Result struct {
			Last struct {
				Seqno     int `json:"seqno"`
				Workchain int `json:"workchain"`
			} `json:"last"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}
	if !data.OK {
		return "", fmt.Errorf("TON API returned not ok")
	}
	return fmt.Sprintf("TON masterchain seqno=%d", data.Result.Last.Seqno), nil
}

// FetchTONTransactions returns recent transaction count for a given address.
func (g *GlobalSenses) FetchTONTransactions(ctx context.Context, address string, limit int) (count int, err error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	url := fmt.Sprintf("https://toncenter.com/api/v2/getTransactions?address=%s&limit=%d", address, limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	var data struct {
		OK     bool          `json:"ok"`
		Result []interface{} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}
	return len(data.Result), nil
}

// ─── GitHub Events API — community/dev activity tracking ────────────────────

// FetchGitHubEvents checks commit pulse for a repository (no API key for public repos).
// Returns activity summary: recent event types and count.
func (g *GlobalSenses) FetchGitHubEvents(ctx context.Context, repo string) (activity string, err error) {
	if repo == "" {
		repo = "gstdcoin/gstdbot" // default: our own repo
	}
	url := fmt.Sprintf("https://api.github.com/repos/%s/events?per_page=30", repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "GSTD-Leviathan/1.0")
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API HTTP %d", resp.StatusCode)
	}

	var events []struct {
		Type      string `json:"type"`
		CreatedAt string `json:"created_at"`
		Actor     struct {
			Login string `json:"login"`
		} `json:"actor"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return "", err
	}

	// Count event types
	counts := make(map[string]int)
	recent24h := 0
	cutoff := time.Now().Add(-24 * time.Hour)
	for _, e := range events {
		counts[e.Type]++
		if t, err := time.Parse(time.RFC3339, e.CreatedAt); err == nil && t.After(cutoff) {
			recent24h++
		}
	}

	var parts []string
	for t, c := range counts {
		shortType := strings.TrimSuffix(t, "Event")
		parts = append(parts, fmt.Sprintf("%s:%d", shortType, c))
	}

	activity = fmt.Sprintf("%d events (24h: %d) — %s", len(events), recent24h, strings.Join(parts, ", "))
	log.Printf("[Leviathan] GitHub %s: %s", repo, activity)
	return activity, nil
}

// ─── CoinGecko API — crypto prices (free, no API key) ───────────────────────

// FetchCoinGeckoPrice returns price for a coin ID (bitcoin, ethereum, the-open-network, etc).
func (g *GlobalSenses) FetchCoinGeckoPrice(ctx context.Context, coinID string) (priceUSD float64, change24h float64, err error) {
	if coinID == "" {
		coinID = "the-open-network"
	}
	url := fmt.Sprintf("https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=usd&include_24hr_change=true", coinID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("User-Agent", "GSTD-Leviathan/1.0")

	resp, err := g.client.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("CoinGecko HTTP %d", resp.StatusCode)
	}

	var data map[string]map[string]float64
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, 0, err
	}

	coin, ok := data[coinID]
	if !ok {
		return 0, 0, fmt.Errorf("coin %s not found", coinID)
	}

	return coin["usd"], coin["usd_24h_change"], nil
}

// FetchYahooFinance fetches stock/commodity price from Yahoo Finance v8 API (free).
func (g *GlobalSenses) FetchYahooFinance(ctx context.Context, symbol string) (price float64, err error) {
	if symbol == "" {
		return 0, fmt.Errorf("symbol required")
	}
	url := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=1d", symbol)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("User-Agent", "GSTD-Leviathan/1.0")

	resp, err := g.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("Yahoo Finance HTTP %d", resp.StatusCode)
	}

	var data struct {
		Chart struct {
			Result []struct {
				Meta struct {
					RegularMarketPrice float64 `json:"regularMarketPrice"`
				} `json:"meta"`
			} `json:"result"`
		} `json:"chart"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}
	if len(data.Chart.Result) == 0 {
		return 0, fmt.Errorf("no data for %s", symbol)
	}
	return data.Chart.Result[0].Meta.RegularMarketPrice, nil
}

// ─── Stubs for future integrations ──────────────────────────────────────────

// FetchHuggingFaceHub — AI/ML: new models, datasets. Domain: code.
func (g *GlobalSenses) FetchHuggingFaceHub(ctx context.Context, query string) (summary, source string) {
	// Future: Hugging Face Hub API — monitor new model releases
	return "", ""
}

// FetchStackOverflow — Developer pain points. Domain: code.
func (g *GlobalSenses) FetchStackOverflow(ctx context.Context, query string) (summary, source string) {
	// Future: Stack Overflow API — rise in questions = rise in adoption
	return "", ""
}

// FetchPubMed — Biomedicine, vaccines. Domain: science.
func (g *GlobalSenses) FetchPubMed(ctx context.Context, query string) (summary, source string) {
	// Future: PubMed Central API
	return "", ""
}

// FetchFRED — Fed economic data. Domain: finance.
func (g *GlobalSenses) FetchFRED(ctx context.Context, series string) (value float64, err error) {
	// Future: FRED API — inflation, unemployment, rates
	return 0, nil
}

// FetchWhaleAlert — Large transfers. Domain: crypto.
func (g *GlobalSenses) FetchWhaleAlert(ctx context.Context) (alerts string, err error) {
	// Future: Whale Alert API — BTC to exchange = panic sell signal
	return "", nil
}

// FetchGoogleTrends — Organic interest. Domain: social.
func (g *GlobalSenses) FetchGoogleTrends(ctx context.Context, query string) (interest string, err error) {
	// Future: Google Trends API / RSS
	return "", nil
}
