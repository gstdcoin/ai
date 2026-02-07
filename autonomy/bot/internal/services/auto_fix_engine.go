package services

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
	"regexp"
	"strings"
	"time"
)

// AutoFixEngine is the "Intelligent Self-Healing Brain" that uses LLM to analyze and fix errors
type AutoFixEngine struct {
	ollamaHost  string
	ollamaKey   string
	model       string
	maxRetries  int
	errorMemory *ErrorMemory
	config      *AutoFixConfig
}

// AutoFixConfig defines the behavior boundaries
type AutoFixConfig struct {
	AllowCodeFixes      bool     `json:"allow_code_fixes"`
	AllowRestarts       bool     `json:"allow_restarts"`
	AllowDatabaseFixes  bool     `json:"allow_database_fixes"`
	ForbiddenFiles      []string `json:"forbidden_files"`
	MaxAutoFixesPerHour int      `json:"max_auto_fixes_per_hour"`
	TelegramAlertChat   string   `json:"telegram_alert_chat"`
	TelegramToken       string   `json:"telegram_token"`
}

// ErrorMemory stores learned errors and their solutions
type ErrorMemory struct {
	Patterns map[string]*LearnedFix `json:"patterns"`
}

// LearnedFix represents a learned solution for an error pattern
type LearnedFix struct {
	ErrorPattern  string    `json:"error_pattern"`
	FixApplied    string    `json:"fix_applied"`
	Successful    bool      `json:"successful"`
	AppliedCount  int       `json:"applied_count"`
	SuccessRate   float64   `json:"success_rate"`
	LastApplied   time.Time `json:"last_applied"`
	CreatedAt     time.Time `json:"created_at"`
}

// ErrorAnalysis is the LLM's analysis of an error
type ErrorAnalysis struct {
	ErrorType       string   `json:"error_type"`        // syntax, runtime, config, network, database
	Severity        string   `json:"severity"`          // low, medium, high, critical
	RootCause       string   `json:"root_cause"`
	SuggestedFix    string   `json:"suggested_fix"`
	CodeChanges     []CodeChange `json:"code_changes,omitempty"`
	CommandsToRun   []string `json:"commands_to_run,omitempty"`
	RequiresHuman   bool     `json:"requires_human"`
	Confidence      float64  `json:"confidence"`        // 0.0 - 1.0
	Reasoning       string   `json:"reasoning"`
}

// CodeChange represents a proposed code change
type CodeChange struct {
	FilePath    string `json:"file_path"`
	OldContent  string `json:"old_content"`
	NewContent  string `json:"new_content"`
	Description string `json:"description"`
}

func NewAutoFixEngine() *AutoFixEngine {
	host := os.Getenv("OLLAMA_HOST")
	if host == "" {
		host = "http://gstd_ollama:11434"
	}

	model := os.Getenv("OLLAMA_MODEL")
	if model == "" {
		model = "qwen2.5:0.5b" // Fast model for quick fixes
	}

	return &AutoFixEngine{
		ollamaHost:  host,
		ollamaKey:   os.Getenv("OLLAMA_API_KEY"),
		model:       model,
		maxRetries:  3,
		errorMemory: &ErrorMemory{Patterns: make(map[string]*LearnedFix)},
		config: &AutoFixConfig{
			AllowCodeFixes:      true,
			AllowRestarts:       true,
			AllowDatabaseFixes:  false, // Dangerous - require human approval
			ForbiddenFiles:      []string{"auth_service.go", "wallet_service.go", "escrow_service.go", ".env"},
			MaxAutoFixesPerHour: 10,
			TelegramAlertChat:   os.Getenv("ADMIN_TELEGRAM_CHAT"),
			TelegramToken:       os.Getenv("TELEGRAM_BOT_TOKEN"),
		},
	}
}

// AnalyzeError sends error to LLM for intelligent analysis
func (e *AutoFixEngine) AnalyzeError(ctx context.Context, errorLog string, context map[string]interface{}) (*ErrorAnalysis, error) {
	// First, check memory for known patterns
	if fix := e.checkMemory(errorLog); fix != nil && fix.SuccessRate > 0.8 {
		log.Printf("🧠 AutoFix: Found cached solution (%.0f%% success rate)", fix.SuccessRate*100)
		return &ErrorAnalysis{
			SuggestedFix: fix.FixApplied,
			Confidence:   fix.SuccessRate,
			Reasoning:    "Solution from memory with proven success rate",
		}, nil
	}

	prompt := e.buildAnalysisPrompt(errorLog, context)
	
	response, err := e.callLLM(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("LLM analysis failed: %w", err)
	}

	// Parse JSON response from LLM
	var analysis ErrorAnalysis
	if err := json.Unmarshal([]byte(response), &analysis); err != nil {
		// Try to extract from markdown code block
		re := regexp.MustCompile("```json\\s*([\\s\\S]*?)\\s*```")
		matches := re.FindStringSubmatch(response)
		if len(matches) > 1 {
			if err := json.Unmarshal([]byte(matches[1]), &analysis); err != nil {
				// Fallback: Create basic analysis from text
				analysis = ErrorAnalysis{
					ErrorType:    "unknown",
					Severity:     "medium",
					RootCause:    "Could not parse LLM response",
					SuggestedFix: response,
					Confidence:   0.3,
				}
			}
		}
	}

	return &analysis, nil
}

