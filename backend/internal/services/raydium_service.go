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

// =============================================================================
// RAYDIUM DEX SERVICE — Solana AMM Integration for GSTD Bridge
// Uses Raydium API for swap quotes and pool data
// =============================================================================

// RaydiumService provides Solana DEX operations via Raydium AMM
type RaydiumService struct {
	httpClient *http.Client
	apiBase    string        // Raydium public API
	rpcURL     string        // Solana RPC endpoint
	gstdMint   string        // GSTD SPL Token mint address
	solMint    string        // Wrapped SOL mint
}

// RaydiumPool represents a Raydium pool
type RaydiumPool struct {
	ID         string  `json:"id"`
	MintA      string  `json:"mintA"`
	MintB      string  `json:"mintB"`
	TVL        float64 `json:"tvl"`
	Volume24h  float64 `json:"volume24h"`
	FeeRate    float64 `json:"feeRate"`
	APR        float64 `json:"apr"`
	PoolType   string  `json:"type"` // "Standard", "Concentrated"
}

// RaydiumSwapQuote represents a swap quote
type RaydiumSwapQuote struct {
	InputMint    string  `json:"inputMint"`
	OutputMint   string  `json:"outputMint"`
	InAmount     string  `json:"inAmount"`
	OutAmount    string  `json:"outAmount"`
	MinOutAmount string  `json:"minOutAmount"`
	PriceImpact  float64 `json:"priceImpact"`
	Fee          string  `json:"fee"`
	Route        string  `json:"route"`
}

// RaydiumTokenPrice represents token price info
type RaydiumTokenPrice struct {
	Mint      string  `json:"mint"`
	Price     float64 `json:"price"`
	Change24h float64 `json:"change24h"`
}

// Wrapped SOL mint address (constant on Solana)
const WrappedSOLMint = "So11111111111111111111111111111111111111112"

// NewRaydiumService creates a new Raydium DEX service
func NewRaydiumService(
	solanaRPC string,
	gstdMint string,
) *RaydiumService {
	if solanaRPC == "" {
		solanaRPC = "https://api.mainnet-beta.solana.com"
	}

	return &RaydiumService{
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
		apiBase:  "https://api-v3.raydium.io",
		rpcURL:   solanaRPC,
		gstdMint: gstdMint,
		solMint:  WrappedSOLMint,
	}
}

// =============================================================================
// SWAP QUOTES
// =============================================================================

