package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	OllamaHost      = "http://gstd_ollama:11434" // Internal Docker Network
	InternalAgentMD = "/app/INTERNAL_AGENT.md"
	ProposalsDir    = "/home/ubuntu/autonomy/proposals" // Check if this is writable
	BackendDir      = "/home/ubuntu/backend"
)

func main() {
	log.Println("🚀 Starting Market Dominance Cycle...")

	// 1. Read Strategy
	strategy, err := ioutil.ReadFile(InternalAgentMD)
	if err != nil {
		log.Fatalf("Failed to read strategy: %v", err)
	}

	// 2. Select Target File
	targetFile, err := getRandomGoFile(BackendDir)
	if err != nil {
		log.Fatalf("Failed to find target: %v", err)
	}
	log.Printf("🎯 Targeting: %s", targetFile)

	code, err := ioutil.ReadFile(targetFile)
	if err != nil {
		log.Fatalf("Failed to read code: %v", err)
	}

	// 3. Construct Prompt
    // Extract the prompt part from the MD file or just use a strong fallback
	prompt := fmt.Sprintf(`%s
    
    TARGET FILE: %s
    CURRENT CODE:
    
    %s`, string(strategy), filepath.Base(targetFile), string(code))

	// 4. Call AI (Ollama)
	log.Println("🧠 Brainstorming improvements (Mobile Focus)...")
	response, err := callOllama(prompt)
	if err != nil {
		log.Fatalf("AI Error: %v", err)
	}

	// 5. Save Proposal
	timestamp := time.Now().Format("20060102_150405")
	filename := fmt.Sprintf("dominance_%s_%s", timestamp, filepath.Base(targetFile))
	outPath := filepath.Join(ProposalsDir, filename)
	
	err = ioutil.WriteFile(outPath, []byte(response), 0644)
	if err != nil {
		log.Fatalf("Save Error: %v", err)
	}

	log.Printf("✅ Proposal Saved: %s", outPath)
    log.Println("Cycle Complete. Nothing can stop us.")
}

func getRandomGoFile(root string) (string, error) {
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil { return err }
		if !info.IsDir() && strings.HasSuffix(path, ".go") && !strings.Contains(path, "vendor") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil { return "", err }
	if len(files) == 0 { return "", fmt.Errorf("no go files found") }
	
	rand.Seed(time.Now().UnixNano())
	return files[rand.Intn(len(files))], nil
}

func callOllama(prompt string) (string, error) {
    // Model Selection: Try to use a coding model
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":  "qwen2.5:0.5b", 
		"prompt": prompt,
		"stream": false,
	})

	resp, err := http.Post(OllamaHost+"/api/generate", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
        body, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("API Error %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result["response"].(string), nil
}
