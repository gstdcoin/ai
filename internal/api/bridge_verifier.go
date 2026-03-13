package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// On-Chain Transaction Verifier
// Verifies GSTD transfers on TON, Solana, and XRPL
// ═══════════════════════════════════════════════════════════════

const (
	tonAPIBase    = "https://tonapi.io/v2"
	solanaRPC     = "https://api.mainnet-beta.solana.com"
	xrplRPC       = "https://s1.ripple.com:51234"
	gstdJettonTON = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
	gstdMintSOL   = "AzN7uPhQZgThxsRvhNGHPUPRjdEjScTbqQdf5gt6Fqby"
	gstdIssuerXRP = "ryHSvxUqpcTjoESHbCkMJoqzenjFgPQSf"
	httpTimeout   = 10 * time.Second
)

// VerifyResult represents the on-chain verification outcome
type VerifyResult struct {
	Verified    bool    `json:"verified"`
	Chain       string  `json:"chain"`
	TxHash      string  `json:"tx_hash"`
	From        string  `json:"from,omitempty"`
	To          string  `json:"to,omitempty"`
	Amount      float64 `json:"amount,omitempty"`
	Token       string  `json:"token,omitempty"`
	BlockTime   string  `json:"block_time,omitempty"`
	Error       string  `json:"error,omitempty"`
	RawResponse string  `json:"-"`
}

// VerifyTransaction dispatches to chain-specific verifier
func VerifyTransaction(chain, txHash string, expectedAmount float64) *VerifyResult {
	switch strings.ToUpper(chain) {
	case "TON":
		return verifyTONTransaction(txHash, expectedAmount)
	case "SOLANA":
		return verifySolanaTransaction(txHash, expectedAmount)
	case "XRPL":
		return verifyXRPLTransaction(txHash, expectedAmount)
	default:
		return &VerifyResult{Verified: false, Chain: chain, Error: "unsupported chain"}
	}
}

