package services

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// DEPT 8: AUTO-CODER — Autonomous Self-Healing Codebase
//
// The PlatformOperator detects errors in the logs, finds the 
// source code file, sends it to Compound AI to get a fix, 
// modifies the code on disk, and commits the change to Git.
// ═══════════════════════════════════════════════════════════════

const deptAutoCoder = "auto-coder"

func (op *PlatformOperator) StartAutoCoder() {
	go op.loop(deptAutoCoder, 15*time.Minute, op.autoCoderCycle)
	log.Println("🤖 DEPT 8: AUTO-CODER ACTIVE (Self-Healing Codebase)")
}

//nolint:gocognit // Sequential script-like execution for self-healing
func (op *PlatformOperator) autoCoderCycle() {
	// 1. Scan recent logs for panics or severe errors
	out, err := exec.Command("sh", "-c",
		"docker logs ubuntu-backend-blue-1 --since 15m 2>&1 | grep -E 'panic:|nil pointer|index out of range|fatal error' -A 3").Output()

	if err != nil || len(out) == 0 {
		return // No critical errors
	}

	errorLog := string(out)

	// Avoid fixing the same error multiple times (basic deduplication)
	op.mu.RLock()
	recentFixes := len(op.operatorLog)
	op.mu.RUnlock()
	if recentFixes > 0 {
		for i := 1; i <= 5 && i <= recentFixes; i++ {
			if op.operatorLog[recentFixes-i].Category == deptAutoCoder {
				// We already did a fix recently, wait to see if it worked
				return
			}
		}
	}

	op.sendTelegram("🛠 *Auto-Coder Triggered*\nDetected severe error, analyzing source code to apply self-healing patch...")

	// 2. Identify the file and line number
	// e.g. /app/internal/api/routes.go:123
	re := regexp.MustCompile(`(/app/[a-zA-Z0-9_./-]+):([0-9]+)`)
	matches := re.FindStringSubmatch(errorLog)
	
	if len(matches) < 3 {
		return // Could not parse file location
	}

	containerFile := matches[1]
	// Map /app from container to host path mounted at /home/ubuntu/backend
	hostFile := strings.Replace(containerFile, "/app", "/home/ubuntu/backend", 1)

	// Read the file context
	codeOut, err := exec.Command("cat", hostFile).Output()
	if err != nil {
		return
	}
	codeContent := string(codeOut)

	// Limit context to avoid token limits
	if len(codeContent) > 10000 {
		codeContent = codeContent[:10000] + "\n// ... truncated ..."
	}

	// 3. Ask Compound AI for the fix
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	prompt := fmt.Sprintf(`You are the Auto-Coder for GSTD Platform. Fix the following error.
Error log:
%s

File context (%s):
%s

Output ONLY a bash script using 'sed' or 'awk' that fixes the code in the file %s.
Do not output ANYTHING else. No markdown wrapping. Just the bash commands.
Make sure the command applies correctly.`, errorLog, hostFile, codeContent, hostFile)

	aiFixScript, err := op.ai.Ask(ctx, "You are a senior golang system administrator. Respond only with raw bash commands.", prompt)
	if err != nil || len(aiFixScript) < 10 {
		op.sendTelegram("❌ *Auto-Coder Failed*\nCould not generate AI fix.")
		return
	}

	// Clean up AI output (sometimes they return markdown even when told not to)
	aiFixScript = strings.TrimPrefix(aiFixScript, "```bash")
	aiFixScript = strings.TrimPrefix(aiFixScript, "```")
	aiFixScript = strings.TrimSuffix(aiFixScript, "```")
	aiFixScript = strings.TrimSpace(aiFixScript)

	// 4. Apply the fix
	fixCmd := exec.Command("sh", "-c", aiFixScript)
	fixOut, fixErr := fixCmd.CombinedOutput()
	
	if fixErr != nil {
		op.logAction(deptAutoCoder, "Failed to apply AI patch", string(fixOut), false)
		return
	}

	// 5. Test the compilation
	buildCmd := exec.Command("sh", "-c", "cd /home/ubuntu/backend && go build ./...")
	if buildErr := buildCmd.Run(); buildErr != nil {
		// Compilation failed! Revert changes.
		exec.Command("sh", "-c", "cd /home/ubuntu/backend && git checkout -- .").Run()
		op.sendTelegram("❌ *Auto-Coder Patch Failed Compilation*\nReverted changes automatically.")
		return
	}

	// 6. Commit and Push
	commitMsg := "fix(auto-coder): AI self-healing applied triggered by runtime panic"
	exec.Command("sh", "-c", fmt.Sprintf("cd /home/ubuntu/backend && git add %s && git commit -m '%s' && git push origin main", hostFile, commitMsg)).Run()

	// 7. Restart the service to apply the fix
	exec.Command("sh", "-c", "docker restart ubuntu-backend-blue-1 ubuntu-backend-blue-2 ubuntu-backend-blue-3 ubuntu-backend-blue-4").Run()

	op.logAction(deptAutoCoder, fmt.Sprintf("Applied self-healing to %s", containerFile), "success", true)
	op.sendTelegram(fmt.Sprintf("✅ *Auto-Coder Self-Healing Success*\n\nFile patched: `%s`\nCode compiled and committed. Services restarted.", containerFile))
}
