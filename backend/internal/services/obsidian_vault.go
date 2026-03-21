package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// OBSIDIAN KNOWLEDGE VAULT — Platform Intelligence Layer
//
// Integrates Obsidian-style markdown vault into the autonomous
// platform for persistent knowledge, decision trees, and
// self-improving intelligence.
//
// Structure:
//   /home/ubuntu/vault/
//   ├── Daily/           YYYY-MM-DD.md daily logs
//   ├── Agents/          Agent profiles & performance
//   ├── Decisions/       AI decisions with outcomes
//   ├── Metrics/         Historical performance metrics
//   ├── Knowledge/       Learned patterns & optimizations
//   ├── Incidents/       Security/stability incidents
//   └── Marketplace/     Task marketplace analytics
//
// Every note uses [[wikilinks]] for interconnection.
// Tags: #agent #decision #metric #incident #marketplace
// ═══════════════════════════════════════════════════════════════

const VaultRoot = "/home/ubuntu/vault"
const vaultDateFmt = "2006-01-02"

type ObsidianVault struct {
	db      *sql.DB
	ai      *CompoundAI
	rootDir string
}

func NewObsidianVault(db *sql.DB, ai *CompoundAI) *ObsidianVault {
	v := &ObsidianVault{
		db:      db,
		ai:      ai,
		rootDir: VaultRoot,
	}
	v.initVaultStructure()
	return v
}

// ─── Initialize vault directory structure ────────────────────
func (v *ObsidianVault) initVaultStructure() {
	dirs := []string{
		"Daily", "Agents", "Decisions", "Metrics",
		"Knowledge", "Incidents", "Marketplace", "Templates",
	}
	for _, d := range dirs {
		os.MkdirAll(filepath.Join(v.rootDir, d), 0755)
	}

	// Create vault config (.obsidian folder)
	obsDir := filepath.Join(v.rootDir, ".obsidian")
	os.MkdirAll(obsDir, 0755)
	
	appJSON := `{"baseFontSize":16,"theme":"obsidian","translucency":true,"showFrontmatter":true}`
	os.WriteFile(filepath.Join(obsDir, "app.json"), []byte(appJSON), 0644)

	log.Printf("🧠 Obsidian Vault initialized at %s", v.rootDir)
}

// ─── Write a note (creates or appends) ──────────────────────
func (v *ObsidianVault) WriteNote(category, title, content string) error {
	dir := filepath.Join(v.rootDir, category)
	os.MkdirAll(dir, 0755)
	
	safeName := strings.ReplaceAll(title, "/", "-")
	safeName = strings.ReplaceAll(safeName, "\\", "-")
	safeName = strings.ReplaceAll(safeName, ":", "-")
	path := filepath.Join(dir, safeName+".md")

	return os.WriteFile(path, []byte(content), 0644)
}

// ─── Append to a note ───────────────────────────────────────
func (v *ObsidianVault) AppendNote(category, title, content string) error {
	dir := filepath.Join(v.rootDir, category)
	os.MkdirAll(dir, 0755)
	
	safeName := strings.ReplaceAll(title, "/", "-")
	safeName = strings.ReplaceAll(safeName, "\\", "-")
	safeName = strings.ReplaceAll(safeName, ":", "-")
	path := filepath.Join(dir, safeName+".md")

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = f.WriteString("\n" + content)
	return err
}

// ─── Read a note ────────────────────────────────────────────
func (v *ObsidianVault) ReadNote(category, title string) (string, error) {
	safeName := strings.ReplaceAll(title, "/", "-")
	safeName = strings.ReplaceAll(safeName, "\\", "-")
	safeName = strings.ReplaceAll(safeName, ":", "-")
	path := filepath.Join(v.rootDir, category, safeName+".md")
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ─── Search vault for a term ────────────────────────────────
func (v *ObsidianVault) SearchVault(query string) []string {
	var results []string
	query = strings.ToLower(query)

	filepath.Walk(v.rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".md") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		if strings.Contains(strings.ToLower(string(data)), query) {
			rel, _ := filepath.Rel(v.rootDir, path)
			results = append(results, rel)
		}
		if len(results) >= 20 {
			return filepath.SkipAll
		}
		return nil
	})
	return results
}

