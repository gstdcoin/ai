package services

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os/exec"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// DEPT 9: R&D (Autonomous Developer) — Proactive Platform Engineering
//
// Continuously iterates over repositories (Frontend, Backend, Node Bot,
// Telegram Bot, Localization) and autonomously develops improvements:
// - Finds missing translation keys (Localization)
// - Polishes frontend code / UI logic
// - Refactors backend / gstdbot code
// - Generates patch -> Tests build via Docker -> Commits -> Restarts
// ═══════════════════════════════════════════════════════════════

func (op *PlatformOperator) StartAutonomousDeveloper() {
	// Every 3 hours, pick a repository and improve it natively
	go op.loop("rnd-developer", 3*time.Hour, op.rndDevelopmentCycle)
	log.Println("🛠 DEPT 9: R&D (Autonomous Developer) ACTIVE")
}

func (op *PlatformOperator) rndDevelopmentCycle() {
	domains := []string{"localization", "frontend", "gstdbot", "backend"}
	
	// Randomly pick an area to improve or optimize
	rand.Seed(time.Now().UnixNano())
	targetDomain := domains[rand.Intn(len(domains))]
	
	op.sendTelegram(fmt.Sprintf("💻 *Autonomous R&D Initiated*\nTarget domain: `%s`\nAnalyzing codebase to generate improvements...", targetDomain))

	switch targetDomain {
	case "localization":
		op.improveLocalization()
	case "frontend":
		op.improveFrontend()
	case "gstdbot":
		op.improveGSTDBot()
	case "backend":
		op.improveBackend()
	}
}

// ─── 1. LOCALIZATION CONTROL ──────────────────────────────────────────────────
func (op *PlatformOperator) improveLocalization() {
	baseDir := "/home/ubuntu/frontend/public/locales"
	
	// Get EN and RU JSON contents
	enOut, _ := exec.Command("cat", baseDir+"/en/common.json").Output()
	ruOut, _ := exec.Command("cat", baseDir+"/ru/common.json").Output()

	if len(enOut) == 0 || len(ruOut) == 0 {
		return
	}

	enJson := string(enOut)
	ruJson := string(ruOut)

	// Don't send huge files; limit to ~200 lines if massive
	if len(enJson) > 5000 { enJson = enJson[:5000] + "\n..." }
	if len(ruJson) > 5000 { ruJson = ruJson[:5000] + "\n..." }

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`You are the Localization AI. Find any keys missing in RU but present in EN, or improve the RU translation flow.
EN JSON:
%s
RU JSON:
%s
Output ONLY a sed or jq bash script that modifies '%s/ru/common.json' to fix these translations. Do NOT output markdown. Just the bash script.`, enJson, ruJson, baseDir)

	patch, err := op.ai.Ask(ctx, "You are a bash script engine.", prompt)
	if err != nil || len(patch) < 10 {
		return
	}
	
	patch = op.cleanBashOutput(patch)
	
	if err := exec.Command("sh", "-c", patch).Run(); err != nil {
		op.logAction("rnd-localization", "Failed applying translation patch", err.Error(), false)
		return
	}

	// Commit
	exec.Command("sh", "-c", "cd /home/ubuntu/frontend && git add public/locales && git commit -m 'feat(i18n): 🌐 auto-translated missing keys by AI' && git push origin main").Run()
	op.sendTelegram("🌐 *Localization Updated*\nAI detected and translated missing keys in `ru/common.json`.")
	op.logAction("rnd-localization", "Auto-translated keys", "success", true)
}

// ─── 2. FRONTEND IMPROVEMENTS ─────────────────────────────────────────────────
func (op *PlatformOperator) improveFrontend() {
	// Let's improve a core component, e.g. Bridge page or Dashboard
	targetFile := "/home/ubuntu/frontend/src/pages/index.tsx" 
	
	codeOut, err := exec.Command("cat", targetFile).Output()
	if err != nil || len(codeOut) == 0 {
		return
	}
	code := string(codeOut)
	if len(code) > 8000 { code = code[:8000] + "\n..." }

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`You are a Senior React Developer. Propose ONE clean UI/UX or performance improvement to the following React code in '%s'.
Output ONLY a unified bash script using 'sed' to patch the file. Do NOT output markdown or explanations.
Code:
%s`, targetFile, code)

	patch, err := op.ai.Ask(ctx, "You are a bash execution service.", prompt)
	if err != nil { return }
	
	patch = op.cleanBashOutput(patch)
	if err := exec.Command("sh", "-c", patch).Run(); err != nil { return }

	// Test compilation via Docker
	buildCmd := exec.Command("sh", "-c", "docker run --rm -v /home/ubuntu/frontend:/app -w /app node:18-alpine npm run build")
	if buildErr := buildCmd.Run(); buildErr != nil {
		exec.Command("sh", "-c", "cd /home/ubuntu/frontend && git checkout -- .").Run()
		return // Failed build, reject patch
	}

	exec.Command("sh", "-c", fmt.Sprintf("cd /home/ubuntu/frontend && git add %s && git commit -m 'refactor(ui): 🎨 AI UI/UX auto-improvement' && git push origin main", targetFile)).Run()
	// No restart needed since Vercel automatically deploys frontend pushes!
	op.sendTelegram(fmt.Sprintf("✨ *Frontend Improved*\nPatched `%s`, passed build, pushed to Vercel.", targetFile))
	op.logAction("rnd-frontend", "Applied React UI optimization", "success", true)
}

