package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	tele "gopkg.in/telebot.v3"
)

// Configuration
const (
	AdminID      = 5700385228
	DefaultToken = "8306755226:AAEfG2-BZ1Xo9hPex7-igz_WzHEscJOOk-U"
	BackendURL   = "http://ubuntu-backend-blue-1:8080"
)

var (
	SystemPrompt = `You are the specific AI Assistant for GSTD (Global Standard DePIN).
	Architecture:
	- Frontend: Next.js + Tailwind (Glassmorphism)
	- Backend: Go (Gin) + PostgreSQL + Redis
	- Infrastructure: Docker Swarm / Blue-Green Deployment
	- Unique Features: "Empty Button" Mining, Telegram OS, AI-driven Governance.
	
	Your goal is to help optimize this infrastructure, suggest code improvements, and manage the DePIN network.`
)

func main() {
	// Get token from environment or use default
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		token = DefaultToken
	}

	// AI Config
	ollamaHost := os.Getenv("OLLAMA_HOST") // Cloud/Remote Ollama
    if ollamaHost == "" { ollamaHost = "https://api.deepseek.com" } // Fallback to DeepSeek if not set
	ollamaKey := os.Getenv("OLLAMA_API_KEY") 
    deepSeekKey := os.Getenv("DEEPSEEK_API_KEY") // Secret key

	pref := tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	}

	b, err := tele.NewBot(pref)
	if err != nil {
		log.Fatal(err)
	}

	// --- Menus ---
    // ADMIN MENU
	adminMenu := &tele.ReplyMarkup{ResizeKeyboard: true}
	btnStats := adminMenu.Text("📊 Stats")
	btnInfra := adminMenu.Text("⚙️ Infra")
	btnTreasury := adminMenu.Text("💰 Treasury")
	btnDebug := adminMenu.Text("🛠 Debug")
    
	adminMenu.Reply(
		adminMenu.Row(btnStats, btnInfra),
		adminMenu.Row(btnTreasury, btnDebug),
	)

    // USER MENU
    userMenu := &tele.ReplyMarkup{ResizeKeyboard: true}
    btnDashboard := userMenu.WebApp("📱 Open Dashboard", &tele.WebApp{URL: "https://app.gstdtoken.com"})
    btnBalance := userMenu.Text("💎 My Balance")
    btnNodes := userMenu.Text("🚀 My Nodes")
    btnMarket := userMenu.Text("📈 Marketplace")
    btnRefs := userMenu.Text("🎁 Referrals")

    userMenu.Reply(
        userMenu.Row(btnDashboard),
        userMenu.Row(btnBalance, btnNodes),
        userMenu.Row(btnMarket, btnRefs),
    )

	// --- Helpers ---
	
	runAsync := func(c tele.Context, loadingText string, task func() (string, error)) error {
		msg, err := b.Send(c.Sender(), "⏳ "+loadingText)
		if err != nil {
			return err
		}

		go func() {
			res, taskErr := task()
			if taskErr != nil {
				b.Edit(msg, fmt.Sprintf("❌ **Error:**\n```\n%s\n```", taskErr.Error()))
				return
			}
			if len(res) > 4000 {
				res = res[:4000] + "\n...(truncated)"
			}
			b.Edit(msg, res, tele.ModeMarkdown)
		}()
		return nil
	}

    // Helper to call AI
    callAI := func(prompt string) (string, string, error) {
        // 1. Try Local Llama first
        localHost := "http://gstd_ollama:11434"
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()

        // Prepare context-aware prompt
        fullPrompt := SystemPrompt + "\n\nUser Question: " + prompt
        
        reqBody, _ := json.Marshal(map[string]interface{}{
            "model": "llama3",
            "prompt": fullPrompt,
            "stream": false,
        })

        req, _ := http.NewRequestWithContext(ctx, "POST", localHost+"/api/generate", bytes.NewBuffer(reqBody))
        req.Header.Set("Content-Type", "application/json")
        
        resp, err := http.DefaultClient.Do(req)
        
        // If successful
        if err == nil && resp.StatusCode == 200 {
            defer resp.Body.Close()
            var result map[string]interface{}
            if json.NewDecoder(resp.Body).Decode(&result) == nil {
                if response, ok := result["response"].(string); ok {
                    return response, "🔋 Local (Llama)", nil
                }
            }
        }

        // 2. Fallback to DeepSeek/Cloud
        // If local failed (err != nil or timeout or status != 200)
        
        targetUrl := "https://api.deepseek.com/v1/chat/completions" // Example Endpoint
        // If user provided OLLAMA_HOST is actually acting as the gateway (e.g. OpenWebUI or similar), use that
        if strings.Contains(ollamaHost, "api.ollama.com") {
             // Basic Ollama cloud fallback
             targetUrl = ollamaHost + "/api/generate"
             reqBody, _ = json.Marshal(map[string]interface{}{
                "model": "deepseek-v3",
                "prompt": fullPrompt,
                "stream": false,
            })
        } else {
             // Assume OpenAI-compatible API for DeepSeek/Gemini if keys are set
              // MOCKING the precise DeepSeek API implementation for safety, falling back to a generic standardized request
              // Ideally we use a known working endpoint. Assuming ollamaHost is the configured AI Gateway.
              targetUrl = ollamaHost + "/api/generate"
               reqBody, _ = json.Marshal(map[string]interface{}{
                "model": "deepseek-v3",
                "prompt": fullPrompt,
                "stream": false,
            })
        }

        reqCloud, _ := http.NewRequest("POST", targetUrl, bytes.NewBuffer(reqBody))
        reqCloud.Header.Set("Content-Type", "application/json")
        if deepSeekKey != "" { reqCloud.Header.Set("Authorization", "Bearer "+deepSeekKey) }
        else if ollamaKey != "" { reqCloud.Header.Set("Authorization", "Bearer "+ollamaKey) }

        client := http.Client{Timeout: 30 * time.Second}
        respCloud, err := client.Do(reqCloud)
        if err != nil { return "", "", fmt.Errorf("All AI Services Failed: %v", err) }
        defer respCloud.Body.Close()

        var resultCloud map[string]interface{}
        json.NewDecoder(respCloud.Body).Decode(&resultCloud)
        
        if response, ok := resultCloud["response"].(string); ok {
             return response, "🌩️ Cloud (DeepSeek/Hybrid)", nil
        }
         // OpenAI format fallback
        if choices, ok := resultCloud["choices"].([]interface{}); ok && len(choices) > 0 {
             if choiceMap, ok := choices[0].(map[string]interface{}); ok {
                 if message, ok := choiceMap["message"].(map[string]interface{}); ok {
                     if content, ok := message["content"].(string); ok {
                         return content, "🌩️ Cloud (DeepSeek API)", nil
                     }
                 }
             }
        }

        return "", "", fmt.Errorf("Invalid AI Response")
    }


	// --- Handlers ---

	b.Handle("/start", func(c tele.Context) error {
		if c.Sender().ID == AdminID {
			return c.Send("👋 **GSTD Command Center (Admin)**\nSystem ready.", adminMenu)
		}
		return c.Send("👋 **Welcome Miner**\nMake money with your device.", userMenu)
	})

    // --- ADMIN HANDLERS ---
    b.Handle(&btnStats, func(c tele.Context) error {
        if c.Sender().ID != AdminID { return nil }
        // Fetch real stats
        return runAsync(c, "Fetching Stats...", func() (string, error) {
            // Mock for now, would be GET /api/v1/admin/stats
            return "📊 **Network Stats**\n\nNodes: 142\nActive: 118\nTPS: 450\nRevenue: $12,450.00", nil
        })
    })

    b.Handle(&btnInfra, func(c tele.Context) error {
        if c.Sender().ID != AdminID { return nil }
        menu := &tele.ReplyMarkup{}
        btnRestart := menu.Data("♻️ Restart Containers", "restart_all")
        btnClearLogs := menu.Data("🧹 Clean Logs", "clean_logs")
        menu.Inline(menu.Row(btnRestart, btnClearLogs))
        return c.Send("⚙️ **Infrastructure Controls**", menu)
    })
    
     b.Handle(&btnTreasury, func(c tele.Context) error {
        if c.Sender().ID != AdminID { return nil }
        return c.Send("💰 **Treasury Wallet**\nAddress: `UQ...GSTD`\nBalance: 5,000,000 GSTD\n\n/payout_run - specific payout command")
    })

     b.Handle(&btnDebug, func(c tele.Context) error {
         if c.Sender().ID != AdminID { return nil }
         // Execute tail log
          return runAsync(c, "Fetching Logs...", func() (string, error) {
               cmd := exec.Command("docker", "logs", "--tail", "20", "ubuntu-backend-blue-1")
               out, err := cmd.CombinedOutput()
               if err != nil { return "", err }
               return fmt.Sprintf("🐛 **Debug Logs:**\n```\n%s\n```", string(out)), nil
          })
    })

    // --- USER HANDLERS ---
    b.Handle(&btnBalance, func (c tele.Context) error {
        return c.Send("💎 **Your Balance**\n\n1,250.00 GSTD\n≈ $125.00 USD")
    })

    b.Handle(&btnNodes, func(c tele.Context) error {
         return c.Send("🚀 **My Nodes**\n\n1. iPhone 15 (Online) - 🟢 Mining\n2. Desktop (Offline) - 🔴")
    })

      b.Handle(&btnMarket, func(c tele.Context) error {
         return c.Send("📈 **Marketplace**\n\nAvailable Bounties:\n- 3D Rendering (500 GSTD)\n- AI Dataset Validation (100 GSTD)\n\n/take <task_id>")
    })

     b.Handle(&btnRefs, func(c tele.Context) error {
         return c.Send(fmt.Sprintf("🎁 **Referral System**\n\nLink: https://t.me/GSTD_Bot?start=%d\n\nInvited: 3 Users", c.Sender().ID))
    })

    // --- INFRA CALLBACKS ---
    b.Handle(tele.OnCallback, func(c tele.Context) error {
        data := c.Callback().Data
        if data == "restart_all" {
             go exec.Command("docker", "restart", "ubuntu-backend-blue-1").Run()
             return c.Respond(&tele.CallbackResponse{Text: "Restarting Backend..."})
        }
        return nil
    })


	// /ask <query> - Hybrid Intelligence
	b.Handle("/ask", func(c tele.Context) error {
		args := c.Args()
		if len(args) == 0 { return c.Send("Usage: /ask <query>") }
		prompt := strings.Join(args, " ")
		
		return runAsync(c, "🧠 Thinking (Hybrid Engine)...", func() (string, error) {
            answer, source, err := callAI(prompt)
            if err != nil { return "", err }
			return fmt.Sprintf("**%s Answer:**\n\n%s", source, answer), nil
		})
	})

	log.Printf("🤖 GSTD Telegram OS Started. Admin: %d", AdminID)
	b.Start()
}
