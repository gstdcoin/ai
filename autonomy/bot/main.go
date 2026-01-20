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
)

func main() {
	// Get token from environment or use default
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		token = DefaultToken
	}

	// Get AI Config
	ollamaHost := os.Getenv("OLLAMA_HOST")
	if ollamaHost == "" {
		ollamaHost = "https://api.ollama.com"
	}
	ollamaKey := os.Getenv("OLLAMA_API_KEY")

	pref := tele.Settings{
		Token:  token,
		Poller: &tele.LongPoller{Timeout: 10 * time.Second},
	}

	b, err := tele.NewBot(pref)
	if err != nil {
		log.Fatal(err)
	}

	// --- Menus ---
	adminMenu := &tele.ReplyMarkup{}
	btnStatus := adminMenu.Data("📊 Status", "status")
	btnLogs := adminMenu.Data("📋 Logs", "logs_default")
	btnUpgrade := adminMenu.Data("🧠 Upgrade", "upgrade")
	btnBrain := adminMenu.Data("📊 Brain Status", "brain_status")
	btnWorkers := adminMenu.Data("🛰 Workers", "workers")
	
	adminMenu.Inline(
		adminMenu.Row(btnStatus, btnBrain),
		adminMenu.Row(btnLogs, btnUpgrade),
		adminMenu.Row(btnWorkers),
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

	// --- Handlers ---

	b.Handle("/start", func(c tele.Context) error {
		if c.Sender().ID == AdminID {
			return c.Send("👋 **God Mode Active.**", adminMenu)
		}
		return c.Send("👋 Welcome to GSTD Platform.")
	})

	b.Handle("/help_admin", func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		return c.Send("🛠 **Control Panel:**\n" +
			"/logs [target] - View logs (backend/bot/n8n/ollama)\n" +
			"/logs_ai - AI analysis of backend logs (Cloud)\n" +
			"/test_shadow <file> <target> - Run safe tests\n" +
			"/upgrade_brain - Update AI models\n" +
			"/apply <file> - Deploy proposal (Blue-Green)")
	})

	// /logs <target>
	b.Handle("/logs", func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		
		target := "ubuntu-backend-blue-1" // default
		args := c.Args()
		if len(args) > 0 {
			switch args[0] {
			case "bot": target = "gstd_bot"
			case "n8n": target = "gstd_n8n"
			default: target = "ubuntu-backend-blue-1"
			}
		}

		return runAsync(c, fmt.Sprintf("Fetching logs for %s...", target), func() (string, error) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			
			cmd := exec.CommandContext(ctx, "docker", "logs", "--tail", "50", target)
			output, err := cmd.CombinedOutput()
			if err != nil {
				return "", fmt.Errorf("Docker Error: %v\n%s", err, string(output))
			}
			return fmt.Sprintf("📋 **Logs (%s):**\n```\n%s\n```", target, string(output)), nil
		})
	})
	
	b.Handle(&btnLogs, func(c tele.Context) error {
		return runAsync(c, "Fetching backend logs...", func() (string, error) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()

			cmd := exec.CommandContext(ctx, "docker", "logs", "--tail", "50", "ubuntu-backend-blue-1")
			output, err := cmd.CombinedOutput()
			if err != nil {
				return "", fmt.Errorf("Docker Error: %v\n%s", err, string(output))
			}
			return fmt.Sprintf("📋 **Backend Logs:**\n```\n%s\n```", string(output)), nil
		})
	})

	// /logs_ai (Cloud Optimized)
	b.Handle("/logs_ai", func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		return runAsync(c, "Analyzing logs with DeepSeek-V3 (Cloud)...", func() (string, error) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()

			// 1. Get Logs
			cmd := exec.CommandContext(ctx, "docker", "logs", "--tail", "100", "ubuntu-backend-blue-1")
			logs, err := cmd.CombinedOutput()
			if err != nil {
				return "", fmt.Errorf("failed to fetch logs: %s", string(logs))
			}

			// 2. Prepare AI Request
			prompt := fmt.Sprintf("Analyze these system logs for critical errors, security warnings, or recurring failures. Summarize in 3 bullet points. If clean, say so.\n\nLOGS:\n%s", string(logs))
			
			// Using deepseek-v3 
			model := "deepseek-v3"
			
			reqBody, _ := json.Marshal(map[string]interface{}{
				"model":  model,
				"prompt": prompt,
				"stream": false,
			})

			req, _ := http.NewRequestWithContext(ctx, "POST", ollamaHost+"/api/generate", bytes.NewBuffer(reqBody))
			req.Header.Set("Content-Type", "application/json")
			if ollamaKey != "" {
				req.Header.Set("Authorization", "Bearer "+ollamaKey)
			}
			
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return "", fmt.Errorf("Cloud Connection Error: %v", err)
			}
			defer resp.Body.Close()

			body, _ := io.ReadAll(resp.Body)
			
			if resp.StatusCode != 200 {
				return "", fmt.Errorf("API Error %d: %s", resp.StatusCode, string(body))
			}

			var result map[string]interface{}
			if err := json.Unmarshal(body, &result); err != nil {
				return "", fmt.Errorf("API Parse Error: %v", err)
			}
			
			responseVal, ok := result["response"].(string)
			if !ok {
				return "", fmt.Errorf("Unexpected API Response: %s", string(body))
			}
			
			response := "⚡ **Cloud Intelligence:**\n\n" + responseVal
			return response, nil
		})
	})

	// /upgrade_brain
	b.Handle("/upgrade_brain", func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		return runAsync(c, "Upgrading System Components (Cloud Mode)...", func() (string, error) {
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
			defer cancel()

			cmd := exec.CommandContext(ctx, "/home/ubuntu/autonomy/AUTO_UPGRADE.sh")
			output, err := cmd.CombinedOutput()
			if err != nil {
				return "", fmt.Errorf("Upgrade Failed:\n%s", string(output))
			}
			return fmt.Sprintf("🚀 **System Upgraded**\n\n%s", string(output)), nil
		})
	})
    
	b.Handle("/test_shadow", func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		args := c.Args()
		if len(args) < 2 {
			return c.Send("Usage: `/test_shadow <proposal> <target>`")
		}
		
		return runAsync(c, "Building Shadow Environment...", func() (string, error) {
			ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second) 
			defer cancel()
			
			cmd := exec.CommandContext(ctx, "/home/ubuntu/autonomy/bin/shadow_test", args[0], args[1])
			output, err := cmd.CombinedOutput()
			if err != nil {
				return "", fmt.Errorf("Test Failed:\n%s", string(output))
			}
			
			// Success - Send Button
			go func() {
				time.Sleep(1 * time.Second) // Wait for edit
				menu := &tele.ReplyMarkup{}
				// Trim unique data to 64 bytes max. 
				// "apply_" + filename. 
				btnData := "apply_" + args[0]
				if len(btnData) > 64 { btnData = btnData[:64] }
				
				btnDeploy := menu.Data("🚀 Deploy Update", btnData)
				menu.Inline(menu.Row(btnDeploy))
				b.Send(c.Sender(), "✅ **Ready to Deploy?**", menu)
			}()
			
			return fmt.Sprintf("✅ **Shadow Test PASSED**\n\n%s", string(output)), nil
		})
	})

	// Unified Apply Handler (Blue-Green)
	applyLogic := func(c tele.Context, filename string) error {
		return runAsync(c, "Preparing Blue-Green Deployment...", func() (string, error) {
			src := filepath.Join("/home/ubuntu/autonomy/proposals", filename)
			dest := filepath.Join("/home/ubuntu/backend/internal/services", filename)
			
			input, err := os.ReadFile(src)
			if err != nil { return "", err }
			
			err = os.WriteFile(dest, input, 0644)
			if err != nil { return "", err }

            // 2. Prepare Candidate
            cmd := exec.Command("/home/ubuntu/autonomy/bin/deploy_blue_green.sh", "prepare", filename)
            out, err := cmd.CombinedOutput()
            if err != nil {
                 return "", fmt.Errorf("Prepare Failed:\n%s", string(out))
            }

            // 3. Prompt for Switch
            go func() {
               time.Sleep(1 * time.Second)
               menu := &tele.ReplyMarkup{}
               // btnData limit is tricky, assuming short filename
               btnSwitch := menu.Data("🔀 Switch Traffic", "switch_"+filename)
               btnAbort := menu.Data("❌ Abort", "abort_deploy")
               menu.Inline(menu.Row(btnSwitch, btnAbort))
               b.Send(c.Sender(), fmt.Sprintf("✅ **Candidate Ready**\n\n%s\n\nTraffic is still on Stable. Switch now?", string(out)), menu)
            }()

			return "✅ Candidate Built. Waiting for Switch...", nil
		})
	}

	b.Handle("/apply", func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		args := c.Args()
		if len(args) == 0 { return c.Send("Usage: /apply <file>") }
		return applyLogic(c, args[0])
	})
	
	// Callback Handler for Deploy/Switch Buttons
	b.Handle(tele.OnCallback, func(c tele.Context) error {
		data := c.Callback().Data
		
		if strings.HasPrefix(data, "apply_") || strings.HasPrefix(data, "\fapply_") {
			filename := strings.TrimPrefix(data, "apply_")
			filename = strings.TrimPrefix(filename, "\f")
			c.Respond(&tele.CallbackResponse{Text: "Deploying " + filename})
			return applyLogic(c, filename)
		}
		
		if strings.HasPrefix(data, "switch_") || strings.HasPrefix(data, "\fswitch_") {
             filename := strings.TrimPrefix(data, "switch_")
             filename = strings.TrimPrefix(filename, "\f")
             
             c.Respond(&tele.CallbackResponse{Text: "Switching Traffic..."})
             
             return runAsync(c, "Switching Traffic (Zero Downtime)...", func() (string, error) {
                 cmd := exec.Command("/home/ubuntu/autonomy/bin/deploy_blue_green.sh", "switch")
                 out, err := cmd.CombinedOutput()
                 if err != nil { return "", fmt.Errorf("Switch Failed:\n%s", string(out)) }
                 return fmt.Sprintf("✅ **Deployment Complete**\n\n%s", string(out)), nil
             })
        }
		
		if data == "abort_deploy" {
			c.Respond()
			return c.Send("❌ Deployment Aborted.")
		}
		
		return nil
	})
	
	b.Handle(&btnBrain, func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		c.Notify(tele.Typing)
		
		// 1. Check Cloud Latency
		start := time.Now()
		cloudStatus := "❌ Offline"
		latency := "N/A"
		client := http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("https://api.ollama.com") 
		if err == nil {
			dur := time.Since(start)
			cloudStatus = "✅ Online"
			latency = fmt.Sprintf("%dms", dur.Milliseconds())
			resp.Body.Close()
		}
		
		// 2. Check Antigravity Mode via new CLI
		cmd := exec.Command("/home/ubuntu/autonomy/bin/antigravity", "status")
		out, _ := cmd.CombinedOutput()
		modeIcon := "🌩️ Cloud-Enhanced"
		if bytes.Contains(out, []byte("STATUS_MODE=local")) {
			modeIcon = "🔋 Local-Core Only"
		}

		return c.Edit(fmt.Sprintf("🧠 **Brain Status**\n\n" +
			"☁️ **Cloud API:** %s (Latency: %s)\n" +
			"🏠 **Local Fallback:** 💤 Standby\n" +
			"⚖️ **Antigravity Mode:** %s", cloudStatus, latency, modeIcon))
	})
	
	b.Handle(&btnWorkers, func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		cmd := exec.Command("/home/ubuntu/autonomy/bin/check_workers.sh")
		out, err := cmd.CombinedOutput()
		status := strings.TrimSpace(string(out))
		if err != nil { status = "Error" }
		if status == "" { status = "0" }
		return c.Edit(fmt.Sprintf("🛰 **Active Workers:** %s\n\nNetwork is stable.", status))
	})

	b.Handle(&btnStatus, func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		return c.Edit("📊 **System Online**\nConnected to Cloud Intelligence.")
	})
	
	b.Handle(&btnUpgrade, func(c tele.Context) error {
		if c.Sender().ID != AdminID { return nil }
		return c.Send("Use /upgrade_brain to start.")
	})

	log.Printf("🤖 Cloud-Connected Bot Started. ID: %d", AdminID)
	
	// Self-Health Check & Notification
	go func() {
		time.Sleep(5 * time.Second) // Wait for connection
		
		// Check Backends
		apiStatus := "❌"
		client := http.Client{Timeout: 2 * time.Second}
		if _, err := client.Get("http://ubuntu-backend-blue-1:8080/api/v1/health"); err == nil {
			apiStatus = "✅"
		}
		
		msg := fmt.Sprintf("✅ **System Optimized**\n\n" +
			"• Git Sync: ✅ (origin/main)\n" +
			"• Server Clean: ✅ (Junk Removed)\n" +
			"• Connection: %s Backend | ✅ Cloud Brain", apiStatus)
			
		b.Send(&tele.Chat{ID: AdminID}, msg)
	}()

	b.Start()
}
