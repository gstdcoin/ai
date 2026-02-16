package leviathan

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// MarketPrice holds extracted price vector (no full JSON storage).
type MarketPrice struct {
	EventID       string
	EventName     string
	MarketID      string
	Question      string
	YesPct        float64
	OneHourChange float64
	Closed        bool
	ResolvedYes   *bool
	UpdatedAt     time.Time
}

// PolymarketClient fetches events and parses price vectors.
type PolymarketClient struct {
	baseURL string
	client  *http.Client
	mu      sync.RWMutex
	lastPrices map[string]MarketPrice // marketID -> last known
}

// NewPolymarketClient creates a client for Gamma API.
func NewPolymarketClient(baseURL string) *PolymarketClient {
	return &PolymarketClient{
		baseURL:    strings.TrimSuffix(baseURL, "/"),
		client:     &http.Client{Timeout: 15 * time.Second},
		lastPrices: make(map[string]MarketPrice),
	}
}

// FetchActiveEvents returns events with active=true, closed=false.
func (c *PolymarketClient) FetchActiveEvents(limit int) ([]MarketPrice, error) {
	url := fmt.Sprintf("%s/events?active=true&closed=false&limit=%d", c.baseURL, limit)
	if limit <= 0 {
		limit = 100
		url = fmt.Sprintf("%s/events?active=true&closed=false&limit=100", c.baseURL)
	}
	resp, err := c.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gamma api: %d", resp.StatusCode)
	}
	var events []json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, err
	}
	var out []MarketPrice
	for _, raw := range events {
		mp := c.extractVectors(raw)
		for i := range mp {
			out = append(out, mp[i])
		}
	}
	return out, nil
}

// extractVectors extracts only essential fields. No full JSON storage.
func (c *PolymarketClient) extractVectors(raw json.RawMessage) []MarketPrice {
	var evt struct {
		ID    string `json:"id"`
		Title string `json:"title"`
		Markets []struct {
			ID           string `json:"id"`
			Question     string `json:"question"`
			OutcomePrices string `json:"outcomePrices"`
			Closed       bool   `json:"closed"`
			OneHourPriceChange *float64 `json:"oneHourPriceChange"`
			LastTradePrice *float64 `json:"lastTradePrice"`
			ResolvedBy   string `json:"resolvedBy"`
		} `json:"markets"`
	}
	if err := json.Unmarshal(raw, &evt); err != nil {
		return nil
	}
	var out []MarketPrice
	for _, m := range evt.Markets {
		yesPct := parseYesPrice(m.OutcomePrices, m.LastTradePrice)
		oneHour := 0.0
		if m.OneHourPriceChange != nil {
			oneHour = *m.OneHourPriceChange
		}
		mp := MarketPrice{
			EventID:       evt.ID,
			EventName:     evt.Title,
			MarketID:      m.ID,
			Question:      m.Question,
			YesPct:        yesPct,
			OneHourChange: oneHour,
			Closed:        m.Closed,
			UpdatedAt:    time.Now(),
		}
		if m.Closed && m.ResolvedBy != "" {
			// Resolved: outcomePrices "[\"0\", \"1\"]" = No, "[\"1\", \"0\"]" = Yes
			mp.ResolvedYes = parseResolved(m.OutcomePrices)
		}
		out = append(out, mp)
	}
	return out
}

func parseYesPrice(outcomePrices string, lastTrade *float64) float64 {
	if lastTrade != nil {
		return *lastTrade
	}
	// outcomePrices: "[\"0.145\", \"0.855\"]" -> Yes=0.145, No=0.855 for first outcome
	s := strings.TrimPrefix(strings.TrimSuffix(outcomePrices, "]"), "[")
	parts := strings.Split(s, ",")
	if len(parts) >= 1 {
		p := strings.Trim(parts[0], `" `)
		if v, err := strconv.ParseFloat(p, 64); err == nil {
			return v
		}
	}
	return 0
}

func parseResolved(outcomePrices string) *bool {
	s := strings.TrimPrefix(strings.TrimSuffix(outcomePrices, "]"), "[")
	parts := strings.Split(s, ",")
	if len(parts) >= 2 {
		yesStr := strings.Trim(parts[0], `" `)
		noStr := strings.Trim(parts[1], `" `)
		yes, _ := strconv.ParseFloat(yesStr, 64)
		no, _ := strconv.ParseFloat(noStr, 64)
		if yes > 0.9 {
			b := true
			return &b
		}
		if no > 0.9 {
			b := false
			return &b
		}
	}
	return nil
}

// DeltaTrigger: true if price moved more than threshold in last hour.
func (c *PolymarketClient) DeltaTrigger(mp MarketPrice, thresholdPct float64) bool {
	abs := mp.OneHourChange
	if abs < 0 {
		abs = -abs
	}
	return abs*100 >= thresholdPct
}

// StoreLast / GetLast for delta comparison.
func (c *PolymarketClient) StoreLast(mp MarketPrice) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastPrices[mp.MarketID] = mp
}

func (c *PolymarketClient) GetLast(marketID string) (MarketPrice, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	p, ok := c.lastPrices[marketID]
	return p, ok
}