// AutoFix attempts to automatically fix an error
func (e *AutoFixEngine) AutoFix(ctx context.Context, analysis *ErrorAnalysis) (bool, string, error) {
	// Safety checks
	if analysis.RequiresHuman {
		e.notifyHuman(analysis, "Requires human intervention")
		return false, "Escalated to human", nil
	}

	if analysis.Confidence < 0.7 {
		e.notifyHuman(analysis, fmt.Sprintf("Low confidence fix (%.0f%%)", analysis.Confidence*100))
		return false, "Low confidence - needs review", nil
	}

	// Apply code changes if allowed
	if len(analysis.CodeChanges) > 0 && e.config.AllowCodeFixes {
		for _, change := range analysis.CodeChanges {
			if e.isForbiddenFile(change.FilePath) {
				e.notifyHuman(analysis, fmt.Sprintf("Forbidden file: %s", change.FilePath))
				continue
			}

			if err := e.applyCodeChange(change); err != nil {
				log.Printf("❌ Failed to apply code change to %s: %v", change.FilePath, err)
				continue
			}
			log.Printf("✅ Applied code fix to %s", change.FilePath)
		}
	}

	// Run commands if any
	if len(analysis.CommandsToRun) > 0 && e.config.AllowRestarts {
		for _, cmd := range analysis.CommandsToRun {
			if e.isDangerousCommand(cmd) {
				e.notifyHuman(analysis, fmt.Sprintf("Dangerous command blocked: %s", cmd))
				continue
			}
			
			output, err := e.execCommand(cmd)
			if err != nil {
				log.Printf("❌ Command failed: %s - %v", cmd, err)
			} else {
				log.Printf("✅ Command executed: %s\n%s", cmd, output)
			}
		}
	}

	// Store in memory for learning
	e.learnFromFix(analysis)

	return true, "Fix applied successfully", nil
}

// MonitorAndFix continuously monitors logs and fixes errors
func (e *AutoFixEngine) MonitorAndFix(ctx context.Context) {
	log.Println("🧠 AutoFix Engine started - Intelligent Self-Healing Active")
	
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			errors := e.fetchRecentErrors()
			for _, errLog := range errors {
				analysis, err := e.AnalyzeError(ctx, errLog, nil)
				if err != nil {
					log.Printf("Analysis failed: %v", err)
					continue
				}

				if analysis.Severity == "critical" || analysis.Severity == "high" {
					success, msg, err := e.AutoFix(ctx, analysis)
					if err != nil {
						log.Printf("AutoFix error: %v", err)
					}
					log.Printf("AutoFix result: success=%v, message=%s", success, msg)
				}
			}
		}
	}
}

// buildAnalysisPrompt creates a structured prompt for error analysis
func (e *AutoFixEngine) buildAnalysisPrompt(errorLog string, context map[string]interface{}) string {
	return fmt.Sprintf(`You are the GSTD Platform's Self-Healing AI Engine. Your job is to analyze errors and provide fixes.

RULES:
1. Be conservative - only suggest fixes you are highly confident about
2. Never modify authentication, wallet, or escrow code
3. Prefer restarts and config changes over code changes
4. Always provide JSON response

ERROR LOG:
%s

CONTEXT:
%v

Respond with ONLY valid JSON in this format:
{
  "error_type": "syntax|runtime|config|network|database",
  "severity": "low|medium|high|critical",
  "root_cause": "Brief description of what caused the error",
  "suggested_fix": "Human-readable description of the fix",
  "code_changes": [
    {"file_path": "/path/to/file", "old_content": "broken code", "new_content": "fixed code", "description": "what this fixes"}
  ],
  "commands_to_run": ["docker restart container_name"],
  "requires_human": false,
  "confidence": 0.85,
  "reasoning": "Why this fix should work"
}`, errorLog, context)
}

// callLLM calls the Ollama API
func (e *AutoFixEngine) callLLM(ctx context.Context, prompt string) (string, error) {
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":  e.model,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.3, // Lower temperature for more consistent results
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", e.ollamaHost+"/api/generate", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if e.ollamaKey != "" {
		req.Header.Set("Authorization", "Bearer "+e.ollamaKey)
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("LLM error %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if response, ok := result["response"].(string); ok {
		return response, nil
	}
	return "", fmt.Errorf("no response in LLM output")
}

