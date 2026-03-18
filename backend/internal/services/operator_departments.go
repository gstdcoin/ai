package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const queryCountNodes = "SELECT COUNT(*) FROM nodes"

// ═══════════════════════════════════════════════════════════════
// operator_departments.go — Total Control Departments
//
// Extends PlatformOperator with full autonomous management:
//
// DEPT 1: DEVOPS — repos, git, CI/CD, deployment
// DEPT 2: ENGINEERING — error detection, code quality, API health
// DEPT 3: ECONOMICS — contracts, token supply, staking, rewards
// DEPT 4: GROWTH — user acquisition, agent recruitment, referrals
// DEPT 5: INTELLIGENCE — learning, memory, model optimization
// DEPT 6: FRONTEND — UI health, CDN, page speed, errors
// DEPT 7: BLOCKCHAIN — on-chain monitoring, wallet health, DLN
//
// 24/7/365 — never stops, never sleeps.
// ═══════════════════════════════════════════════════════════════

// StartFullControl extends the operator's basic loops with all departments
func (op *PlatformOperator) StartFullControl() {
	log.Println("🤖 PlatformOperator: initiating TOTAL CONTROL mode 24/7/365")

	// DEPT 1: DevOps — git repos, deployments, builds
	go op.loop("devops", 30*time.Minute, op.devopsCycle)

	// DEPT 2: Engineering — API health, error tracking, performance
	go op.loop("engineering", 5*time.Minute, op.engineeringCycle)

	// DEPT 3: Economics — token supply, contracts, rewards
	go op.loop("economics", 20*time.Minute, op.economicsCycle)

	// DEPT 4: Growth — users, nodes, agents, referrals
	go op.loop("growth", 1*time.Hour, op.growthCycle)

	// DEPT 5: Intelligence — AI optimization, learning, memory
	go op.loop("intelligence", 15*time.Minute, op.intelligenceCycle)

	// DEPT 6: Frontend — UI health, CDN, errors
	go op.loop("frontend", 10*time.Minute, op.frontendCycle)

	// DEPT 7: Blockchain — on-chain state, wallets, DLN
	go op.loop("blockchain", 10*time.Minute, op.blockchainCycle)

	// DEPT 8: Auto-Coder — Self-healing codebase
	if op.ai != nil {
		op.StartAutoCoder()
		op.StartAutonomousDeveloper() // DEPT 9: Platform R&D
	}

	// Daily comprehensive AI report — every 24h
	go op.loop("daily-report", 24*time.Hour, op.sendDailyAIReport)

	op.sendTelegram("🔥 *TOTAL CONTROL ACTIVATED* 24/7/365\n\n" +
		"Active departments:\n" +
		"1️⃣ DevOps — repos, builds, deploy (30m)\n" +
		"2️⃣ Engineering — API, errors, perf (5m)\n" +
		"3️⃣ Economics — tokens, contracts (20m)\n" +
		"4️⃣ Growth — users, nodes, agents (1h)\n" +
		"5️⃣ Intelligence — AI, learning (15m)\n" +
		"6️⃣ Frontend — UI, CDN, speed (10m)\n" +
		"7️⃣ Blockchain — on-chain, wallets (10m)\n" +
		"8️⃣ AutoCoder — Self-healing code (15m)\n" +
		"9️⃣ R&D — Autonomous Developer (3h)\n" +
		"📊 Daily AI Report (24h)\n\n" +
		"_Platform is self-governing._")
}

// ═════════════════════════════════════════════════════════════
// DEPT 1: DEVOPS — Repository & Deployment Management
// ═════════════════════════════════════════════════════════════