// ═══════════════════════════════════════════════════════════════
//  DAILY LOG — Automated daily knowledge capture
// ═══════════════════════════════════════════════════════════════

func (v *ObsidianVault) WriteDailyLog(health ServerHealth, networkState interface{}, aiStats interface{}, actions []OperatorAction) {
	today := time.Now().Format(vaultDateFmt)
	
	var actionsLog strings.Builder
	for _, a := range actions {
		icon := "✅"
		if !a.Success {
			icon = "❌"
		}
		actionsLog.WriteString(fmt.Sprintf("- %s %s `%s` → %s (%s)\n", 
			icon, a.Time.Format("15:04"), a.Category, a.Action, a.Result))
	}

	content := fmt.Sprintf(`---
date: %s
type: daily-log
tags: [daily, metrics, platform]
---

# 📅 Daily Log — %s

## 🖥 Server Health
| Metric | Value |
|--------|-------|
| CPU Load | %.2f |
| Memory | %.0f%% |
| Disk | %.0f%% (%.1fGB free) |
| Containers | %d/%d |
| Goroutines | %d |
| Uptime | %s |

## 🌐 Network State
%s

## 🧠 AI Stats
%s

## 🔧 Actions
%s

## 📝 Notes
> Auto-generated by [[Agents/PlatformOperator]]. Human notes can be added below.

---
[[Daily/%s|Previous Day]] ← → [[Daily/%s|Next Day]]
`,
		today, today,
		health.LoadAvg, health.MemoryUsage, health.DiskUsage, health.DiskFreeGB,
		health.Containers, health.ContainersTotal, health.GoRoutines, health.Uptime,
		v.toMarkdown(networkState),
		v.toMarkdown(aiStats),
		actionsLog.String(),
		time.Now().AddDate(0, 0, -1).Format(vaultDateFmt),
		time.Now().AddDate(0, 0, 1).Format(vaultDateFmt),
	)

	v.WriteNote("Daily", today, content)
}

// ═══════════════════════════════════════════════════════════════
//  DECISION LOG — Track AI decisions with outcomes
// ═══════════════════════════════════════════════════════════════

func (v *ObsidianVault) LogDecision(category, context, decision, outcome string, score float64) {
	id := fmt.Sprintf("DEC-%s-%d", category, time.Now().Unix()%100000)
	today := time.Now().Format(vaultDateFmt)

	content := fmt.Sprintf(`---
id: %s
date: %s
category: %s
score: %.2f
tags: [decision, %s, ai]
---

# 🤖 Decision: %s

## Context
%s

## Decision Made
%s

## Outcome
%s

## Score: %.0f%%

---
Related: [[Daily/%s]] | [[Agents/PlatformOperator]]
`,
		id, today, category, score,
		category,
		id,
		context, decision, outcome, score*100, today,
	)

	v.WriteNote("Decisions", id, content)

	// Also append to daily log
	v.AppendNote("Daily", today, fmt.Sprintf("\n### Decision %s\n- Category: %s\n- Score: %.0f%%\n- %s\n", id, category, score*100, decision))
}

// ═══════════════════════════════════════════════════════════════
//  MARKETPLACE ANALYTICS — Track task patterns
// ═══════════════════════════════════════════════════════════════