// ─── 3. NODE & TELEGRAM BOT (GSTDBOT) ─────────────────────────────────────────
func (op *PlatformOperator) improveGSTDBot() {
	// Improve node agent logic
	targetFile := "/home/ubuntu/gstdbot/src/bot/telegramBot.ts" 
	
	codeOut, err := exec.Command("cat", targetFile).Output()
	if err != nil || len(codeOut) == 0 {
		return
	}
	code := string(codeOut)
	if len(code) > 8000 { code = code[:8000] + "\n..." }

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`You are an AI developing a Telegram Bot in TypeScript. Suggest a clean logical improvement, code-cleanup, or added error-handling for '%s'.
Output ONLY a unified 'sed' bash script to apply the patch. No markdown.
Code:
%s`, targetFile, code)

	patch, err := op.ai.Ask(ctx, "Bash script only.", prompt)
	if err != nil { return }
	
	patch = op.cleanBashOutput(patch)
	if err := exec.Command("sh", "-c", patch).Run(); err != nil { return }

	// Test via docker
	buildCmd := exec.Command("sh", "-c", "docker run --rm -v /home/ubuntu/gstdbot:/app -w /app node:18-alpine npm run build")
	if buildErr := buildCmd.Run(); buildErr != nil {
		exec.Command("sh", "-c", "cd /home/ubuntu/gstdbot && git checkout -- .").Run()
		return
	}

	exec.Command("sh", "-c", fmt.Sprintf("cd /home/ubuntu/gstdbot && git add %s && git commit -m 'refactor(bot): 🤖 AI auto-cleanup & logic improvement' && git push origin main", targetFile)).Run()
	exec.Command("sh", "-c", "docker restart gstd-telegram-bot").Run()

	op.sendTelegram("🤖 *Telegram Bot / Node Improved*\nAI refactored TypeScript logic, pushed to git, and restarted the bot container.")
	op.logAction("rnd-gstdbot", "Refactored telegramBot.ts", "success", true)
}

// ─── 4. BACKEND REFACTORING ───────────────────────────────────────────────────
func (op *PlatformOperator) improveBackend() {
	targetFile := "/home/ubuntu/backend/internal/services/compound_ai.go"
	
	codeOut, err := exec.Command("cat", targetFile).Output()
	if err != nil || len(codeOut) == 0 { return }
	code := string(codeOut)
	if len(code) > 8000 { code = code[:8000] + "\n..." }

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`You are a Golang Optimization AI. Propose ONE structural or efficiency improvement for the file '%s'.
Output ONLY a 'sed' bash script. Absolutely no markdown or explanations.
Code:
%s`, targetFile, code)

	patch, err := op.ai.Ask(ctx, "Bash script only.", prompt)
	if err != nil { return }
	
	patch = op.cleanBashOutput(patch)
	if err := exec.Command("sh", "-c", patch).Run(); err != nil { return }

	// Compile locally to verify
	if buildErr := exec.Command("sh", "-c", "cd /home/ubuntu/backend && go build ./...").Run(); buildErr != nil {
		exec.Command("sh", "-c", "cd /home/ubuntu/backend && git checkout -- .").Run()
		return
	}

	exec.Command("sh", "-c", fmt.Sprintf("cd /home/ubuntu/backend && git add %s && git commit -m 'refactor(backend): ⚙️ AI memory/speed optimization' && git push origin main", targetFile)).Run()
	// Restart
	exec.Command("sh", "-c", "docker restart ubuntu-backend-blue-1 ubuntu-backend-blue-2 ubuntu-backend-blue-3 ubuntu-backend-blue-4").Run()

	op.sendTelegram("⚙️ *Backend Optimized*\nAI proposed efficiency upgrades, verified compilation, pushed code, and cycled instances.")
	op.logAction("rnd-backend", "Optimized Go logic", "success", true)
}

func (op *PlatformOperator) cleanBashOutput(in string) string {
	in = strings.TrimPrefix(in, "```bash")
	in = strings.TrimPrefix(in, "```sh")
	in = strings.TrimPrefix(in, "```")
	in = strings.TrimSuffix(in, "```")
	return strings.TrimSpace(in)
}