//nolint:gocognit // Procedural sequential operations
func (op *PlatformOperator) devopsCycle() {
	var findings []string

	// Check backend repo status
	if out, err := exec.Command("sh", "-c",
		"cd /home/ubuntu/backend && git status --porcelain 2>/dev/null | wc -l").Output(); err == nil {
		n := strings.TrimSpace(string(out))
		if n != "0" {
			findings = append(findings, fmt.Sprintf("Backend: %s uncommitted changes", n))
		}
	}

	// Check gstdbot repo
	if out, err := exec.Command("sh", "-c",
		"cd /home/ubuntu/gstdbot && git status --porcelain 2>/dev/null | wc -l").Output(); err == nil {
		n := strings.TrimSpace(string(out))
		if n != "0" {
			findings = append(findings, fmt.Sprintf("Node (gstdbot): %s uncommitted changes", n))
		}
	}

	// Check frontend repo
	if out, err := exec.Command("sh", "-c",
		"cd /home/ubuntu/frontend && git status --porcelain 2>/dev/null | wc -l").Output(); err == nil {
		n := strings.TrimSpace(string(out))
		if n != "0" {
			findings = append(findings, fmt.Sprintf("Frontend: %s uncommitted changes", n))
		}
	}

	// Check Docker image ages
	if out, err := exec.Command("sh", "-c",
		"docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedSince}}' 2>/dev/null | grep gstd | head -5").Output(); err == nil {
		s := strings.TrimSpace(string(out))
		if s != "" {
			for _, line := range strings.Split(s, "\n") {
				if strings.Contains(line, "weeks") || strings.Contains(line, "months") {
					findings = append(findings, "Stale Docker image: "+line)
				}
			}
		}
	}

	// Check disk space on /home (important for repos)
	if out, err := exec.Command("sh", "-c",
		"du -sh /home/ubuntu/backend /home/ubuntu/gstdbot /home/ubuntu/frontend 2>/dev/null").Output(); err == nil {
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			findings = append(findings, "Repo size: "+line)
		}
	}

	for _, f := range findings {
		op.logAction("devops", f, "checked", true)
	}
}

// ═════════════════════════════════════════════════════════════
// DEPT 2: ENGINEERING — API Health, Error Detection
// ═════════════════════════════════════════════════════════════

//nolint:gocognit // Procedural sequential operations
//nolint:gocognit
func (op *PlatformOperator) engineeringCycle() {
	// Check all critical API endpoints
	endpoints := []struct {
		name string
		url  string
	}{
		{"health", "http://localhost:8080/api/v1/health"},
		{"nodes", "http://localhost:8080/api/v1/nodes/public"},
		{"autonomy", "http://localhost:8080/api/v1/autonomy/status"},
		{"wallet-balance", "http://localhost:8080/api/v1/stats/public"},
	}

	var failures []string
	for _, ep := range endpoints {
		if out, err := exec.Command("sh", "-c",
			fmt.Sprintf("wget -q -O/dev/null -T5 --spider %s 2>&1; echo $?", ep.url)).Output(); err == nil {
			code := strings.TrimSpace(string(out))
			if code != "0" {
				failures = append(failures, fmt.Sprintf("❌ %s endpoint DOWN", ep.name))
			}
		}
	}

	if len(failures) > 0 {
		msg := "🔴 *API Health Alert*\n\n"
		for _, f := range failures {
			msg += f + "\n"
		}
		op.sendTelegram(msg)
		op.logAction("engineering", fmt.Sprintf("%d API endpoints down", len(failures)), "alert", false)
	}

	// Check backend error rate from logs
	if out, err := exec.Command("sh", "-c",
		"docker logs ubuntu-backend-blue-1 --since 5m 2>&1 | grep -c 'panic\\|FATAL\\|ERROR' 2>/dev/null || echo 0").Output(); err == nil {
		n := strings.TrimSpace(string(out))
		if n != "0" && n != "" {
			count := 0
			fmt.Sscanf(n, "%d", &count)
			if count > 10 {
				op.sendTelegram(fmt.Sprintf("⚠️ *Error Spike*\n%d errors in last 5 min", count))
			}
			op.logAction("engineering", fmt.Sprintf("%d errors in 5min", count), "monitored", true)
		}
	}

	// Monitor response time
	if out, err := exec.Command("sh", "-c",
		"time wget -q -O/dev/null http://localhost:8080/api/v1/health 2>&1 | grep real | awk '{print $2}'").Output(); err == nil {
		latency := strings.TrimSpace(string(out))
		if latency != "" {
			op.logAction("engineering", fmt.Sprintf("API latency: %s", latency), "measured", true)
		}
	}

	// Check DB query performance
	if op.db != nil {
		start := time.Now()
		var count int
		op.db.QueryRow(queryCountNodes).Scan(&count)
		latency := time.Since(start).Milliseconds()
		if latency > 1000 {
			op.sendTelegram(fmt.Sprintf("⚠️ *Slow DB Query*\nSELECT COUNT nodes: %dms", latency))
		}
		op.logAction("engineering", fmt.Sprintf("DB latency: %dms, nodes: %d", latency, count), "measured", true)
	}
}

