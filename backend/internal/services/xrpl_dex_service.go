package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// =============================================================================
// XRPL DEX SERVICE — XRP Ledger Integration for GSTD Bridge
// Uses XRPL JSON-RPC for trust lines, path finding, and DEX data
// =============================================================================

// XRPLDexService provides XRPL DEX and token operations
type XRPLDexService struct {
	httpClient   *http.Client
	rpcURL       string // XRPL JSON-RPC endpoint
	gstdIssuer   string // GSTD IOU token issuer address
	gstdCurrency string // Currency code ("GSD" or hex-encoded "GSTD")
	vaultAddress string // Bridge vault account on XRPL
}

// XRPLPathQuote represents a path-finding result
type XRPLPathQuote struct {
	SourceAmount   string `json:"source_amount"`
	DestAmount     string `json:"destination_amount"`
	SourceCurrency string `json:"source_currency"`
	DestCurrency   string `json:"dest_currency"`
	PathsAvailable int    `json:"paths_available"`
	QualityAverage string `json:"quality_average"`
}

// XRPLTrustLine represents a trust line (token balance)
type XRPLTrustLine struct {
	Account    string  `json:"account"`
	Currency   string  `json:"currency"`
	Balance    string  `json:"balance"`
	Limit      string  `json:"limit"`
	QualityIn  float64 `json:"quality_in"`
	QualityOut float64 `json:"quality_out"`
}

// XRPLOrderBookEntry represents an offer on the DEX
type XRPLOrderBookEntry struct {
	Account   string      `json:"Account"`
	TakerGets interface{} `json:"TakerGets"`
	TakerPays interface{} `json:"TakerPays"`
	Quality   string      `json:"quality"`
	Sequence  int         `json:"Sequence"`
}

// NewXRPLDexService creates a new XRPL DEX service
func NewXRPLDexService(
	rpcURL string,
	gstdIssuer string,
	gstdCurrency string,
	vaultAddress string,
) *XRPLDexService {
	if rpcURL == "" {
		rpcURL = "https://s1.ripple.com:51234"
	}
	if gstdCurrency == "" {
		gstdCurrency = "GSD"
	}

	return &XRPLDexService{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		rpcURL:       rpcURL,
		gstdIssuer:   gstdIssuer,
		gstdCurrency: gstdCurrency,
		vaultAddress: vaultAddress,
	}
}

// =============================================================================
// TRUST LINES & BALANCES
// =============================================================================

// GetGSTDBalance gets GSTD IOU balance for an account
func (x *XRPLDexService) GetGSTDBalance(ctx context.Context, account string) (float64, error) {
	body := map[string]interface{}{
		"method": "account_lines",
		"params": []map[string]interface{}{{
			"account":      account,
			"peer":         x.gstdIssuer,
			"ledger_index": "validated",
		}},
	}

	resp, err := x.rpcCall(ctx, body)
	if err != nil {
		return 0, err
	}

	lines, ok := resp["lines"].([]interface{})
	if !ok {
		return 0, nil
	}

	for _, line := range lines {
		lineMap, ok := line.(map[string]interface{})
		if !ok {
			continue
		}
		currency, _ := lineMap["currency"].(string)
		if strings.EqualFold(currency, x.gstdCurrency) {
			balanceStr, _ := lineMap["balance"].(string)
			var balance float64
			fmt.Sscanf(balanceStr, "%f", &balance)
			return balance, nil
		}
	}
	return 0, nil
}

// GetTrustLines returns all trust lines for an account
func (x *XRPLDexService) GetTrustLines(ctx context.Context, account string) ([]XRPLTrustLine, error) {
	body := map[string]interface{}{
		"method": "account_lines",
		"params": []map[string]interface{}{{
			"account":      account,
			"ledger_index": "validated",
		}},
	}

	resp, err := x.rpcCall(ctx, body)
	if err != nil {
		return nil, err
	}

	lines, ok := resp["lines"].([]interface{})
	if !ok {
		return nil, nil
	}

	var trustLines []XRPLTrustLine
	for _, line := range lines {
		lineJSON, _ := json.Marshal(line)
		var tl XRPLTrustLine
		json.Unmarshal(lineJSON, &tl)
		trustLines = append(trustLines, tl)
	}

	return trustLines, nil
}

// =============================================================================
// PATH FINDING (Cross-Currency)
// =============================================================================