func (v *ObsidianVault) LogMarketplaceSnapshot() {
	if v.db == nil {
		return
	}
	ctx := context.Background()
	today := time.Now().Format(vaultDateFmt)

	var totalTasks, activeTasks, completedTasks, activeWorkers int
	var totalVolume, totalPayouts float64

	v.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
	v.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status IN ('pending','queued','assigned')").Scan(&activeTasks)
	v.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'completed'").Scan(&completedTasks)
	v.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(total_locked_gstd),0) FROM task_escrow").Scan(&totalVolume)
	v.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount_gstd),0) FROM transaction_history WHERE tx_type='worker_payout'").Scan(&totalPayouts)
	v.db.QueryRowContext(ctx, "SELECT COUNT(DISTINCT worker_wallet) FROM worker_ratings WHERE last_task_at > NOW() - INTERVAL '7 days'").Scan(&activeWorkers)

	content := fmt.Sprintf(`---
date: %s
type: marketplace-metrics
tags: [marketplace, metrics, escrow]
---

# 📊 Marketplace Snapshot — %s

| Metric | Value |
|--------|-------|
| Total Tasks | %d |
| Active Tasks | %d |
| Completed Tasks | %d |
| Total Volume | %.2f GSTD |
| Total Payouts | %.2f GSTD |
| Active Workers (7d) | %d |

## Anti-Fraud Status
- ✅ Escrow system active
- ✅ Wallet verification required
- ✅ Proof-based completion
- ✅ Reputation-weighted payouts (80-100%%)

---
Related: [[Daily/%s]] | [[Knowledge/Escrow System]]
`, today, today, totalTasks, activeTasks, completedTasks, totalVolume, totalPayouts, activeWorkers, today)

	v.WriteNote("Marketplace", "snapshot-"+today, content)
}

// ═══════════════════════════════════════════════════════════════
//  KNOWLEDGE EXTRACTION — AI learns from history
// ═══════════════════════════════════════════════════════════════

func (v *ObsidianVault) ExtractKnowledge(topic string) {
	if v.ai == nil {
		return
	}

	// Search existing vault notes on the topic
	related := v.SearchVault(topic)
	var vaultCtx strings.Builder
	for _, r := range related {
		data, err := os.ReadFile(filepath.Join(v.rootDir, r))
		if err == nil {
			snippet := string(data)
			if len(snippet) > 2000 {
				snippet = snippet[:2000] + "\n..."
			}
			vaultCtx.WriteString(fmt.Sprintf("## From %s:\n%s\n\n", r, snippet))
		}
	}

	if vaultCtx.Len() < 50 {
		return // Not enough data to learn from
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`Analyze these vault notes about "%s" and extract 3-5 key learnings as a concise Obsidian markdown note with [[wikilinks]] to related concepts. Include:
1. Pattern Summary
2. Key Metrics
3. Recommendations
4. Related notes (as [[links]])

Vault notes:
%s`, topic, vaultCtx.String())

	response, err := v.ai.Ask(ctx, "Knowledge extraction agent for Obsidian vault.", prompt)
	if err != nil || len(response) < 50 {
		return
	}

	content := fmt.Sprintf(`---
extracted: %s
topic: %s
tags: [knowledge, pattern, ai-extracted]
---

# 🧠 Learned: %s

%s

---
_Extracted by AI from %d vault notes on %s_
`, time.Now().Format(time.RFC3339), topic, topic, response, len(related), time.Now().Format(vaultDateFmt))

	v.WriteNote("Knowledge", topic, content)
	log.Printf("🧠 Obsidian: Extracted knowledge about '%s' from %d notes", topic, len(related))
}

// ═══════════════════════════════════════════════════════════════
//  INCIDENT TRACKING — Auto-log incidents
// ═══════════════════════════════════════════════════════════════

func (v *ObsidianVault) LogIncident(severity, title, details, resolution string) {
	id := fmt.Sprintf("INC-%d", time.Now().Unix()%100000)
	today := time.Now().Format(vaultDateFmt)

	content := fmt.Sprintf(`---
id: %s
date: %s
severity: %s
resolved: %s
tags: [incident, %s, %s]
---

# 🚨 Incident: %s

**ID:** %s  
**Severity:** %s  
**Time:** %s  

## Details
%s

## Resolution
%s

---
Related: [[Daily/%s]]
`,
		id, today, severity,
		func() string { if resolution != "" { return "true" }; return "false" }(),
		severity, strings.ToLower(title),
		title, id, severity,
		time.Now().Format("15:04:05"),
		details, resolution, today,
	)

	v.WriteNote("Incidents", id, content)
}

// ─── Helper: convert interface to markdown ──────────────────
func (v *ObsidianVault) toMarkdown(data interface{}) string {
	if data == nil {
		return "_No data_"
	}
	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Sprintf("%v", data)
	}
	return "```json\n" + string(jsonBytes) + "\n```"
}