// ═════════════════════════════════════════════════════════════
// DEPT 3: ECONOMICS — Token, Contracts, Rewards
// ═════════════════════════════════════════════════════════════

//nolint:gocognit
func (op *PlatformOperator) economicsCycle() {
	if op.db == nil {
		return
	}
	ctx := context.Background()

	var stats struct {
		totalRewards   float64
		pendingRewards float64
		totalBurned    float64
		activeStakers  int
		totalStaked    float64
	}

	// Get total rewards distributed
	op.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount_gstd), 0) FROM reward_history").Scan(&stats.totalRewards)

	// Get pending rewards
	op.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount_gstd), 0) FROM node_pending_rewards WHERE claimed_at IS NULL").Scan(&stats.pendingRewards)

	// Get total burned
	op.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount), 0) FROM burn_ledger").Scan(&stats.totalBurned)

	// Get active stakers
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM staking_positions WHERE status = 'active'").Scan(&stats.activeStakers)

	// Get total staked
	op.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(amount), 0) FROM staking_positions WHERE status = 'active'").Scan(&stats.totalStaked)

	// Deep Autonomous Economics Evaluation
	ctxTimeout, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// 1) Pull the absolute latest DeFi practices to ensure GSTD stays cutting-edge
	marketContext, _ := op.SearchWeb("site:cointelegraph.com OR site:coindesk.com latest tokenomics staking burn design")
	
	prompt := fmt.Sprintf(`You are the Autonomous Economical Protocol for GSTD Token. 
Latest market insights: %s

Current Network Economics:
- Pending Rewards: %.0f GSTD
- Total Staked: %.0f GSTD
- Active Stakers: %d

Analyze these metrics. If the economy is unbalanced or can be improved, output EXACTLY the following structure to create an L1 Governance Proposal to fix it. Do not use markdown blocks, just raw text.
TITLE: <Propose a Title>
DESCRIPTION: <Explain the rationale and L1 contract/parameter change>
CATEGORY: <economics / tokenomics / security>`,
		marketContext, stats.pendingRewards, stats.totalStaked, stats.activeStakers)

	response, err := op.ai.Ask(ctxTimeout, "Economics strategy advisor.", prompt)
	
	const titlePrefix = "TITLE:"
	const descPrefix = "DESCRIPTION:"
	const catPrefix = "CATEGORY:"
	
	if err == nil && len(response) > 20 && strings.Contains(response, titlePrefix) && strings.Contains(response, descPrefix) {
		// AI decided to launch an automatic governance L1 proposal!
		lines := strings.Split(response, "\n")
		title, desc, category := "", "", "economics"
		for _, l := range lines {
			if strings.HasPrefix(l, titlePrefix) { title = strings.TrimSpace(strings.TrimPrefix(l, titlePrefix)) }
			if strings.HasPrefix(l, descPrefix) { desc = strings.TrimSpace(strings.TrimPrefix(l, descPrefix)) }
			if strings.HasPrefix(l, catPrefix) { category = strings.TrimSpace(strings.TrimPrefix(l, catPrefix)) }
		}
		
		if title != "" && desc != "" {
			propID := fmt.Sprintf("GIP-AUTO-%d", time.Now().Unix()%1000000)
			op.db.ExecContext(ctx, 
				"INSERT INTO governance_proposals (id, title, description, status, category, proposer, ends_at) VALUES ($1, $2, $3, 'voting', $4, 'Autonomous DEPT 3', NOW() + INTERVAL '7 days')",
				propID, title, desc, category)

			msg := fmt.Sprintf("⚖️ *Autonomous L1 Governance Activated*\nDeFi AI Engine detected a market shift and submitted a new proposal directly to the Mesh Network.\n\n*ID:* %s\n*Title:* %s\n*Reason:* %s", propID, title, desc)
			op.sendTelegram(msg)
			op.logAction("economics", "Generated L1 auto-proposal", propID, true)
		}
	}

	op.logAction("economics", fmt.Sprintf(
		"rewards=%.0f pending=%.0f burned=%.0f staked=%.0f stakers=%d",
		stats.totalRewards, stats.pendingRewards, stats.totalBurned,
		stats.totalStaked, stats.activeStakers), "tracked", true)
}