// FindPath finds the best path for XRP → GSTD conversion
func (x *XRPLDexService) FindPath(ctx context.Context, sourceAccount string, destAccount string, destAmountGSTD float64) (*XRPLPathQuote, error) {
	log.Printf("🔴 [XRPL] Path finding: %s → %s, amount=%.4f GSTD",
		sourceAccount[:8], destAccount[:8], destAmountGSTD)

	body := map[string]interface{}{
		"method": "ripple_path_find",
		"params": []map[string]interface{}{{
			"source_account":      sourceAccount,
			"destination_account": destAccount,
			"destination_amount": map[string]string{
				"currency": x.gstdCurrency,
				"issuer":   x.gstdIssuer,
				"value":    fmt.Sprintf("%.6f", destAmountGSTD),
			},
		}},
	}

	resp, err := x.rpcCall(ctx, body)
	if err != nil {
		return nil, fmt.Errorf("path find failed: %w", err)
	}

	alternatives, ok := resp["alternatives"].([]interface{})
	if !ok || len(alternatives) == 0 {
		return nil, fmt.Errorf("no paths available for XRP → GSTD conversion")
	}

	// Parse best path
	best := alternatives[0].(map[string]interface{})
	sourceAmount := ""
	if sa, ok := best["source_amount"].(string); ok {
		sourceAmount = sa // XRP drops
	} else if saObj, ok := best["source_amount"].(map[string]interface{}); ok {
		sourceAmount = fmt.Sprintf("%v %v", saObj["value"], saObj["currency"])
	}

	quote := &XRPLPathQuote{
		SourceAmount:   sourceAmount,
		DestAmount:     fmt.Sprintf("%.6f", destAmountGSTD),
		SourceCurrency: "XRP",
		DestCurrency:   x.gstdCurrency,
		PathsAvailable: len(alternatives),
	}

	log.Printf("🔴 [XRPL] Path found: %s XRP → %s GSTD (%d paths)",
		sourceAmount, quote.DestAmount, len(alternatives))

	return quote, nil
}

// =============================================================================
// ORDER BOOK
// =============================================================================

// GetOrderBook fetches the GSTD/XRP order book from XRPL DEX
func (x *XRPLDexService) GetOrderBook(ctx context.Context, limit int) (asks []XRPLOrderBookEntry, bids []XRPLOrderBookEntry, err error) {
	if limit == 0 {
		limit = 20
	}

	// Asks: selling GSTD for XRP
	asksBody := map[string]interface{}{
		"method": "book_offers",
		"params": []map[string]interface{}{{
			"taker_gets": map[string]string{
				"currency": x.gstdCurrency,
				"issuer":   x.gstdIssuer,
			},
			"taker_pays": map[string]string{
				"currency": "XRP",
			},
			"limit": limit,
		}},
	}

	asksResp, err := x.rpcCall(ctx, asksBody)
	if err != nil {
		return nil, nil, err
	}

	if offers, ok := asksResp["offers"].([]interface{}); ok {
		for _, o := range offers {
			oJSON, _ := json.Marshal(o)
			var entry XRPLOrderBookEntry
			json.Unmarshal(oJSON, &entry)
			asks = append(asks, entry)
		}
	}

	// Bids: buying GSTD with XRP
	bidsBody := map[string]interface{}{
		"method": "book_offers",
		"params": []map[string]interface{}{{
			"taker_gets": map[string]string{
				"currency": "XRP",
			},
			"taker_pays": map[string]string{
				"currency": x.gstdCurrency,
				"issuer":   x.gstdIssuer,
			},
			"limit": limit,
		}},
	}

	bidsResp, err := x.rpcCall(ctx, bidsBody)
	if err != nil {
		return asks, nil, err
	}

	if offers, ok := bidsResp["offers"].([]interface{}); ok {
		for _, o := range offers {
			oJSON, _ := json.Marshal(o)
			var entry XRPLOrderBookEntry
			json.Unmarshal(oJSON, &entry)
			bids = append(bids, entry)
		}
	}

	log.Printf("🔴 [XRPL] Order book: %d asks, %d bids", len(asks), len(bids))
	return asks, bids, nil
}

// =============================================================================
// XRPL RPC HELPER
// =============================================================================

func (x *XRPLDexService) rpcCall(ctx context.Context, body interface{}) (map[string]interface{}, error) {
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", x.rpcURL, strings.NewReader(string(bodyJSON)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := x.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Result map[string]interface{} `json:"result"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("parse xrpl response: %w", err)
	}

	// Check for XRPL error
	if errMsg, ok := result.Result["error"].(string); ok {
		return nil, fmt.Errorf("xrpl error: %s", errMsg)
	}

	return result.Result, nil
}
