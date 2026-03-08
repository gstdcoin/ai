package leviathan

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Pyth price feed IDs (from pyth.network)
const (
	PythBTCUSD = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
	PythETHUSD = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
)

// OracleClient fetches prices from Pyth/Chainlink for Decentralized Oracles cross-check.
type OracleClient struct {
	client   *http.Client
	pythBase string
}

// NewOracleClient creates client for oracle price feeds.
func NewOracleClient() *OracleClient {
	return &OracleClient{
		client:   &http.Client{Timeout: 8 * time.Second},
		pythBase: "https://hermes.pyth.network",
	}
}

// PythPrice holds parsed price from Pyth Hermes API.
type PythPrice struct {
	Symbol string
	Price  float64
}

// FetchPythPrices returns BTC/USD and ETH/USD from Pyth.
func (c *OracleClient) FetchPythPrices(ctx context.Context) (btcUSD, ethUSD float64, err error) {
	url := fmt.Sprintf("%s/v2/updates/price/latest?ids[]=%s&ids[]=%s",
		c.pythBase, PythBTCUSD, PythETHUSD)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, 0, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		log.Printf("[Leviathan] Oracle Pyth fetch error: %v", err)
		return 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("pyth api: %d", resp.StatusCode)
	}
	var data struct {
		Parsed []struct {
			ID    string `json:"id"`
			Price struct {
				Price string `json:"price"`
				Expo  int    `json:"expo"`
			} `json:"price"`
		} `json:"parsed"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, 0, err
	}
	for _, p := range data.Parsed {
		priceVal, _ := strconv.ParseFloat(p.Price.Price, 64)
		exp := math.Pow(10, float64(p.Price.Expo))
		price := priceVal * exp
		if p.ID == PythBTCUSD {
			btcUSD = price
		} else if p.ID == PythETHUSD {
			ethUSD = price
		}
	}
	return btcUSD, ethUSD, nil
}

// CheckPolymarketLag returns true if Polymarket appears to lag oracle price (critical signal).
// For crypto markets: if question implies a price threshold and oracle is far past it while market YES% is low — lag.
func (c *OracleClient) CheckPolymarketLag(ctx context.Context, market MarketPrice, marketYesPct float64) (lagDetected bool, signal string) {
	if !isCryptoMarket(market) {
		return false, ""
	}
	btcUSD, ethUSD, err := c.FetchPythPrices(ctx)
	if err != nil || (btcUSD == 0 && ethUSD == 0) {
		return false, ""
	}
	text := strings.ToLower(market.EventName + " " + market.Question)
	// Extract price threshold from question (e.g. "100000", "100k", "5000")
	reK := regexp.MustCompile(`(\d+)\s*k`)
	reNum := regexp.MustCompile(`(\d{4,})`)
	var threshold float64
	if m := reK.FindStringSubmatch(text); len(m) >= 2 {
		threshold, _ = strconv.ParseFloat(m[1], 64)
		threshold *= 1000
	} else if m := reNum.FindStringSubmatch(text); len(m) >= 1 {
		threshold, _ = strconv.ParseFloat(m[1], 64)
	}
	if threshold <= 0 {
		return false, ""
	}
	oraclePrice := btcUSD
	if strings.Contains(text, "eth") || strings.Contains(text, "ethereum") {
		oraclePrice = ethUSD
	}
	// If oracle already above threshold by 5%+ but market YES < 40% — Polymarket lagging
	if oraclePrice >= threshold*1.05 && marketYesPct < 0.4 {
		return true, fmt.Sprintf("Oracle %.0f vs threshold %.0f — Polymarket lag", oraclePrice, threshold)
	}
	return false, ""
}