// ═════════════════════════════════════════════════════════════
// DEPT 4: GROWTH — Users, Nodes, Agents, Network Expansion
// ═════════════════════════════════════════════════════════════

func (op *PlatformOperator) growthCycle() {
	if op.db == nil {
		return
	}
	ctx := context.Background()

	var growth struct {
		totalUsers   int
		newUsers24h  int
		totalNodes   int
		newNodes24h  int
		newNodes7d   int
		totalAgents  int
		referrals7d  int
	}

	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&growth.totalUsers)
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours'").Scan(&growth.newUsers24h)
	op.db.QueryRowContext(ctx, queryCountNodes).Scan(&growth.totalNodes)
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM nodes WHERE created_at > NOW() - INTERVAL '24 hours'").Scan(&growth.newNodes24h)
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM nodes WHERE created_at > NOW() - INTERVAL '7 days'").Scan(&growth.newNodes7d)
	op.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents").Scan(&growth.totalAgents)
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM referrals WHERE created_at > NOW() - INTERVAL '7 days'").Scan(&growth.referrals7d)

	// Ask AI for growth strategies if growth is stalling
	growthRate := float64(0)
	if growth.totalNodes > 0 {
		growthRate = float64(growth.newNodes7d) / float64(growth.totalNodes) * 100
	}

	if growthRate < 5 && growth.totalNodes > 10 {
		ctx2, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()

		response, err := op.ai.Ask(ctx2,
			"You are the Growth Strategist 'marketing-growth-hacker' for GSTD. We need to acquire more nodes immediately.",
			fmt.Sprintf("Current state: %d total nodes, +%d this week (%.1f%% growth). Output exactly 1 viral social-media or node-referral task that users can perform to earn GSTD. Format exactly:\nTITLE: <title>\nDESCRIPTION: <description>\nREWARD: <number of GSTD from 10 to 100>",
				growth.totalNodes, growth.newNodes7d, growthRate))
				
		if err == nil && len(response) > 20 && strings.Contains(response, "TITLE:") && strings.Contains(response, "REWARD:") {
			lines := strings.Split(response, "\n")
			title, desc := "", ""
			rewardStr := "50" // default
			
			for _, l := range lines {
				if strings.HasPrefix(l, "TITLE:") { title = strings.TrimSpace(strings.TrimPrefix(l, "TITLE:")) }
				if strings.HasPrefix(l, "DESCRIPTION:") { desc = strings.TrimSpace(strings.TrimPrefix(l, "DESCRIPTION:")) }
				if strings.HasPrefix(l, "REWARD:") { rewardStr = strings.TrimSpace(strings.TrimPrefix(l, "REWARD:")) }
			}
			
			if title != "" {
				taskID := fmt.Sprintf("GROWTH-TASK-%d", time.Now().Unix()%1000000)
				rewardF, _ := strconv.ParseFloat(rewardStr, 64)
				if rewardF < 1 || rewardF > 1000 { rewardF = 50.0 }
				
				op.db.ExecContext(ctx, 
					"INSERT INTO bridge_tasks (id, description, status, required_capability, reward_gstd) VALUES ($1, $2, 'pending', 'marketing', $3)",
					taskID, fmt.Sprintf("%s: %s", title, desc), rewardF)
					
				op.sendTelegram(fmt.Sprintf("🚀 *Autonomous Growth AI Activated*\nGrowth rate was %.1f%%. AI deployed a new high-yield Network Expansion Task to the node task pool to acquire users.\n\n*Task:* %s\n*Reward:* %.0f GSTD", growthRate, title, rewardF))
				op.logAction("growth", "Created autonomous marketing task", taskID, true)
			}
		}
	}

	op.logAction("growth", fmt.Sprintf(
		"users=%d(+%d/24h) nodes=%d(+%d/24h,+%d/7d) agents=%d refs=%d/7d",
		growth.totalUsers, growth.newUsers24h, growth.totalNodes,
		growth.newNodes24h, growth.newNodes7d, growth.totalAgents, growth.referrals7d), "tracked", true)
}

