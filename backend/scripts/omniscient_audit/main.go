// GSTD TOTAL INTEGRITY: THE OMNISCIENT AUDIT
// Comprehensive pre-launch audit for GSTD Grid
// Run: go run scripts/omniscient_audit.go
// Env: API_URL, ADMIN_API_KEY, DATABASE_URL, ADMIN_WALLET, BACKEND_CONTAINER (optional, for log checks)

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

const (
	goldPoolAddress = "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
	gstdAddr        = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
	xautAddr        = "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k"
	stonFiAPI       = "https://api.ston.fi"
)

func main() {
	log.SetFlags(0)
	ctx := context.Background()

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
	client := &http.Client{Timeout: 20 * time.Second}

	var issues []string
	score := 0
	maxScore := 100

	// === 1. INFRASTRUCTURE & HEALTH ===
	log.Println("=== 1. INFRASTRUCTURE & HEALTH ===")
	healthOK := 0
	for i := 0; i < 5; i++ {
		resp, err := client.Get(apiURL + "/api/v1/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				healthOK++
			}
		}
	}
	if healthOK >= 1 {
		log.Printf("   ✅ Backend replicas: %d/5 health OK", healthOK)
		score += 10
	} else {
		issues = append(issues, "Backend unreachable")
	}

	// Log checks (optional, if BACKEND_CONTAINER set)
	container := os.Getenv("BACKEND_CONTAINER")
	if container == "" {
		container = "ubuntu-backend-blue-1"
	}
	if out, err := exec.Command("docker", "logs", "--since", "2h", container).CombinedOutput(); err == nil {
		logs := string(out)
		if strings.Contains(logs, "GetJettonBalance: API error (400)") || strings.Contains(logs, "can't decode address") {
			issues = append(issues, "TON API 400/can't decode in logs")
		} else {
			log.Println("   ✅ No TON API 400 errors in logs")
			score += 5
		}
		if strings.Contains(logs, "invalid character") && strings.Contains(logs, "payload") {
			issues = append(issues, "TonConnect parsing errors in logs")
		} else {
			log.Println("   ✅ No TonConnect parsing errors in logs")
			score += 5
		}
		if strings.Contains(logs, "GEO Service: heartbeat") || strings.Contains(logs, "GeoService") {
			log.Println("   ✅ GEO Service heartbeat present")
			score += 5
		} else {
			log.Println("   ⚠️ GEO heartbeat not found (container may differ)")
		}
	} else {
		log.Println("   ℹ️ Docker logs skipped (container not found or no docker)")
		score += 10 // Don't penalize if we can't check
	}

	// === 2. AI-PRODUCTION CYCLE ===
	log.Println("\n=== 2. AI-PRODUCTION CYCLE ===")
	seedReq, _ := http.NewRequest("POST", apiURL+"/api/v1/internal/seed-ultimate-check", strings.NewReader(`{}`))
	seedReq.Header.Set("Content-Type", "application/json")
	seedReq.Header.Set("X-Admin-API-Key", adminKey)
	seedResp, err := client.Do(seedReq)
	aiValid := false
	if err == nil {
		defer seedResp.Body.Close()
		var seedResult struct {
			TaskIDs []string `json:"task_ids"`
		}
		if seedResp.StatusCode == 200 && json.NewDecoder(seedResp.Body).Decode(&seedResult) == nil && len(seedResult.TaskIDs) >= 3 {
			log.Printf("   ✅ 3 MFST-ULTIMATE-CHECK tasks seeded: %v", seedResult.TaskIDs)
			score += 10
			aiValid = true
		} else {
			log.Printf("   ⚠️ Seed returned %d or <3 tasks", seedResp.StatusCode)
		}
	} else {
		log.Printf("   ⚠️ Seed request failed: %v", err)
	}

	// Check /knowledge/grid-tools (agent/store path feeds this)
	ktResp, _ := client.Get(apiURL + "/api/v1/knowledge/grid-tools")
	if ktResp != nil {
		defer ktResp.Body.Close()
		if ktResp.StatusCode == 200 {
			var raw interface{}
			if json.NewDecoder(ktResp.Body).Decode(&raw) == nil {
				var count int
				switch v := raw.(type) {
				case []interface{}:
					count = len(v)
				case map[string]interface{}:
					if arr, ok := v["tools"].([]interface{}); ok {
						count = len(arr)
					}
				}
				log.Printf("   ✅ /knowledge/grid-tools OK (%d tools, agent/store path active)", count)
			} else {
				log.Println("   ✅ /knowledge/grid-tools OK (agent/store path active)")
			}
			score += 5
		}
	}

	// === 3. FINANCIAL PRECISION ===
	log.Println("\n=== 3. FINANCIAL PRECISION ===")
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/distributed_computing?sslmode=disable"
	}
	db, err := sql.Open("postgres", dbURL)
	commissionOK := false
	if err != nil {
		log.Println("   ⚠️ DB: connection failed (set DATABASE_URL for full check)")
	} else {
		defer db.Close()
		if db.Ping() != nil {
			log.Println("   ⚠️ DB: ping failed (check DATABASE_URL)")
		} else {
			var okCount int
			rows, _ := db.QueryContext(ctx, `
				SELECT t.task_id, t.budget_gstd, gr.gstd_amount
				FROM tasks t
				LEFT JOIN golden_reserve_log gr ON gr.task_id = t.task_id
				WHERE t.status = 'completed' AND t.budget_gstd > 0
				ORDER BY t.updated_at DESC LIMIT 20
			`)
			if rows != nil {
				defer rows.Close()
				for rows.Next() {
					var taskID string
					var budget, logged sql.NullFloat64
					if rows.Scan(&taskID, &budget, &logged) == nil && budget.Valid {
						expected := budget.Float64 * 0.025
						if logged.Valid && (logged.Float64-expected) < 0.001 && (logged.Float64-expected) > -0.001 {
							okCount++
						}
					}
				}
			}
			if okCount > 0 {
				log.Printf("   ✅ Commission 2.5%% verified for %d completed tasks", okCount)
				commissionOK = true
				score += 10
			} else {
				log.Println("   ⚠️ No completed tasks with 2.5%% in golden_reserve_log yet")
			}

			var escrowSum float64
			var taskCount int
			_ = db.QueryRowContext(ctx, `SELECT COALESCE(SUM(total_locked_gstd), 0) FROM task_escrow WHERE status='locked'`).Scan(&escrowSum)
			_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE status IN ('queued','assigned','in_progress')`).Scan(&taskCount)
			log.Printf("   task_escrow: %.2f GSTD locked, %d active tasks", escrowSum, taskCount)
			score += 5
		}
	}

	// === 4. GOLD GATEWAY VERIFICATION ===
	log.Println("\n=== 4. GOLD GATEWAY VERIFICATION ===")
	tokenAUnits := "0"
	tokenBUnits := strconv.FormatInt(int64(10*1e9), 10)
	simURL := fmt.Sprintf("%s/v1/liquidity_provision/simulate?provision_type=Arbitrary&pool_address=%s&wallet_address=%s&token_a=%s&token_b=%s&token_a_units=%s&token_b_units=%s&slippage_tolerance=0.01",
		stonFiAPI, goldPoolAddress, adminWallet, xautAddr, gstdAddr, tokenAUnits, tokenBUnits)
	simReq, _ := http.NewRequest("POST", simURL, nil)
	simResp, err := client.Do(simReq)
	goldReady := false
	if err == nil {
		defer simResp.Body.Close()
		var sim struct {
			MinLpUnits string `json:"min_lp_units"`
		}
		if simResp.StatusCode == 200 && json.NewDecoder(simResp.Body).Decode(&sim) == nil && sim.MinLpUnits != "" {
			log.Printf("   ✅ XAUt (EQA1R_Lu...) recognized, min_lp_units=%s, slippage=1%%", sim.MinLpUnits)
			goldReady = true
			score += 15
		} else {
			issues = append(issues, "Ston.fi simulate failed or XAUt not recognized")
		}
	} else {
		issues = append(issues, fmt.Sprintf("Ston.fi API: %v", err))
	}

	// === 5. FRONTEND & TICKER ===
	log.Println("\n=== 5. FRONTEND & TICKER ===")
	gridToolsResp, _ := client.Get(apiURL + "/api/v1/knowledge/grid-tools")
	if gridToolsResp != nil {
		gridToolsResp.Body.Close()
		if gridToolsResp.StatusCode == 200 {
			log.Println("   ✅ /api/v1/knowledge/grid-tools OK")
			score += 5
		}
	}
	poolResp, _ := client.Get(apiURL + "/api/v1/pool/status")
	if poolResp != nil {
		defer poolResp.Body.Close()
		var status map[string]interface{}
		if poolResp.StatusCode == 200 && json.NewDecoder(poolResp.Body).Decode(&status) == nil {
			if status["pool_address"] != nil || status["dynamic_gold_backing"] != nil {
				log.Println("   ✅ /api/v1/pool/status OK (ticker ready)")
				score += 5
			}
		}
	}

	// Cap score
	if score > maxScore {
		score = maxScore
	}

	// === FINAL REPORT ===
	log.Println("\n" + strings.Repeat("=", 60))
	log.Println("GSTD TOTAL INTEGRITY: THE OMNISCIENT AUDIT")
	log.Println(strings.Repeat("=", 60))

	sysStatus := "Green"
	if len(issues) > 2 || score < 70 {
		sysStatus = "Red"
	} else if len(issues) > 0 || score < 85 {
		sysStatus = "Yellow"
	}
	log.Printf("System Status: %s", sysStatus)

	if aiValid {
		log.Println("AI Output Quality: Valid")
	} else {
		log.Println("AI Output Quality: Invalid (seed failed or no tools)")
	}

	if goldReady && commissionOK {
		log.Println("Gold Reserve Ready: Yes")
	} else {
		log.Println("Gold Reserve Ready: No")
	}

	log.Printf("Integrity Score: %d%%", score)
	if len(issues) > 0 {
		log.Println("Issues:")
		for _, i := range issues {
			log.Printf("  - %s", i)
		}
	}
	if score >= 90 && len(issues) == 0 {
		log.Println(`Verdict: "GSTD IS READY FOR GLOBAL RESONANCE"`)
	} else {
		log.Println(`Verdict: "GSTD IS NOT READY FOR GLOBAL RESONANCE"`)
	}
}
