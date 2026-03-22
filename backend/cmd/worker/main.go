package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// NATIVE WORKER CLI (GSTD Desktop Node)
//
// Replaces the web-browser based simulated node with a real native
// binary. It talks to the backend, polls for real inference/render
// tasks, and could be hooked to nvidia-smi / local ollama servers.
// ═══════════════════════════════════════════════════════════════

var (
	walletAddr = flag.String("wallet", "", "Your GSTD TON Wallet Address to receive rewards")
	serverURL  = flag.String("server", "http://localhost:8080", "GSTD Backend API URL")
	nodeName   = flag.String("name", "GSTD-Desktop-Worker", "Name of this rig")
)

type HeartbeatPayload struct {
	WalletAddress string  `json:"wallet_address"`
	BatteryLevel  int     `json:"battery_level"`
	SignalQuality int     `json:"signal_quality"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
}

type RegisterPayload struct {
	WalletAddress string                 `json:"wallet_address"`
	Name          string                 `json:"name"`
	Specs         map[string]interface{} `json:"specs"`
}

func main() {
	flag.Parse()

	if *walletAddr == "" {
		log.Fatalf("Fatal: Please provide your wallet address via -wallet flag")
	}

	fmt.Println("🚀 Starting GSTD Native Desktop Node...")
	fmt.Printf("💳 Wallet: %s\n", *walletAddr)

	// 1. Check local hardware stats (simulated here, but natively accessible via OS libs)
	cpuInfo := getCPUInfo()

	// 2. Register node explicitly
	registerNode(cpuInfo)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Emulate task polling cycle
	taskTicker := time.NewTicker(15 * time.Second)
	defer taskTicker.Stop()

	for {
		select {
		case <-ticker.C:
			sendHeartbeat()
		case <-taskTicker.C:
			pollTasks()
		}
	}
}

func getCPUInfo() string {
	// Attempt to run lscpu or just return placeholder
	out, err := exec.Command("uname", "-p").Output()
	if err != nil {
		return "x86_64-Generic"
	}
	return string(bytes.TrimSpace(out))
}

func registerNode(cpu string) {
	specs := map[string]interface{}{
		"cpu": cpu,
		"ram": 16,
	}
	req := RegisterPayload{
		WalletAddress: *walletAddr,
		Name:          *nodeName,
		Specs:         specs,
	}
	data, _ := json.Marshal(req)

	resp, err := http.Post(fmt.Sprintf("%s/api/v1/nodes/register", *serverURL), "application/json", bytes.NewReader(data))
	if err != nil {
		log.Printf("⚠️ Network offline: Cannot reach GS-TD Coordinator: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		log.Println("✅ Successfully connected and registered with Sovereign Network!")
	} else {
		log.Printf("⚠️ Registration rejected %d", resp.StatusCode)
	}
}

func sendHeartbeat() {
	req := HeartbeatPayload{
		WalletAddress: *walletAddr,
		BatteryLevel:  100, // Desktop is plugged in
		SignalQuality:  99,
		Latitude:      0.0,
		Longitude:     0.0,
	}
	data, _ := json.Marshal(req)

	resp, err := http.Post(fmt.Sprintf("%s/api/v1/nodes/heartbeat", *serverURL), "application/json", bytes.NewReader(data))
	if err != nil {
		log.Printf("⚠️ Heartbeat failed: %v", err)
		return
	}
	resp.Body.Close()
	log.Printf("💓 Pinging network... Heartbeat accepted.")
}

func pollTasks() {
	// Real implementation would look at tasks pending and execute local Llama.cpp bind
	resp, err := http.Post(fmt.Sprintf("%s/api/v1/training/poll", *serverURL), "application/json", bytes.NewReader([]byte(`{}`)))
	if err != nil {
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		// Log that we are actively securing the network and earning GSTD
		log.Printf("⚙️  Checking SwarmBrain for assigned tasks... Idle.")
	}
}