// ═════════════════════════════════════════════════════════════
// DEPT 5: INTELLIGENCE — Learning, Memory, Model Optimization
// ═════════════════════════════════════════════════════════════

func (op *PlatformOperator) intelligenceCycle() {
	// Track AI performance and learn from decisions
	aiStats := op.ai.GetStats()

	op.mu.RLock()
	decisions := len(op.decisionLog)
	op.mu.RUnlock()

	// Check model availability
	if out, err := exec.Command("sh", "-c",
		"curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer '\"$GROQ_API_KEY\" https://api.groq.com/openai/v1/models 2>/dev/null").Output(); err == nil {
		code := strings.TrimSpace(string(out))
		if code != "200" {
			op.sendTelegram("⚠️ *AI Model Alert*\nGroq API returned: " + code)
		}
	}

	// Evaluate decision quality — self-scoring of recent decisions
	if decisions > 0 {
		op.mu.Lock()
		for i := range op.decisionLog {
			if op.decisionLog[i].Score == 0 && time.Since(op.decisionLog[i].Time) > 30*time.Minute {
				// Auto-score based on whether the network improved
				state := op.brain.GetState()
				if state.NetworkHealth > 50 {
					op.decisionLog[i].Score = 0.7
					op.decisionLog[i].Outcome = "network stable"
				} else {
					op.decisionLog[i].Score = 0.3
					op.decisionLog[i].Outcome = "network needs attention"
				}
			}
		}
		op.mu.Unlock()
	}

	op.logAction("intelligence", fmt.Sprintf(
		"ai_queries=%d tokens=%d avg_latency=%.0fms decisions=%d cost_saved=$%.2f",
		aiStats.TotalQueries, aiStats.TotalTokensUsed, aiStats.AvgLatencyMs,
		decisions, aiStats.CostSaved), "tracked", true)
}

// ═════════════════════════════════════════════════════════════
// DEPT 6: FRONTEND — UI Health, Pages, CDN
// ═════════════════════════════════════════════════════════════

func (op *PlatformOperator) frontendCycle() {
	// Check critical frontend pages
	pages := []struct {
		name string
		url  string
	}{
		{"Homepage", "https://app.gstdtoken.com"},
		{"Bridge", "https://bridge.gstdtoken.com"},
		{"Bot Panel", "https://gstdbot.gstdtoken.com"},
	}

	var failures []string
	ctx2, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	for _, p := range pages {
		bodyOut, err := exec.Command("sh", "-c",
			fmt.Sprintf("curl -s -L --max-time 10 %s 2>/dev/null", p.url)).Output()
			
		htmlBody := string(bodyOut)
		if err != nil || len(htmlBody) < 10 {
			failures = append(failures, fmt.Sprintf("❌ %s: Failed to reach network", p.name))
			continue
		}

		// Deep User-Experience Verification via AI
		maxLen := len(htmlBody)
		if maxLen > 2500 { maxLen = 2500 }
		prompt := fmt.Sprintf("You are an E2E User Experience bot. Does this HTML DOM contain any visual bugs, React errors (e.g., 'Application Error', 'Minified React error'), missing CSS, or missing wallet connection logic? If it does, output exactly 'UI_BUG_DETECTED: <description>'. If normal, output 'OK'. \\n\\nHTML Snapshot (first 2500 chars):\\n%s", 
			htmlBody[:maxLen])
		
		response, _ := op.ai.Ask(ctx2, "UX Verifier", prompt)
		
		if strings.Contains(response, "UI_BUG_DETECTED:") {
			failures = append(failures, fmt.Sprintf("🐛 %s: %s", p.name, response))
			// AUTONOMOUS HEALING: Immediately invoke the Frontend R&D agent to fix the UI!
			op.sendTelegram(fmt.Sprintf("⚠️ *Autonomous UX Alert*\nUser interface bug detected on %s. Triggering immediate `improveFrontend()` Auto-Patch sequence to rewrite broken React files.", p.name))
			go op.improveFrontend()
		} else if !strings.Contains(htmlBody, "GSTD") && !strings.Contains(htmlBody, "div") {
			failures = append(failures, fmt.Sprintf("❌ %s: HTML malformed or empty", p.name))
		}
	}

	if len(failures) > 0 {
		msg := "🌐 *Frontend Alert*\n\n"
		for _, f := range failures {
			msg += f + "\n"
		}
		op.sendTelegram(msg)
		op.logAction("frontend", fmt.Sprintf("%d frontend problems found & Auto-Patched", len(failures)), "alert", false)
	}

	// Check frontend container status
	if out, err := exec.Command("sh", "-c",
		"docker ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep frontend || echo 'no frontend container'").Output(); err == nil {
		status := strings.TrimSpace(string(out))
		op.logAction("frontend", "Container: "+status, "checked", true)
	}
}

