package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

func main() {
	// Configuration (targeting Backend directly on its internal IP)
	baseURL := "http://172.18.0.6:8080/api/v1" 
	walletAddress := "0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9" // Valid user wallet from DB
	sessionToken := "session_simulate_worker_blood"

	fmt.Printf("🚀 Starting Operation First Blood: Simulating Worker Registration\n")
	fmt.Printf("🔗 Target: %s\n", baseURL)
	fmt.Printf("👛 Wallet: %s\n", walletAddress)

	// Prepare registration data
	payload := map[string]interface{}{
		"name": "Simulated Worker (Almaty Node)",
		"specs": map[string]interface{}{
			"cpu": "Intel i9-13900K",
			"ram": 64,
			"location": map[string]float64{
				"lat": 43.238949, // Almaty Coordinates
				"lng": 76.889709,
			},
		},
	}
	
	jsonPayload, _ := json.Marshal(payload)
	
	// Create request
	url := baseURL + "/nodes/register"
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Session-Token", sessionToken)
	req.Header.Set("X-Wallet-Address", walletAddress) 
	req.Header.Set("X-Forwarded-For", "2.132.1.1") 

	client := &http.Client{Timeout: 15 * time.Second}

	fmt.Printf("📡 Sending registration request...\n")
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ HTTP Request failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("📝 Response Status: %s\n", resp.Status)
	fmt.Printf("📄 Response Body: %s\n", string(body))

	if resp.StatusCode == 200 {
		fmt.Printf("\n🏆 Operation Success! Worker registered.\n")
	} else {
		fmt.Printf("\n⚠️  Registration returned status %d\n", resp.StatusCode)
	}
}