// GetSwapQuote gets a swap quote from Raydium API
func (r *RaydiumService) GetSwapQuote(ctx context.Context, inputMint, outputMint string, amountRaw int64, slippageBps int) (*RaydiumSwapQuote, error) {
	log.Printf("🟣 [Raydium] Quote: %d of %s → %s (slippage: %d bps)",
		amountRaw, inputMint[:8], outputMint[:8], slippageBps)

	if slippageBps == 0 {
		slippageBps = 100 // Default 1% slippage
	}

	url := fmt.Sprintf(
		"%s/compute/swap-base-in?inputMint=%s&outputMint=%s&amount=%d&slippageBps=%d",
		r.apiBase, inputMint, outputMint, amountRaw, slippageBps,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("request build failed: %w", err)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("raydium api error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("raydium api status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Success bool              `json:"success"`
		Data    *RaydiumSwapQuote `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	if !result.Success || result.Data == nil {
		return nil, fmt.Errorf("raydium returned no quote")
	}

	log.Printf("🟣 [Raydium] Quote result: %s → %s (impact: %.4f%%)",
		result.Data.InAmount, result.Data.OutAmount, result.Data.PriceImpact)

	return result.Data, nil
}

// GetGSTDSolQuote convenience: GSTD → SOL quote
func (r *RaydiumService) GetGSTDSolQuote(ctx context.Context, gstdAmountNano int64) (*RaydiumSwapQuote, error) {
	return r.GetSwapQuote(ctx, r.gstdMint, r.solMint, gstdAmountNano, 100)
}

// GetSolGSTDQuote convenience: SOL → GSTD quote
func (r *RaydiumService) GetSolGSTDQuote(ctx context.Context, solLamports int64) (*RaydiumSwapQuote, error) {
	return r.GetSwapQuote(ctx, r.solMint, r.gstdMint, solLamports, 100)
}

// =============================================================================
// POOL DATA
// =============================================================================

// GetGSTDPool fetches GSTD/SOL pool info from Raydium
func (r *RaydiumService) GetGSTDPool(ctx context.Context) (*RaydiumPool, error) {
	url := fmt.Sprintf(
		"%s/pools/info/mint?mint1=%s&mint2=%s&poolType=all&poolSortField=liquidity&sortType=desc&pageSize=1&page=1",
		r.apiBase, r.gstdMint, r.solMint,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("raydium pool api: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Success bool `json:"success"`
		Data    struct {
			Data []RaydiumPool `json:"data"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	if !result.Success || len(result.Data.Data) == 0 {
		return nil, fmt.Errorf("no GSTD/SOL pool found on Raydium")
	}

	pool := &result.Data.Data[0]
	log.Printf("🟣 [Raydium] Pool %s: TVL=$%.2f, Vol24h=$%.2f, APR=%.2f%%",
		pool.ID, pool.TVL, pool.Volume24h, pool.APR)
	return pool, nil
}

// =============================================================================
// PRICE DATA
// =============================================================================

// GetGSTDPrice gets GSTD token price from Raydium
func (r *RaydiumService) GetGSTDPrice(ctx context.Context) (*RaydiumTokenPrice, error) {
	url := fmt.Sprintf("%s/mint/price?mints=%s", r.apiBase, r.gstdMint)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("raydium price api: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Success bool               `json:"success"`
		Data    map[string]float64 `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	price, ok := result.Data[r.gstdMint]
	if !ok {
		return nil, fmt.Errorf("GSTD price not found")
	}

	return &RaydiumTokenPrice{
		Mint:  r.gstdMint,
		Price: price,
	}, nil
}

// =============================================================================
// SOLANA RPC HELPERS
// =============================================================================

// GetSPLBalance gets GSTD SPL token balance for an address
func (r *RaydiumService) GetSPLBalance(ctx context.Context, ownerAddress string) (int64, error) {
	body := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "getTokenAccountsByOwner",
		"params": []interface{}{
			ownerAddress,
			map[string]string{"mint": r.gstdMint},
			map[string]string{"encoding": "jsonParsed"},
		},
	}

	bodyJSON, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", r.rpcURL, 
		io.NopCloser(jsonReader(bodyJSON)))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("solana rpc error: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Result struct {
			Value []struct {
				Account struct {
					Data struct {
						Parsed struct {
							Info struct {
								TokenAmount struct {
									Amount string `json:"amount"`
								} `json:"tokenAmount"`
							} `json:"info"`
						} `json:"parsed"`
					} `json:"data"`
				} `json:"account"`
			} `json:"value"`
		} `json:"result"`
	}

	if err := json.Unmarshal(respBody, &result); err != nil {
		return 0, err
	}

	if len(result.Result.Value) == 0 {
		return 0, nil
	}

	amount, err := strconv.ParseInt(result.Result.Value[0].Account.Data.Parsed.Info.TokenAmount.Amount, 10, 64)
	if err != nil {
		return 0, err
	}
	return amount, nil
}

// jsonReader creates a reader from JSON bytes
func jsonReader(data []byte) io.Reader {
	return io.NopCloser(
		func() io.Reader {
			return io.LimitReader(
				func() io.Reader {
					r, w := io.Pipe()
					go func() {
						_, _ = w.Write(data)
						w.Close()
					}()
					return r
				}(),
				int64(len(data)),
			)
		}(),
	)
}
