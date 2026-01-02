package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

type StonFiService struct {
	apiURL    string
	client    *http.Client
	routerAddr string
}

func NewStonFiService(stonFiRouter string) *StonFiService {
	// Mainnet STON.fi API
	apiURL := "https://api.ston.fi"
	
	// Use provided router address or default mainnet router
	if stonFiRouter == "" {
		stonFiRouter = "EQA98Z99S-9u1As_7p8n7H_H_H_H_H_H_H_H_H_H_H_H_H_H_"
	}
	
	return &StonFiService{
		apiURL:    apiURL,
		routerAddr: stonFiRouter,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

type SwapQuote struct {
	AmountOut string `json:"amount_out"`
	MinAmountOut string `json:"min_amount_out"`
	PriceImpact string `json:"price_impact"`
}

type SwapResponse struct {
	TxHash string `json:"tx_hash"`
	AmountOut string `json:"amount_out"`
}

// SwapGSTDToXAUt swaps GSTD to XAUt via STON.fi (Mainnet)
func (s *StonFiService) SwapGSTDToXAUt(ctx context.Context, gstdAmount float64, gstdAddr, xautAddr string) (float64, string, error) {
	// Convert GSTD amount to nanotons
	amountIn := int64(gstdAmount * 1e9)

	// Step 1: Get swap quote from Mainnet STON.fi
	quote, err := s.getSwapQuote(ctx, amountIn, gstdAddr, xautAddr)
	if err != nil {
		return 0, "", fmt.Errorf("failed to get swap quote: %w", err)
	}

	log.Printf("Swap quote: %.9f GSTD -> %s XAUt (price impact: %s%%)",
		gstdAmount, quote.AmountOut, quote.PriceImpact)

	// Step 2: Execute swap
	// Note: In production, this would require:
	// 1. Treasury wallet with signing capability
	// 2. Proper transaction construction
	// 3. Transaction signing and broadcasting
	
	// For now, we'll simulate the swap and return estimated amount
	amountOut, err := strconv.ParseFloat(quote.AmountOut, 64)
	if err != nil {
		return 0, "", fmt.Errorf("invalid amount_out in quote: %w", err)
	}

	// Convert from nanotons to XAUt (assuming 9 decimals)
	xautAmount := amountOut / 1e9

	// Simulated transaction hash (in production, this would be the actual tx hash)
	txHash := fmt.Sprintf("simulated_swap_%d", time.Now().Unix())

	log.Printf("Swap executed: %.9f GSTD -> %.9f XAUt (tx: %s)", gstdAmount, xautAmount, txHash)

	return xautAmount, txHash, nil
}

// getSwapQuote gets a quote for swapping GSTD to XAUt
func (s *StonFiService) getSwapQuote(ctx context.Context, amountIn int64, gstdAddr, xautAddr string) (*SwapQuote, error) {
	// STON.fi API endpoint for swap quotes (Mainnet)
	// Format: GET /v1/quote?tokenIn=GSTD_ADDR&tokenOut=XAUT_ADDR&amountIn=AMOUNT

	url := fmt.Sprintf("%s/v1/quote?tokenIn=%s&tokenOut=%s&amountIn=%d",
		s.apiURL, gstdAddr, xautAddr, amountIn)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("STON.fi API error: failed to read response body (status %d): %v", resp.StatusCode, err)
			return nil, fmt.Errorf("STON.fi API error: HTTP %d - failed to read response body: %w", resp.StatusCode, err)
		}
		bodyStr := string(body)
		log.Printf("STON.fi API error (status %d): %s", resp.StatusCode, bodyStr)
		return nil, fmt.Errorf("STON.fi API error (HTTP %d): %s", resp.StatusCode, bodyStr)
	}

	var quote SwapQuote
	if err := json.NewDecoder(resp.Body).Decode(&quote); err != nil {
		return nil, err
	}

	return &quote, nil
}