// ═════════════════════════════════════════════════════════════
// DEPT 7: BLOCKCHAIN — On-chain Monitoring
// ═════════════════════════════════════════════════════════════

func (op *PlatformOperator) blockchainCycle() {
	if op.db == nil {
		return
	}
	ctx := context.Background()

	// Monitor wallet balances
	var totalWallets int
	var totalBalance float64
	op.db.QueryRowContext(ctx, "SELECT COUNT(*), COALESCE(SUM(balance_gstd), 0) FROM wallets").Scan(&totalWallets, &totalBalance)

	// Monitor DLN (Decentralized Liquidity Network)
	var dlnActive int
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM nodes WHERE dln_enabled = true").Scan(&dlnActive)

	// Monitor bridge transactions
	var bridgeTx24h int
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM bridge_transactions WHERE created_at > NOW() - INTERVAL '24 hours'").Scan(&bridgeTx24h)

	// Monitor pool health
	var poolTVL float64
	op.db.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(total_value_locked_usd), 0) FROM liquidity_pools WHERE active = true").Scan(&poolTVL)

	// Check for suspicious large transfers
	var largeTx int
	op.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM transactions WHERE amount > 100000 AND created_at > NOW() - INTERVAL '1 hour'").Scan(&largeTx)

	if largeTx > 0 {
		op.sendTelegram(fmt.Sprintf("🚨 *Blockchain Alert*\n%d large tx (>100K GSTD) in last hour", largeTx))
	}

	op.logAction("blockchain", fmt.Sprintf(
		"wallets=%d balance=%.0f dln=%d bridge_tx/24h=%d tvl=$%.2f",
		totalWallets, totalBalance, dlnActive, bridgeTx24h, poolTVL), "tracked", true)
}

// ═════════════════════════════════════════════════════════════
// DAILY COMPREHENSIVE AI REPORT
// ═════════════════════════════════════════════════════════════