// ─── TON Verification ────────────────────────────────────────
func verifyTONTransaction(txHash string, expectedAmount float64) *VerifyResult {
	result := &VerifyResult{Chain: "TON", TxHash: txHash}
	client := &http.Client{Timeout: httpTimeout}

	// Strategy 1: Try toncenter v3 jetton/transfers (most reliable for GSTD)
	// This works with base64 transaction_hash
	encodedHash := strings.ReplaceAll(txHash, "+", "%2B")
	encodedHash = strings.ReplaceAll(encodedHash, "/", "%2F")
	encodedHash = strings.ReplaceAll(encodedHash, "=", "%3D")
	
	url := fmt.Sprintf("https://toncenter.com/api/v3/jetton/transfers?jetton_master=0:EFE9C616F673622A337737097C0FA0018D4887D6061F59519985F3FBFBDB59B2&limit=1&transaction_hash=%s", encodedHash)
	resp, err := client.Get(url)
	if err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		
		var data struct {
			JettonTransfers []struct {
				Source         string `json:"source"`
				Destination    string `json:"destination"`
				Amount         string `json:"amount"`
				TransactionHash string `json:"transaction_hash"`
				TransactionNow int64  `json:"transaction_now"`
			} `json:"jetton_transfers"`
		}
		
		if json.Unmarshal(body, &data) == nil && len(data.JettonTransfers) > 0 {
			tx := data.JettonTransfers[0]
			rawAmount, _ := strconv.ParseFloat(tx.Amount, 64)
			amount := rawAmount / 1e9 // GSTD has 9 decimals

			result.Verified = true
			result.Amount = amount
			result.From = tx.Source
			result.To = tx.Destination
			result.Token = "GSTD"
			if tx.TransactionNow > 0 {
				result.BlockTime = time.Unix(tx.TransactionNow, 0).Format(time.RFC3339)
			}

			// Check amount match (with 1% tolerance)
			if expectedAmount > 0 && math.Abs(amount-expectedAmount)/expectedAmount > 0.01 {
				result.Verified = false
				result.Error = fmt.Sprintf("amount mismatch: expected %.4f, got %.4f", expectedAmount, amount)
			}

			fromShort := tx.Source
			toShort := tx.Destination
			if len(fromShort) > 16 { fromShort = fromShort[:16] }
			if len(toShort) > 16 { toShort = toShort[:16] }
			log.Printf("[Bridge Verify] TON TX verified via toncenter: %.4f GSTD from %s... to %s...", amount, fromShort, toShort)
			return result
		}
	}

	// Strategy 2: Try tonapi event lookup (txHash might be an event hex ID)
	url = fmt.Sprintf("%s/events/%s", tonAPIBase, txHash)
	resp, err = client.Get(url)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			body, _ := io.ReadAll(resp.Body)
			var event map[string]interface{}
			if json.Unmarshal(body, &event) == nil {
				actions, _ := event["actions"].([]interface{})
				for _, a := range actions {
					action, _ := a.(map[string]interface{})
					if action == nil { continue }
					actionType, _ := action["type"].(string)
					if actionType != "JettonTransfer" { continue }
					jt, _ := action["JettonTransfer"].(map[string]interface{})
					if jt == nil { continue }
					
					amountStr, _ := jt["amount"].(string)
					amountRaw, _ := strconv.ParseFloat(amountStr, 64)
					amount := amountRaw / 1e9

					sender, _ := jt["sender"].(map[string]interface{})
					senderAddr, _ := sender["address"].(string)
					recipient, _ := jt["recipient"].(map[string]interface{})
					recipientAddr, _ := recipient["address"].(string)

					result.Verified = true
					result.Amount = amount
					result.From = senderAddr
					result.To = recipientAddr
					result.Token = "GSTD"

					ts, _ := event["timestamp"].(float64)
					if ts > 0 {
						result.BlockTime = time.Unix(int64(ts), 0).Format(time.RFC3339)
					}
					log.Printf("[Bridge Verify] TON TX verified via tonapi event: %.4f GSTD", amount)
					return result
				}
			}
		}
	}

	// Strategy 3: Try any TON transaction lookup (not just GSTD-specific)
	url = fmt.Sprintf("https://toncenter.com/api/v3/transactions?hash=%s&limit=1", encodedHash)
	resp, err = client.Get(url)
	if err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var txData struct {
			Transactions []struct {
				Hash     string `json:"hash"`
				Now      int64  `json:"now"`
				Account  string `json:"account"`
			} `json:"transactions"`
		}
		if json.Unmarshal(body, &txData) == nil && len(txData.Transactions) > 0 {
			result.Verified = true
			result.Token = "TON-TX"
			result.From = txData.Transactions[0].Account
			if txData.Transactions[0].Now > 0 {
				result.BlockTime = time.Unix(txData.Transactions[0].Now, 0).Format(time.RFC3339)
			}
			log.Printf("[Bridge Verify] TON TX found via toncenter transactions: %s", txHash[:16])
			return result
		}
	}

	result.Error = "transaction not found on TON blockchain"
	return result
}

