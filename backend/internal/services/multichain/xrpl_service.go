package multichain

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
)

// XRPLService manages institutional payment gateway
type XRPLService interface {
	SubmitPayment(ctx context.Context, fromAddr, secret, toAddr, amount, memo string) (string, error)
	CreateEscrow(ctx context.Context, fromAddr, secret, toAddr, amount string, finishAfter int64) (string, error)
	GetTrustLine(ctx context.Context, account, issuer string) (float64, error)
}

// XRPLServiceImpl implements real JSON-RPC interactions with XRPL
type XRPLServiceImpl struct {
	RPCURL string
	Client *http.Client
}

func NewXRPLService(url string) *XRPLServiceImpl {
	if url == "" {
		url = "https://s1.ripple.com:51234/"
	}
	return &XRPLServiceImpl{
		RPCURL: url,
		Client: &http.Client{},
	}
}

// xrplRequest executes a JSON-RPC request to the XRPL node
func (s *XRPLServiceImpl) xrplRequest(ctx context.Context, method string, params []interface{}) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"method": method,
		"params": params,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.RPCURL, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if result["result"] != nil {
		resMap := result["result"].(map[string]interface{})
		if resMap["error"] != nil {
			return nil, fmt.Errorf("XRPL error: %v", resMap["error_message"])
		}
		return resMap, nil
	}
	return nil, fmt.Errorf("invalid response from XRPL")
}

func (s *XRPLServiceImpl) SubmitPayment(ctx context.Context, fromAddr, secret, toAddr, amountStr, memoStr string) (string, error) {
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %w", err)
	}
	drops := int64(amount * 1_000_000)

	txJSON := map[string]interface{}{
		"TransactionType": "Payment",
		"Account":         fromAddr,
		"Destination":     toAddr,
		"Amount":          fmt.Sprintf("%d", drops),
	}

	if memoStr != "" {
		txJSON["Memos"] = []map[string]interface{}{
			{
				"Memo": map[string]interface{}{
					"MemoData": memoStr,
				},
			},
		}
	}

	// Submit via sign_and_submit (requires node with admin access or standalone signer)
	params := []interface{}{
		map[string]interface{}{
			"secret":  secret,
			"tx_json": txJSON,
		},
	}

	res, err := s.xrplRequest(ctx, "submit", params)
	if err != nil {
		return "", err
	}

	engineResult := res["engine_result"].(string)
	if engineResult != "tesSUCCESS" {
		return "", fmt.Errorf("payment failed: %s (%s)", engineResult, res["engine_result_message"])
	}

	txBlob := res["tx_json"].(map[string]interface{})
	return txBlob["hash"].(string), nil
}

func (s *XRPLServiceImpl) CreateEscrow(ctx context.Context, fromAddr, secret, toAddr, amountStr string, finishAfter int64) (string, error) {
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %w", err)
	}
	drops := int64(amount * 1_000_000)

	// Ripple epoch starts Jan 1, 2000
	rippleEpochOffset := int64(946684800)
	finishAfterRipple := finishAfter - rippleEpochOffset

	txJSON := map[string]interface{}{
		"TransactionType": "EscrowCreate",
		"Account":         fromAddr,
		"Destination":     toAddr,
		"Amount":          fmt.Sprintf("%d", drops),
		"FinishAfter":     finishAfterRipple,
	}

	params := []interface{}{
		map[string]interface{}{
			"secret":  secret,
			"tx_json": txJSON,
		},
	}

	res, err := s.xrplRequest(ctx, "submit", params)
	if err != nil {
		return "", err
	}

	engineResult := res["engine_result"].(string)
	if engineResult != "tesSUCCESS" {
		return "", fmt.Errorf("escrow creation failed: %s (%s)", engineResult, res["engine_result_message"])
	}

	txBlob := res["tx_json"].(map[string]interface{})
	return txBlob["hash"].(string), nil
}

func (s *XRPLServiceImpl) GetTrustLine(ctx context.Context, account, issuer string) (float64, error) {
	params := []interface{}{
		map[string]interface{}{
			"account": account,
			"peer":    issuer,
		},
	}

	res, err := s.xrplRequest(ctx, "account_lines", params)
	if err != nil {
		return 0, err
	}

	lines, ok := res["lines"].([]interface{})
	if !ok {
		return 0, nil
	}

	for _, lineIface := range lines {
		line := lineIface.(map[string]interface{})
		if line["currency"] == "GSTD" {
			balanceStr := line["balance"].(string)
			val, _ := strconv.ParseFloat(balanceStr, 64)
			return val, nil
		}
	}

	return 0, nil
}