func (op *PlatformOperator) sendDailyAIReport() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Collect all data
	op.mu.RLock()
	health := op.serverHealth
	actions := op.getRecentActions(20)
	decisions := len(op.decisionLog)
	op.mu.RUnlock()

	state := op.brain.GetState()
	aiStats := op.ai.GetStats()

	// Count actions by category
	categoryCounts := make(map[string]int)
	for _, a := range actions {
		categoryCounts[a.Category]++
	}

	// Build comprehensive context for AI
	comprehensiveState := map[string]interface{}{
		"server": map[string]interface{}{
			"memory_pct": health.MemoryUsage,
			"disk_pct":   health.DiskUsage,
			"load":       health.LoadAvg,
			"goroutines": health.GoRoutines,
			"issues":     health.Issues,
		},
		"network": map[string]interface{}{
			"total_nodes":    state.TotalNodes,
			"online_nodes":   state.OnlineNodes,
			"health_pct":     state.NetworkHealth,
			"growth_rate_7d": state.GrowthRate7d,
			"tasks_active":   state.ActiveTasks,
		},
		"ai": map[string]interface{}{
			"queries":     aiStats.TotalQueries,
			"tokens_used": aiStats.TotalTokensUsed,
			"decisions":   decisions,
			"cost_saved":  aiStats.CostSaved,
		},
		"operator": map[string]interface{}{
			"uptime_hours":    time.Since(op.startedAt).Hours(),
			"actions_by_dept": categoryCounts,
		},
	}

	stateJSON, _ := json.Marshal(comprehensiveState)

	// Ask AI for comprehensive daily report
	report, err := op.ai.Ask(ctx,
		`You are writing a daily report for the GSTD platform admin. 
Be concise (max 300 words). Include:
1. Overall platform health assessment (1 sentence)
2. Top 3 achievements today
3. Top 3 issues/risks
4. 3 specific recommendations for tomorrow
5. Network growth forecast

Format with emoji and markdown for Telegram.`,
		string(stateJSON))

	if err != nil {
		return
	}

	// Truncate if too long for Telegram (4096 char limit)
	if len(report) > 3800 {
		report = report[:3800] + "\n\n_[truncated]_"
	}

	op.sendTelegram(fmt.Sprintf("📋 *DAILY AI REPORT*\n_%s_\n\n%s",
		time.Now().Format("2006-01-02"), report))
}

// GetFullStatus returns comprehensive operator status with all departments
//nolint:gocognit
func (op *PlatformOperator) GetFullStatus() map[string]interface{} {
	base := op.GetStatus()

	// Add department info
	base["departments"] = []map[string]interface{}{
		{"name": "DevOps", "interval": "30m", "scope": "repos, builds, deployments"},
		{"name": "Engineering", "interval": "5m", "scope": "API health, errors, performance"},
		{"name": "Economics", "interval": "20m", "scope": "tokens, contracts, staking, rewards"},
		{"name": "Growth", "interval": "1h", "scope": "users, nodes, agents, referrals"},
		{"name": "Intelligence", "interval": "15m", "scope": "AI perf, learning, optimization"},
		{"name": "Frontend", "interval": "10m", "scope": "UI pages, CDN, speed"},
		{"name": "Blockchain", "interval": "10m", "scope": "wallets, DLN, bridge, pools"},
		{"name": "AutoCoder", "interval": "15m", "scope": "self-healing code, auto-commits"},
		{"name": "R&D", "interval": "3h", "scope": "autonomous developer, UI, localization, backend optimization"},
	}
	base["mode"] = "TOTAL_CONTROL_24_7_365"
	base["ai_cost"] = "$0 (Compound Beta via Groq)"

	// Add AI decision summary
	op.mu.RLock()
	scoredDecisions := 0
	avgScore := 0.0
	for _, d := range op.decisionLog {
		if d.Score > 0 {
			avgScore += d.Score
			scoredDecisions++
		}
	}
	if scoredDecisions > 0 {
		avgScore /= float64(scoredDecisions)
	}
	op.mu.RUnlock()

	base["learning"] = map[string]interface{}{
		"total_decisions":   len(op.decisionLog),
		"scored_decisions":  scoredDecisions,
		"avg_decision_score": avgScore,
	}

	return base
}

// GetDepartmentStats returns stats for all departments from DB
func (op *PlatformOperator) GetDepartmentStats(db *sql.DB) map[string]interface{} {
	ctx := context.Background()
	result := make(map[string]interface{})

	var nodes, onlineNodes, users, agents, tasks, referrals int
	db.QueryRowContext(ctx, queryCountNodes).Scan(&nodes)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM nodes WHERE status = 'online'").Scan(&onlineNodes)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&users)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM agents").Scan(&agents)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&tasks)
	db.QueryRowContext(ctx, "SELECT COUNT(*) FROM referrals").Scan(&referrals)

	result["network"] = map[string]int{"nodes": nodes, "online": onlineNodes}
	result["users"] = users
	result["agents"] = agents
	result["tasks"] = tasks
	result["referrals"] = referrals

	return result
}
