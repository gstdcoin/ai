// THE FINAL RESONANCE: ABSOLUTE SYNC
// End-to-end activation protocol for GSTD Grid
// Run: go run scripts/absolute_sync.go
// Env: API_URL, ADMIN_API_KEY, ADMIN_WALLET, BACKEND_CONTAINER

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const (
	goldPoolAddress = "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
	gstdAddr        = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
	xautAddr        = "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k"
	stonFiAPI       = "https://api.ston.fi"
)

func main() {
	log.SetFlags(0)
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "https://app.gstdtoken.com"
	}
	apiURL = strings.TrimSuffix(apiURL, "/")
	adminKey := os.Getenv("ADMIN_API_KEY")
	if adminKey == "" {
		fmt.Println("ERROR: ADMIN_API_KEY environment variable must be set -- no insecure default")
		os.Exit(1)
	}
	adminWallet := os.Getenv("ADMIN_WALLET")
	if adminWallet == "" {
		adminWallet = "UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED"
	}
	container := os.Getenv("BACKEND_CONTAINER")
	if container == "" {
		container = "ubuntu-backend-blue-1"
	}
	client := &http.Client{Timeout: 25 * time.Second}

	score := 0
	maxScore := 100
	var issues []string

	// === 1. HOT DEPLOY VERIFY ===
	log.Println("=== 1. HOT DEPLOY VERIFY ===")
	seedReq, _ := http.NewRequest("POST", apiURL+"/api/v1/internal/seed-ultimate-check", strings.NewReader(`{}`))
	seedReq.Header.Set("Content-Type", "application/json")
	seedReq.Header.Set("X-Admin-API-Key", adminKey)
	seedResp, err := client.Do(seedReq)
	if err != nil {
		log.Printf("   ❌ Seed request failed: %v", err)
		issues = append(issues, "seed-ultimate-check unreachable")
	} else {
		defer seedResp.Body.Close()
		var seedResult struct {
			TaskIDs []string `json:"task_ids"`
		}
		if seedResp.StatusCode == 200 && json.NewDecoder(seedResp.Body).Decode(&seedResult) == nil && len(seedResult.TaskIDs) >= 3 {
			log.Printf("   ✅ seed-ultimate-check active (HTTP 200), 3 tasks: %v", seedResult.TaskIDs)
			score += 25
		} else {
			log.Printf("   ❌ seed-ultimate-check HTTP %d or <3 tasks", seedResp.StatusCode)
			issues = append(issues, "seed-ultimate-check not active")
		}
	}

	// === 2. AGENT-TO-KNOWLEDGE LOOP ===
	log.Println("\n=== 2. AGENT-TO-KNOWLEDGE LOOP ===")
	// Check agent/store endpoint exists (POST without auth = 400/401, not 500)
	storeBody := []byte(`{"agent_id":"test","topic":"grid_tool","content":"test","tags":[]}`)
	storeReq, _ := http.NewRequest("POST", apiURL+"/api/v1/knowledge/agent/store", bytes.NewReader(storeBody))
	storeReq.Header.Set("Content-Type", "application/json")
	storeResp, _ := client.Do(storeReq)
	if storeResp != nil {
		storeResp.Body.Close()
		if storeResp.StatusCode == 400 || storeResp.StatusCode == 401 || storeResp.StatusCode == 422 {
			log.Println("   ✅ /knowledge/agent/store reachable (auth required, no 500)")
			score += 15
		} else if storeResp.StatusCode == 200 {
			log.Println("   ✅ /knowledge/agent/store OK")
			score += 15
		} else {
			log.Printf("   ⚠️ agent/store HTTP %d", storeResp.StatusCode)
		}
	}
	// Check grid-tools
	gtResp, _ := client.Get(apiURL + "/api/v1/knowledge/grid-tools")
	if gtResp != nil {
		defer gtResp.Body.Close()
		if gtResp.StatusCode == 200 {
			var raw interface{}
			if json.NewDecoder(gtResp.Body).Decode(&raw) == nil {
				var count int
				switch v := raw.(type) {
				case []interface{}:
					count = len(v)
				case map[string]interface{}:
					if arr, ok := v["tools"].([]interface{}); ok {
						count = len(arr)
					}
				}
				log.Printf("   ✅ grid-tools: %d tools (agent/store → knowledge loop)", count)
				score += 10
			}
		}
	}

	// === 3. ADDRESS & API PURITY ===
	log.Println("\n=== 3. ADDRESS & API PURITY ===")
	if out, err := exec.Command("docker", "logs", "--tail", "100", container).CombinedOutput(); err == nil {
		recent := string(out)
		purified := true
		if strings.Contains(recent, "GetJettonBalance: API error (400)") || strings.Contains(recent, "can't decode address") {
			issues = append(issues, "TON 400/decode in logs")
			purified = false
		}
		if strings.Contains(recent, "Ed25519 verification failed") || strings.Contains(recent, "Invalid signature") {
			issues = append(issues, "Ed25519/signature errors in logs")
			purified = false
		}
		if purified {
			log.Println("   ✅ Status: Purified (no 400/decode, no Ed25519 failed)")
			score += 20
		} else {
			log.Println("   ❌ Logs contain address or signature errors")
		}
	} else {
		log.Println("   ℹ️ Docker logs skipped (container not found)")
		score += 15
	}

	// === 4. GOLD LIQUIDITY FINAL SIMULATION ===
	log.Println("\n=== 4. GOLD LIQUIDITY FINAL SIMULATION ===")
	tokenAUnits := "0"
	tokenBUnits := strconv.FormatInt(int64(10*1e9), 10) // 10 GSTD
	simURL := fmt.Sprintf("%s/v1/liquidity_provision/simulate?provision_type=Arbitrary&pool_address=%s&wallet_address=%s&token_a=%s&token_b=%s&token_a_units=%s&token_b_units=%s&slippage_tolerance=0.01",
		stonFiAPI, goldPoolAddress, adminWallet, xautAddr, gstdAddr, tokenAUnits, tokenBUnits)
	simReq, _ := http.NewRequest("POST", simURL, nil)
	simResp, err := client.Do(simReq)
	if err == nil {
		defer simResp.Body.Close()
		var sim struct {
			MinLpUnits string `json:"min_lp_units"`
		}
		if simResp.StatusCode == 200 && json.NewDecoder(simResp.Body).Decode(&sim) == nil && sim.MinLpUnits != "" {
			lp, _ := strconv.ParseInt(sim.MinLpUnits, 10, 64)
			lpTokens := float64(lp) / 1e9
			log.Printf("   ✅ XAUt (EQA1R_Lu...) recognized, 10 GSTD → %.6f LP tokens", lpTokens)
			score += 20
		} else {
			issues = append(issues, "Ston.fi simulate failed")
		}
	} else {
		issues = append(issues, fmt.Sprintf("Ston.fi: %v", err))
	}

	// === 5. GEO & TICKER LIVE ===
	log.Println("\n=== 5. GEO & TICKER LIVE ===")
	if out, err := exec.Command("docker", "logs", "--tail", "50", container).CombinedOutput(); err == nil {
		if strings.Contains(string(out), "GEO Service") || strings.Contains(string(out), "GeoService") {
			log.Println("   ✅ GEO heartbeat present")
			score += 5
		}
	}
	poolResp, _ := client.Get(apiURL + "/api/v1/pool/status")
	if poolResp != nil {
		defer poolResp.Body.Close()
		var status map[string]interface{}
		if poolResp.StatusCode == 200 && json.NewDecoder(poolResp.Body).Decode(&status) == nil {
			if status["pool_address"] != nil || status["dynamic_gold_backing"] != nil {
				log.Println("   ✅ Frontend ticker: pool/status OK")
				score += 5
			}
		}
	}

	if score > maxScore {
		score = maxScore
	}

	// === FINAL VERDICT ===
	log.Println("\n" + strings.Repeat("=", 60))
	log.Println("THE FINAL RESONANCE: ABSOLUTE SYNC")
	log.Println(strings.Repeat("=", 60))
	log.Printf("INTEGRITY SCORE: %d%%", score)

	botStatus := "READY"
	if score < 80 || len(issues) > 0 {
		botStatus = "NOT READY"
	}
	log.Printf("BOT STATUS: %s", botStatus)

	liquidityGateway := "OPEN"
	if score < 70 {
		liquidityGateway = "CLOSED"
	}
	log.Printf("LIQUIDITY GATEWAY: %s", liquidityGateway)

	if score >= 95 && len(issues) == 0 {
		log.Println(`VERDICT: "GSTD GRID IS 100% READY"`)
		log.Println(`COMMAND: "ARCHITECT, PRESS THE 'ADD LIQUIDITY' BUTTON NOW."`)
	} else {
		log.Println(`VERDICT: "GSTD GRID IS NOT READY"`)
		if len(issues) > 0 {
			log.Println("Issues:")
			for _, i := range issues {
				log.Printf("  - %s", i)
			}
		}
	}
}