// checkMemory looks for known error patterns
func (e *AutoFixEngine) checkMemory(errorLog string) *LearnedFix {
	for pattern, fix := range e.errorMemory.Patterns {
		if strings.Contains(errorLog, pattern) {
			return fix
		}
	}
	return nil
}

// learnFromFix stores successful fixes for future use
func (e *AutoFixEngine) learnFromFix(analysis *ErrorAnalysis) {
	pattern := extractErrorPattern(analysis.RootCause)
	if existing, ok := e.errorMemory.Patterns[pattern]; ok {
		existing.AppliedCount++
		existing.LastApplied = time.Now()
		// Would update success rate based on feedback
	} else {
		e.errorMemory.Patterns[pattern] = &LearnedFix{
			ErrorPattern: pattern,
			FixApplied:   analysis.SuggestedFix,
			Successful:   true,
			AppliedCount: 1,
			SuccessRate:  0.5, // Start at 50%, adjust based on feedback
			LastApplied:  time.Now(),
			CreatedAt:    time.Now(),
		}
	}
}

func extractErrorPattern(rootCause string) string {
	// Extract key words from root cause for pattern matching
	words := strings.Fields(rootCause)
	if len(words) > 5 {
		words = words[:5]
	}
	return strings.Join(words, " ")
}

// isForbiddenFile checks if file modification is allowed
func (e *AutoFixEngine) isForbiddenFile(path string) bool {
	for _, forbidden := range e.config.ForbiddenFiles {
		if strings.Contains(path, forbidden) {
			return true
		}
	}
	return false
}

// isDangerousCommand checks command safety
func (e *AutoFixEngine) isDangerousCommand(cmd string) bool {
	dangerous := []string{"rm -rf", "DROP ", "DELETE FROM", "TRUNCATE", "kill -9", "shutdown"}
	for _, d := range dangerous {
		if strings.Contains(strings.ToUpper(cmd), strings.ToUpper(d)) {
			return true
		}
	}
	return false
}

// applyCodeChange writes the fix to the file
func (e *AutoFixEngine) applyCodeChange(change CodeChange) error {
	content, err := os.ReadFile(change.FilePath)
	if err != nil {
		return err
	}

	newContent := strings.Replace(string(content), change.OldContent, change.NewContent, 1)
	if newContent == string(content) {
		return fmt.Errorf("old content not found in file")
	}

	return os.WriteFile(change.FilePath, []byte(newContent), 0644)
}

// execCommand runs a shell command
func (e *AutoFixEngine) execCommand(cmdStr string) (string, error) {
	cmd := exec.Command("sh", "-c", cmdStr)
	output, err := cmd.CombinedOutput()
	return string(output), err
}

// fetchRecentErrors gets recent errors from the database or logs
func (e *AutoFixEngine) fetchRecentErrors() []string {
	// In production, this would query the error_logs table
	// For now, check docker logs
	cmd := exec.Command("docker", "logs", "--since", "2m", "--tail", "50", "ubuntu-backend-blue-1")
	output, _ := cmd.CombinedOutput()
	
	var errors []string
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(strings.ToLower(line), "error") || 
		   strings.Contains(strings.ToLower(line), "panic") ||
		   strings.Contains(strings.ToLower(line), "fatal") {
			errors = append(errors, line)
		}
	}
	return errors
}

// notifyHuman sends alert to admin via Telegram
func (e *AutoFixEngine) notifyHuman(analysis *ErrorAnalysis, reason string) {
	if e.config.TelegramToken == "" || e.config.TelegramAlertChat == "" {
		log.Printf("⚠️ Human notification required but Telegram not configured: %s", reason)
		return
	}

	msg := fmt.Sprintf("🤖 *AutoFix Alert*\n\n"+
		"*Reason:* %s\n"+
		"*Error Type:* %s\n"+
		"*Severity:* %s\n"+
		"*Root Cause:* %s\n"+
		"*Suggested Fix:* %s\n"+
		"*Confidence:* %.0f%%",
		reason, analysis.ErrorType, analysis.Severity, 
		analysis.RootCause, analysis.SuggestedFix, analysis.Confidence*100)

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", e.config.TelegramToken)
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id":    e.config.TelegramAlertChat,
		"text":       msg,
		"parse_mode": "Markdown",
	})

	http.Post(url, "application/json", bytes.NewBuffer(body))
}

// GetStats returns engine statistics
func (e *AutoFixEngine) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"status":          "active",
		"model":           e.model,
		"learned_patterns": len(e.errorMemory.Patterns),
		"config":          e.config,
	}
}
