package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config - Adaptive to environment
var (
	OllamaHost = os.Getenv("OLLAMA_HOST")
	Model      = "qwen2.5:0.5b" // Default safe model
    CloudKey   = os.Getenv("OLLAMA_API_KEY")
)

func init() {
    if OllamaHost == "" {
        OllamaHost = "http://localhost:11434"
        // Check if inside docker
        if _, err := os.Stat("/.dockerenv"); err == nil {
             OllamaHost = "http://gstd_ollama:11434"
        }
    }
}

func main() {
	log.Println("📱 Mobile Dominance Optimizer Started...")
    
    // 1. Scan for Heavy Handlers
    target := findHeavyHandler()
    if target == "" {
        log.Println("✅ No immediate targets found. System is optimized.")
        return
    }
    
    log.Printf("🎯 Analyzing %s for Mobile Optimization...", target)
    
    // 2. Analyze with AI
    code, _ := ioutil.ReadFile(target)
    
    prompt := fmt.Sprintf(`You are the GSTD Mobile Architect. 
    Analyze this Go code. 
    GOAL: Optimize for Mobile Clients (Low Latency, Low Bandwidth).
    
    CHECKLIST:
    1. Is it using huge JSONs? (Suggest partial responses)
    2. Is it keeping connections open too long?
    3. Are there heavy loops?
    
    If optimization is needed, rewrite the code.
    If it's already good, simply reply "OPTIMIZED".
    
    CODE:
    %s`, string(code))
    
    resp, err := askAI(prompt)
    if err != nil {
        log.Fatalf("❌ AI Failure: %v", err)
    }
    
    if strings.Contains(resp, "OPTIMIZED") {
        log.Println("✅ File is already optimized.")
        return
    }
    
    // 3. Create Proposal
    saveProposal(target, resp)
}

func findHeavyHandler() string {
    // Simple heuristic: Find largest controller file
    root := "/home/ubuntu/backend/internal/api"
    var maxFile string
    var maxSize int64
    
    filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
        if err == nil && !info.IsDir() && strings.HasSuffix(path, ".go") {
            if info.Size() > maxSize {
                maxSize = info.Size()
                maxFile = path
            }
        }
        return nil
    })
    return maxFile
}

func askAI(prompt string) (string, error) {
    // Try Local First
    url := OllamaHost+"/api/generate"
    reqBody, _ := json.Marshal(map[string]interface{}{
        "model": Model,
        "prompt": prompt,
        "stream": false,
    })
    
    client := http.Client{Timeout: 60 * time.Second}
    resp, err := client.Post(url, "application/json", bytes.NewBuffer(reqBody))
    
    if err != nil || resp.StatusCode != 200 {
        log.Println("⚠️ Local AI failed/busy. Switching to Cloud Fallback...")
        // Here we would switch to Antigravity/Cloud if implemented
        // For now, retry with smaller context or fail gracefully
        return "", fmt.Errorf("AI Service Unavailable")
    }
    defer resp.Body.Close()
    
    var res map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&res)
    return res["response"].(string), nil
}

func saveProposal(origPath, content string) {
    name := filepath.Base(origPath)
    path := fmt.Sprintf("/home/ubuntu/autonomy/proposals/mobile_%s_%s", time.Now().Format("150405"), name)
    
    // Wrap in markdown check
    content = strings.TrimPrefix(content, "```go")
    content = strings.TrimSuffix(content, "```")
    
    ioutil.WriteFile(path, []byte(content), 0644)
    log.Printf("🚀 Proposal saved to %s", path)
    
    // Notify Admin via Telegram (simple stdout, assuming bot reads logs or we call a hook)
    fmt.Printf("TELEGRAM_NOTIFY: 📱 Mobile Optimization Proposal Created: %s\n", name)
}
