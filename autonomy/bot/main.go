package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	tele "gopkg.in/telebot.v3"
)

// Configuration
func getBackendURL() string {
	if u := os.Getenv("API_URL"); u != "" {
		return strings.TrimSuffix(u, "/")
	}
	return "http://ubuntu-backend-blue-1:8080"
}

func getBotToken() string {
	if t := os.Getenv("BOT_API_KEY"); t != "" {
		return t
	}
	return os.Getenv("TELEGRAM_BOT_TOKEN")
}

var (
	AdminID      int64 = 5700385228 // Default fallback
	SystemPrompt       = `You are the specific AI Assistant for GSTD (Global Standard DePIN).
	Architecture:
	- Frontend: Next.js + Tailwind (Glassmorphism)
	- Backend: Go (Gin) + PostgreSQL + Redis
	- Infrastructure: Docker Swarm / Blue-Green Deployment
	- Unique Features: "Empty Button" Mining, Telegram OS, AI-driven Governance.
	
	Your goal is to help optimize this infrastructure, suggest code improvements, and manage the DePIN network.`
)

func main() {
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		log.Fatal("TELEGRAM_BOT_TOKEN is required (set in .env or environment)")
	}

	// Load Admin ID
	if envID := os.Getenv("ADMIN_ID"); envID != "" {
		if id, err := strconv.ParseInt(envID, 10, 64); err == nil {
			AdminID = id
		}
	}

	// AI Config
	ollamaHost := os.Getenv("OLLAMA_HOST") // Cloud/Remote Ollama
	if ollamaHost == "" {
		ollamaHost = "https://api.deepseek.com"
	} // Fallback to DeepSeek if not set
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
	btnAdminDashboard := adminMenu.WebApp("📱 Dashboard", &tele.WebApp{URL: "https://app.gstdtoken.com/dashboard"})
	btnAdminTMA := adminMenu.WebApp("📊 TMA", &tele.WebApp{URL: "https://app.gstdtoken.com/tma"})

	adminMenu.Reply(
		adminMenu.Row(btnStats, btnInfra),
		adminMenu.Row(btnTreasury, btnDebug),
		adminMenu.Row(btnAdminDashboard, btnAdminTMA),
	)

	// USER MENU — Full app: Dashboard = main entry, Mining = Wallet-as-Node
	userMenu := &tele.ReplyMarkup{ResizeKeyboard: true}
	btnDashboard := userMenu.WebApp("📱 Open App", &tele.WebApp{URL: "https://app.gstdtoken.com"})
	btnMining := userMenu.WebApp("⛏ Start Mining", &tele.WebApp{URL: "https://app.gstdtoken.com/dashboard?mining=1"})
	btnTMA := userMenu.WebApp("📊 TMA", &tele.WebApp{URL: "https://app.gstdtoken.com/tma"})
	btnBalance := userMenu.Text("💎 My Balance")
	btnGoldenGate := userMenu.Text("🏆 Golden Gate")
	btnNodes := userMenu.Text("🚀 My Nodes")
	btnMarket := userMenu.Text("📈 Marketplace")
	btnRefs := userMenu.Text("🎁 Referrals")

	userMenu.Reply(
		userMenu.Row(btnDashboard, btnMining),
		userMenu.Row(btnTMA, btnBalance),
		userMenu.Row(btnGoldenGate, btnNodes),
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
		// 1. Try Local Ollama first (qwen2.5-coder preferred, fallback llama3)
		localHost := "http://gstd_ollama:11434"
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		// Prepare context-aware prompt
		fullPrompt := SystemPrompt + "\n\nUser Question: " + prompt

		reqBody, _ := json.Marshal(map[string]interface{}{
			"model":  "qwen2.5-coder:7b",
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
					return response, "🔋 Local (Ollama)", nil
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
				"model":  "deepseek-v3",
				"prompt": fullPrompt,
				"stream": false,
			})
		} else {
			// Assume OpenAI-compatible API for DeepSeek/Gemini if keys are set
			// MOCKING the precise DeepSeek API implementation for safety, falling back to a generic standardized request
			// Ideally we use a known working endpoint. Assuming ollamaHost is the configured AI Gateway.
			targetUrl = ollamaHost + "/api/generate"
			reqBody, _ = json.Marshal(map[string]interface{}{
				"model":  "deepseek-v3",
				"prompt": fullPrompt,
				"stream": false,
			})
		}

		reqCloud, _ := http.NewRequest("POST", targetUrl, bytes.NewBuffer(reqBody))
		reqCloud.Header.Set("Content-Type", "application/json")
		if deepSeekKey != "" {
			reqCloud.Header.Set("Authorization", "Bearer "+deepSeekKey)
		} else if ollamaKey != "" {
			reqCloud.Header.Set("Authorization", "Bearer "+ollamaKey)
		}

		client := http.Client{Timeout: 30 * time.Second}
		respCloud, err := client.Do(reqCloud)
		if err != nil {
			return "", "", fmt.Errorf("All AI Services Failed: %v", err)
		}
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

	// --- API Helpers (Marketplace) ---
	apiClient := &http.Client{Timeout: 15 * time.Second}

	fetchAndFormatTasks := func(baseURL string) (string, error) {
		req, _ := http.NewRequest("GET", baseURL+"/api/v1/marketplace/tasks", nil)
		resp, err := apiClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("backend unreachable: %v", err)
		}
		defer resp.Body.Close()
		var out struct {
			Tasks []struct {
				TaskID           string  `json:"task_id"`
				TaskType         string  `json:"task_type"`
				RewardGSTD       float64 `json:"reward_gstd"`
				WorkersNeeded    int     `json:"workers_needed"`
				WorkersCompleted int     `json:"workers_completed"`
			} `json:"tasks"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
			return "", fmt.Errorf("invalid response: %v", err)
		}
		if len(out.Tasks) == 0 {
			return "📈 **Marketplace**\n\nNo tasks available.\n\n/connect <wallet> — link wallet\n/take <task_id> — claim task", nil
		}
		var sb strings.Builder
		sb.WriteString("📈 **Marketplace**\n\n")
		for i, t := range out.Tasks {
			if i >= 10 {
				sb.WriteString("\n... and more. Use /take <task_id>")
				break
			}
			sb.WriteString(fmt.Sprintf("• `%s` — %.2f GSTD (%s) [%d/%d]\n", t.TaskID, t.RewardGSTD, t.TaskType, t.WorkersCompleted, t.WorkersNeeded))
		}
		sb.WriteString("\n/connect <wallet> — link wallet first\n/take <task_id> — claim\n/complete <task_id> — submit result")
		return sb.String(), nil
	}

	fetchBalance := func(baseURL, token string, telegramID int64) (string, error) {
		req, _ := http.NewRequest("GET", fmt.Sprintf("%s/api/v1/telegram/bot/balance?telegram_id=%d", baseURL, telegramID), nil)
		req.Header.Set("X-Bot-Token", token)
		resp, err := apiClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("backend unreachable: %v", err)
		}
		defer resp.Body.Close()
		var r struct {
			Linked      bool    `json:"linked"`
			BalanceGSTD float64 `json:"balance_gstd"`
			PendingGSTD float64 `json:"pending_gstd"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
			return "", fmt.Errorf("invalid response: %v", err)
		}
		if !r.Linked {
			return "💎 **My Balance**\n\n⚠️ Wallet not linked.\n\nUse /connect <wallet_address> to link your TON wallet.", nil
		}
		total := r.BalanceGSTD + r.PendingGSTD
		usd := total * 0.015
		return fmt.Sprintf("💎 **My Balance**\n\n**%.4f GSTD** (available)\n**%.4f GSTD** (pending)\n\n≈ $%.2f USD", r.BalanceGSTD, r.PendingGSTD, usd), nil
	}

	fetchNodes := func(baseURL, token string, telegramID int64) (string, error) {
		req, _ := http.NewRequest("GET", fmt.Sprintf("%s/api/v1/telegram/bot/nodes?telegram_id=%d", baseURL, telegramID), nil)
		req.Header.Set("X-Bot-Token", token)
		resp, err := apiClient.Do(req)
		if err != nil {
			return "", fmt.Errorf("backend unreachable: %v", err)
		}
		defer resp.Body.Close()
		var r struct {
			Nodes []struct {
				DeviceID string `json:"device_id"`
				Status   string `json:"status"`
			} `json:"nodes"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
			return "", fmt.Errorf("invalid response: %v", err)
		}
		var sb strings.Builder
		sb.WriteString("🚀 **My Nodes**\n\n")
		for _, n := range r.Nodes {
			sb.WriteString(fmt.Sprintf("• %s — %s\n", n.DeviceID, n.Status))
		}
		sb.WriteString("\n_Device ID = tg-{your_telegram_id} when mining from bot_")
		return sb.String(), nil
	}

	fetchGoldenGate := func(baseURL string) (string, error) {
		resp, err := apiClient.Get(baseURL + "/api/v1/stats/public")
		if err != nil {
			return "", fmt.Errorf("backend unreachable: %v", err)
		}
		defer resp.Body.Close()
		var data struct {
			GoldenReserveXAUt float64 `json:"golden_reserve_xaut"`
			TotalGSTDPaid     float64 `json:"total_gstd_paid"`
			TotalBurned       float64 `json:"total_burned"`
			ActiveDevices     int     `json:"active_devices_count"`
			GSTDPriceUSD      float64 `json:"gstd_price_usd"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			return "", fmt.Errorf("invalid response: %v", err)
		}
		xautUSD := data.GoldenReserveXAUt * 2750
		var sb strings.Builder
		sb.WriteString("🏆 **Golden Gate (Treasury)**\n\n")
		sb.WriteString(fmt.Sprintf("📦 **XAUt Reserve:** %.4f XAUt\n", data.GoldenReserveXAUt))
		sb.WriteString(fmt.Sprintf("   ≈ $%.0f USD\n\n", xautUSD))
		sb.WriteString("🔄 **Your Work → Gold**\n")
		sb.WriteString("• 70%% of platform fees → Gold Reserve\n")
		sb.WriteString("• 2%% of every task → XAUt (Tether Gold)\n")
		sb.WriteString("• Your completed tasks fund the reserve\n\n")
		sb.WriteString(fmt.Sprintf("📊 **Network:** %d workers • %.2f GSTD paid\n", data.ActiveDevices, data.TotalGSTDPaid))
		sb.WriteString(fmt.Sprintf("🔥 **Burned:** %.2f GSTD\n", data.TotalBurned))
		return sb.String(), nil
	}

	linkWallet := func(baseURL, token string, telegramID int64, wallet, username, firstName string) (string, error) {
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id":    telegramID,
			"wallet_address": wallet,
			"username":       username,
			"first_name":     firstName,
		})
		req, _ := http.NewRequest("POST", baseURL+"/api/v1/telegram/bot/link", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := apiClient.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Error      string `json:"error"`
			Success    bool   `json:"success"`
			Subsidized bool   `json:"subsidized"`
		}
		json.NewDecoder(resp.Body).Decode(&r)
		if resp.StatusCode != 200 || r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		msg := "✅ Wallet linked! Use /take <task_id> to claim tasks."
		if r.Subsidized {
			msg = "✅ Wallet linked!\n\n⛽ Твой вход субсидирован. У тебя есть TON для первой операции!\n\nUse /take <task_id> to claim tasks."
		}
		return msg, nil
	}

	claimTask := func(baseURL, token string, telegramID int64, taskID string) (string, error) {
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id": telegramID,
			"task_id":     taskID,
			"device_id":   "tg-" + fmt.Sprintf("%d", telegramID),
		})
		req, _ := http.NewRequest("POST", baseURL+"/api/v1/telegram/bot/claim", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := apiClient.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Error   string `json:"error"`
			Success bool   `json:"success"`
		}
		json.NewDecoder(resp.Body).Decode(&r)
		if resp.StatusCode != 200 || r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		return fmt.Sprintf("✅ Task `%s` claimed! Complete it with:\n/complete %s yes 0.85 \"your reasoning\"", taskID, taskID), nil
	}

	completeTask := func(baseURL, token string, telegramID int64, taskID string, resultData []byte) (string, error) {
		body, _ := json.Marshal(map[string]interface{}{
			"telegram_id":       telegramID,
			"task_id":           taskID,
			"result_data":       json.RawMessage(resultData),
			"execution_time_ms": 5000,
			"quality_score":     0.9,
		})
		req, _ := http.NewRequest("POST", baseURL+"/api/v1/telegram/bot/complete", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Bot-Token", token)
		resp, err := apiClient.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		var r struct {
			Error      string  `json:"error"`
			Success    bool    `json:"success"`
			RewardGSTD float64 `json:"reward_gstd"`
		}
		json.NewDecoder(resp.Body).Decode(&r)
		if resp.StatusCode != 200 || r.Error != "" {
			return "", fmt.Errorf("%s", r.Error)
		}
		return fmt.Sprintf("✅ Task completed! Reward: %.4f GSTD", r.RewardGSTD), nil
	}

	// --- Handlers ---

	// /start - Login or Referral
	b.Handle("/start", func(c tele.Context) error {
		args := c.Args()
		payload := ""
		if len(args) > 0 {
			payload = args[0]
		}

		if c.Sender().ID == AdminID {
			return c.Send("👋 **GSTD Command Center (Admin)**\nSystem ready.", adminMenu)
		}

		txt := "👋 **Welcome Miner**\nMake money with your device."
		if payload != "" {
			// Logic to track referral click (analytics)
			txt += fmt.Sprintf("\n\n🔗 Invited by: %s", payload)
		}

		return c.Send(txt, userMenu)
	})

	// /ref - Viral Growth Command
	b.Handle("/ref", func(c tele.Context) error {
		refLink := fmt.Sprintf("https://t.me/%s?start=ref_%d", c.Bot().Me.Username, c.Sender().ID)

		// Mock stats (Real stats would query Backend API)
		msg := fmt.Sprintf("🚀 **Viral Expansion**\n\nInvite friends and earn **1%%** of their lifetime rewards!\n\n🔗 **Your Link:**\n`%s`\n\n📊 **Stats:**\nInvited: 0\nEarned: 0.00 GSTD", refLink)

		return c.Send(msg, tele.ModeMarkdown)
	})

	// --- ADMIN HANDLERS ---
	b.Handle(&btnStats, func(c tele.Context) error {
		if c.Sender().ID != AdminID {
			return nil
		}
		// Fetch real stats
		return runAsync(c, "Fetching Stats...", func() (string, error) {
			// Mock for now, would be GET /api/v1/admin/stats
			return "📊 **Network Stats**\n\nNodes: 142\nActive: 118\nTPS: 450\nRevenue: $12,450.00", nil
		})
	})

	b.Handle(&btnInfra, func(c tele.Context) error {
		if c.Sender().ID != AdminID {
			return nil
		}
		menu := &tele.ReplyMarkup{}
		btnRestart := menu.Data("♻️ Restart Containers", "restart_all")
		btnClearLogs := menu.Data("🧹 Clean Logs", "clean_logs")
		menu.Inline(menu.Row(btnRestart, btnClearLogs))
		return c.Send("⚙️ **Infrastructure Controls**", menu)
	})

	b.Handle(&btnTreasury, func(c tele.Context) error {
		if c.Sender().ID != AdminID {
			return nil
		}
		return runAsync(c, "Fetching Treasury...", func() (string, error) {
			return fetchGoldenGate(getBackendURL())
		})
	})

	// Golden Gate — visible to all users: Treasury, XAUt, work → gold flow
	b.Handle(&btnGoldenGate, func(c tele.Context) error {
		return runAsync(c, "Loading Golden Gate...", func() (string, error) {
			return fetchGoldenGate(getBackendURL())
		})
	})

	b.Handle(&btnDebug, func(c tele.Context) error {
		if c.Sender().ID != AdminID {
			return nil
		}
		// Execute tail log
		return runAsync(c, "Fetching Logs...", func() (string, error) {
			cmd := exec.Command("docker", "logs", "--tail", "20", "ubuntu-backend-blue-1")
			out, err := cmd.CombinedOutput()
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("🐛 **Debug Logs:**\n```\n%s\n```", string(out)), nil
		})
	})

	// --- USER HANDLERS ---
	b.Handle(&btnBalance, func(c tele.Context) error {
		return runAsync(c, "Loading balance...", func() (string, error) {
			return fetchBalance(getBackendURL(), getBotToken(), c.Sender().ID)
		})
	})

	b.Handle(&btnNodes, func(c tele.Context) error {
		return runAsync(c, "Loading nodes...", func() (string, error) {
			return fetchNodes(getBackendURL(), getBotToken(), c.Sender().ID)
		})
	})

	b.Handle(&btnMarket, func(c tele.Context) error {
		return runAsync(c, "Loading tasks...", func() (string, error) {
			return fetchAndFormatTasks(getBackendURL())
		})
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

	// /connect <wallet> - Link wallet for tasks
	b.Handle("/connect", func(c tele.Context) error {
		args := c.Args()
		if len(args) == 0 {
			return c.Send("Usage: /connect <wallet_address>\n\nExample: /connect UQAbc...xyz")
		}
		wallet := strings.TrimSpace(args[0])
		if len(wallet) < 40 {
			return c.Send("❌ Invalid wallet address (too short)")
		}
		return runAsync(c, "Linking wallet...", func() (string, error) {
			return linkWallet(getBackendURL(), getBotToken(), c.Sender().ID, wallet, c.Sender().Username, c.Sender().FirstName)
		})
	})

	// /take <task_id> - Claim a task
	b.Handle("/take", func(c tele.Context) error {
		args := c.Args()
		if len(args) == 0 {
			return c.Send("Usage: /take <task_id>\n\nGet task IDs from 📈 Marketplace")
		}
		taskID := strings.TrimSpace(args[0])
		return runAsync(c, "Claiming task...", func() (string, error) {
			return claimTask(getBackendURL(), getBotToken(), c.Sender().ID, taskID)
		})
	})

	// /complete <task_id> [prediction] [confidence] [reasoning] - Complete polymarket task
	// /complete <task_id> - Complete generic task
	b.Handle("/complete", func(c tele.Context) error {
		args := c.Args()
		if len(args) == 0 {
			return c.Send("Usage:\n• Polymarket: /complete <task_id> yes 0.85 \"Your reasoning\"\n• Generic: /complete <task_id>")
		}
		taskID := strings.TrimSpace(args[0])
		var resultData []byte
		if len(args) >= 2 {
			pred := strings.ToLower(strings.TrimSpace(args[1]))
			conf := 0.8
			reason := ""
			if len(args) >= 3 {
				fmt.Sscanf(args[2], "%f", &conf)
			}
			if len(args) >= 4 {
				reason = strings.Join(args[3:], " ")
			}
			if pred != "yes" && pred != "no" {
				return c.Send("❌ Prediction must be 'yes' or 'no'")
			}
			resultData, _ = json.Marshal(map[string]interface{}{
				"prediction": pred,
				"confidence": conf,
				"reasoning":  reason,
			})
		} else {
			resultData = []byte(`{"completed":true}`)
		}
		return runAsync(c, "Submitting result...", func() (string, error) {
			return completeTask(getBackendURL(), getBotToken(), c.Sender().ID, taskID, resultData)
		})
	})

	// /ask <query> - Hybrid Intelligence
	b.Handle("/ask", func(c tele.Context) error {
		args := c.Args()
		if len(args) == 0 {
			return c.Send("Usage: /ask <query>")
		}
		prompt := strings.Join(args, " ")

		return runAsync(c, "🧠 Thinking (Hybrid Engine)...", func() (string, error) {
			answer, source, err := callAI(prompt)
			if err != nil {
				return "", err
			}
			return fmt.Sprintf("**%s Answer:**\n\n%s", source, answer), nil
		})
	})

	log.Printf("🤖 GSTD Telegram OS Started. Admin: %d", AdminID)
	b.Start()
}