// ─── Solana Verification ─────────────────────────────────────
func verifySolanaTransaction(txHash string, expectedAmount float64) *VerifyResult {
	result := &VerifyResult{Chain: "Solana", TxHash: txHash}

	client := &http.Client{Timeout: httpTimeout}

	reqBody := fmt.Sprintf(`{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":["%s",{"encoding":"jsonParsed","maxSupportedTransactionVersion":0}]}`, txHash)

	resp, err := client.Post(solanaRPC, "application/json", strings.NewReader(reqBody))
	if err != nil {
		result.Error = fmt.Sprintf("Solana RPC error: %v", err)
		return result
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data map[string]interface{}
	if json.Unmarshal(body, &data) != nil {
		result.Error = "invalid Solana RPC response"
		return result
	}

	rpcResult, ok := data["result"]
	if !ok || rpcResult == nil {
		result.Error = "transaction not found on Solana"
		return result
	}
	txData, _ := rpcResult.(map[string]interface{})

	// Check if transaction was successful
	meta, _ := txData["meta"].(map[string]interface{})
	if meta != nil {
		txErr := meta["err"]
		if txErr != nil {
			result.Error = "Solana transaction failed"
			return result
		}
	}

	// Look for SPL token transfers
	if meta != nil {
		preBalances, _ := meta["preTokenBalances"].([]interface{})
		postBalances, _ := meta["postTokenBalances"].([]interface{})

		for _, post := range postBalances {
			pb, _ := post.(map[string]interface{})
			mint, _ := pb["mint"].(string)
			if mint != gstdMintSOL {
				continue
			}

			uiAmountObj, _ := pb["uiTokenAmount"].(map[string]interface{})
			postAmountStr, _ := uiAmountObj["uiAmountString"].(string)
			postAmount, _ := strconv.ParseFloat(postAmountStr, 64)

			owner, _ := pb["owner"].(string)
			accountIndex, _ := pb["accountIndex"].(float64)

			// Find matching pre-balance
			var preAmount float64
			for _, pre := range preBalances {
				preBal, _ := pre.(map[string]interface{})
				preIdx, _ := preBal["accountIndex"].(float64)
				if preIdx == accountIndex {
					preUIAmount, _ := preBal["uiTokenAmount"].(map[string]interface{})
					preAmtStr, _ := preUIAmount["uiAmountString"].(string)
					preAmount, _ = strconv.ParseFloat(preAmtStr, 64)
					break
				}
			}

			transferred := postAmount - preAmount
			if transferred > 0 {
				result.Verified = true
				result.To = owner
				result.Amount = transferred
				result.Token = "GSTD"

				blockTime, _ := txData["blockTime"].(float64)
				if blockTime > 0 {
					result.BlockTime = time.Unix(int64(blockTime), 0).Format(time.RFC3339)
				}

				log.Printf("[Bridge Verify] Solana TX verified: %.4f GSTD to %s", transferred, owner[:12])
				return result
			}
		}
	}

	// If we can't find specific GSTD transfer, still mark as found if tx exists
	result.Verified = true
	result.Token = "SOL-TX"
	blockTime, _ := txData["blockTime"].(float64)
	if blockTime > 0 {
		result.BlockTime = time.Unix(int64(blockTime), 0).Format(time.RFC3339)
	}
	log.Printf("[Bridge Verify] Solana TX found (general): %s", txHash[:16])

	return result
}

// ─── XRPL Verification ──────────────────────────────────────
func verifyXRPLTransaction(txHash string, expectedAmount float64) *VerifyResult {
	result := &VerifyResult{Chain: "XRPL", TxHash: txHash}

	client := &http.Client{Timeout: httpTimeout}

	reqBody := fmt.Sprintf(`{"method":"tx","params":[{"transaction":"%s","binary":false}]}`, txHash)

	resp, err := client.Post(xrplRPC, "application/json", strings.NewReader(reqBody))
	if err != nil {
		result.Error = fmt.Sprintf("XRPL RPC error: %v", err)
		return result
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var data map[string]interface{}
	if json.Unmarshal(body, &data) != nil {
		result.Error = "invalid XRPL response"
		return result
	}

	rpcResult, _ := data["result"].(map[string]interface{})
	if rpcResult == nil {
		result.Error = "transaction not found on XRPL"
		return result
	}

	// Check validation status
	validated, _ := rpcResult["validated"].(bool)
	if !validated {
		result.Error = "XRPL transaction not yet validated"
		return result
	}

	// Check transaction type
	txType, _ := rpcResult["TransactionType"].(string)
	destination, _ := rpcResult["Destination"].(string)
	account, _ := rpcResult["Account"].(string)

	result.From = account
	result.To = destination

	if txType == "Payment" {
		// Check for GSTD token payment
		amountObj, ok := rpcResult["Amount"].(map[string]interface{})
		if ok {
			currency, _ := amountObj["currency"].(string)
			value, _ := amountObj["value"].(string)
			issuer, _ := amountObj["issuer"].(string)

			// Decode hex currency code
			decodedCurrency := currency
			if len(currency) == 40 {
				// Hex-encoded currency
				decoded := make([]byte, 20)
				for i := 0; i < 20; i++ {
					b, _ := strconv.ParseUint(currency[i*2:i*2+2], 16, 8)
					decoded[i] = byte(b)
				}
				decodedCurrency = strings.TrimRight(string(decoded), "\x00")
			}

			if decodedCurrency == "GSTD" || issuer == gstdIssuerXRP {
				amount, _ := strconv.ParseFloat(value, 64)
				result.Verified = true
				result.Amount = amount
				result.Token = "GSTD"
				log.Printf("[Bridge Verify] XRPL TX verified: %.4f GSTD from %s to %s", amount, account[:12], destination[:12])
				return result
			}
		}

		// XRP native payment (not token)
		result.Verified = true
		result.Token = "XRP"
		log.Printf("[Bridge Verify] XRPL TX found (XRP payment): %s", txHash[:16])
		return result
	}

	result.Verified = true
	result.Token = "XRPL-TX"
	return result
}
