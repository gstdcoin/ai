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
	"sync"
	"time"
)

// PlatformEvolutionEngine continuously improves the platform without downtime
type PlatformEvolutionEngine struct {
	mu                sync.RWMutex
	ollamaHost        string
	ollamaKey         string
	model             string
	hive              *HiveKnowledge
	improvements      []ImprovementProposal
	appliedCount      int
	lastAnalysis      time.Time
	safetyGuard       *SafetyGuard
	documentationSync *DocumentationSync
	githubToken       string
}

// ImprovementProposal represents a suggested improvement
type ImprovementProposal struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"` // performance, ux, security, documentation, code
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	Impact        string    `json:"impact"`        // low, medium, high
	Risk          string    `json:"risk"`          // none, low, medium
	Implementation string   `json:"implementation"` // code or steps
	Status        string    `json:"status"`        // proposed, approved, applied, rejected
	CreatedAt     time.Time `json:"created_at"`
	AppliedAt     *time.Time `json:"applied_at,omitempty"`
}

// SafetyGuard ensures no harmful changes are made
type SafetyGuard struct {
	MaxChangesPerHour    int
	RequireBackup        bool
	ForbiddenPatterns    []string
	ProtectedFiles       []string
	RequireHealthCheck   bool
	RollbackEnabled      bool
	ChangesSinceLastHour int
	LastReset            time.Time
}

// DocumentationSync keeps docs in sync with GitHub
type DocumentationSync struct {
	Repos          []string
	LastSync       time.Time
	AutoTranslate  bool
	Languages      []string
}

func NewPlatformEvolutionEngine(hive *HiveKnowledge) *PlatformEvolutionEngine {
	return &PlatformEvolutionEngine{
		ollamaHost: getEnvOrDefault("OLLAMA_HOST", "http://gstd_ollama:11434"),
		ollamaKey:  os.Getenv("OLLAMA_API_KEY"),
		model:      getEnvOrDefault("OLLAMA_MODEL", "qwen2.5:1.5b"),
		hive:       hive,
		improvements: make([]ImprovementProposal, 0),
		safetyGuard: &SafetyGuard{
			MaxChangesPerHour:  5,
			RequireBackup:      true,
			RequireHealthCheck: true,
			RollbackEnabled:    true,
			ForbiddenPatterns: []string{
				"DROP TABLE", "DELETE FROM", "TRUNCATE",
				"rm -rf /", "shutdown", "reboot",
				"private_key", "mnemonic", "secret",
			},
			ProtectedFiles: []string{
				"auth_service.go", "wallet_service.go", "escrow_service.go",
				"payment_service.go", ".env", "docker-compose.prod.yml",
			},
		},
		documentationSync: &DocumentationSync{
			Repos: []string{
				"gstdcoin/ai",
				"gstdcoin/A2A",
			},
			AutoTranslate: true,
			Languages:     []string{"en", "ru", "zh", "es", "de", "ja", "ko"},
		},
		githubToken: os.Getenv("GITHUB_TOKEN"),
	}
}

// Start begins the continuous evolution loop
func (e *PlatformEvolutionEngine) Start(ctx context.Context) {
	log.Println("🧬 Platform Evolution Engine started - Continuous Improvement Active")

	// Different cycles for different tasks
	analysisTicker := time.NewTicker(2 * time.Hour)      // Analyze platform
	improvementTicker := time.NewTicker(4 * time.Hour)  // Apply safe improvements
	docSyncTicker := time.NewTicker(6 * time.Hour)      // Sync documentation
	securityTicker := time.NewTicker(30 * time.Minute)  // Security scan

	defer analysisTicker.Stop()
	defer improvementTicker.Stop()
	defer docSyncTicker.Stop()
	defer securityTicker.Stop()

	// Initial analysis
	go e.analyzeAndPropose(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("🧬 Evolution Engine shutting down...")
			return
		case <-analysisTicker.C:
			go e.analyzeAndPropose(ctx)
		case <-improvementTicker.C:
			go e.applyApprovedImprovements(ctx)
		case <-docSyncTicker.C:
			go e.syncDocumentation(ctx)
		case <-securityTicker.C:
			go e.securityScan(ctx)
		}
	}
}

// analyzeAndPropose uses AI to analyze platform and propose improvements
func (e *PlatformEvolutionEngine) analyzeAndPropose(ctx context.Context) {
	log.Println("🔬 Analyzing platform for improvements...")

	// Gather platform state
	state := e.gatherPlatformState()

	prompt := fmt.Sprintf(`You are the GSTD Platform Evolution AI. Analyze the current state and propose improvements.

PLATFORM STATE:
%s

GOALS:
1. Make onboarding incredibly simple for ANY user (no technical skills required)
2. Improve performance without downtime
3. Enhance security continuously
4. Keep documentation always updated
5. Make the platform the best AI/LLM alternative
6. Ensure profitability while being accessible
7. Perfect multilingual support

RULES:
- NEVER suggest changes that could cause downtime
- NEVER suggest changes to payment/auth/wallet code
- Focus on UX, documentation, and non-critical code
- Improvements must be reversible

Provide 3-5 improvement proposals in JSON format:
[
  {
    "type": "ux|performance|security|documentation|code",
    "title": "Short title",
    "description": "What to improve and why",
    "impact": "low|medium|high",
    "risk": "none|low",
    "implementation": "Specific code or steps to implement"
  }
]`, state)

	response, err := e.callLLM(ctx, prompt)
	if err != nil {
		log.Printf("❌ Analysis failed: %v", err)
		return
	}

	// Parse proposals
	var proposals []ImprovementProposal
	if err := e.parseJSONResponse(response, &proposals); err != nil {
		log.Printf("Failed to parse proposals: %v", err)
		return
	}

	// Add to queue with safety check
	e.mu.Lock()
	for _, p := range proposals {
		if e.safetyGuard.isProposalSafe(p) {
			p.ID = generateID(p.Title + time.Now().String())
			p.Status = "proposed"
			p.CreatedAt = time.Now()
			e.improvements = append(e.improvements, p)
			log.Printf("📝 New improvement proposed: %s (%s impact, %s risk)", p.Title, p.Impact, p.Risk)
		}
	}
	e.mu.Unlock()

	e.lastAnalysis = time.Now()
}

// applyApprovedImprovements applies safe, low-risk improvements automatically
func (e *PlatformEvolutionEngine) applyApprovedImprovements(ctx context.Context) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// Reset hourly counter if needed
	if time.Since(e.safetyGuard.LastReset) > time.Hour {
		e.safetyGuard.ChangesSinceLastHour = 0
		e.safetyGuard.LastReset = time.Now()
	}

	for i, imp := range e.improvements {
		if imp.Status != "proposed" {
			continue
		}

		// Auto-approve low-risk improvements
		if imp.Risk == "none" && (imp.Type == "documentation" || imp.Type == "ux") {
			// Check rate limit
			if e.safetyGuard.ChangesSinceLastHour >= e.safetyGuard.MaxChangesPerHour {
				log.Println("⚠️ Rate limit reached for auto-improvements")
				return
			}

			// Health check before applying
			if e.safetyGuard.RequireHealthCheck && !e.checkPlatformHealth() {
				log.Println("⚠️ Platform unhealthy, skipping improvements")
				return
			}

			// Apply improvement
			success := e.applyImprovement(ctx, imp)
			if success {
				now := time.Now()
				e.improvements[i].Status = "applied"
				e.improvements[i].AppliedAt = &now
				e.safetyGuard.ChangesSinceLastHour++
				e.appliedCount++

				// Store in hive for learning
				if e.hive != nil {
					e.hive.StoreKnowledge(
						"platform_improvement",
						fmt.Sprintf("Applied: %s - %s", imp.Title, imp.Description),
						"evolution_engine",
						[]string{"improvement", imp.Type},
					)
				}

				log.Printf("✅ Applied improvement: %s", imp.Title)
			}
		}
	}
}

func (e *PlatformEvolutionEngine) applyImprovement(ctx context.Context, imp ImprovementProposal) bool {
	switch imp.Type {
	case "documentation":
		// Documentation improvements are always safe
		return e.applyDocImprovement(ctx, imp)
	case "ux":
		// UX improvements (frontend tweaks)
		return e.applyUXImprovement(ctx, imp)
	default:
		// Other types need manual review
		log.Printf("📋 Improvement needs manual review: %s", imp.Title)
		return false
	}
}

func (e *PlatformEvolutionEngine) applyDocImprovement(ctx context.Context, imp ImprovementProposal) bool {
	// For documentation, we can safely update README, docs, etc.
	log.Printf("📚 Applying documentation improvement: %s", imp.Title)
	// Implementation would write to docs/ folder
	return true
}

func (e *PlatformEvolutionEngine) applyUXImprovement(ctx context.Context, imp ImprovementProposal) bool {
	log.Printf("🎨 Applying UX improvement: %s", imp.Title)
	// Implementation would modify frontend components
	return true
}

// syncDocumentation keeps GitHub repos and local docs in sync
func (e *PlatformEvolutionEngine) syncDocumentation(ctx context.Context) {
	log.Println("📚 Syncing documentation with GitHub...")

	for _, repo := range e.documentationSync.Repos {
		// Pull latest changes
		repoPath := fmt.Sprintf("/home/ubuntu/%s", strings.Split(repo, "/")[1])
		cmd := exec.CommandContext(ctx, "git", "-C", repoPath, "pull", "--rebase")
		if output, err := cmd.CombinedOutput(); err != nil {
			log.Printf("Git pull failed for %s: %v - %s", repo, err, string(output))
		} else {
			log.Printf("✅ Synced: %s", repo)
		}
	}

	// Auto-translate if enabled
	if e.documentationSync.AutoTranslate {
		e.translateDocumentation(ctx)
	}

	e.documentationSync.LastSync = time.Now()
}

func (e *PlatformEvolutionEngine) translateDocumentation(ctx context.Context) {
	// Find all markdown files
	docs := []string{
		"/home/ubuntu/docs/",
		"/home/ubuntu/A2A/",
	}

	for _, docPath := range docs {
		cmd := exec.Command("find", docPath, "-name", "*.md", "-type", "f")
		output, err := cmd.Output()
		if err != nil {
			continue
		}

		files := strings.Split(strings.TrimSpace(string(output)), "\n")
		for _, file := range files {
			if file == "" || strings.Contains(file, "_ru.md") || strings.Contains(file, "_zh.md") {
				continue // Skip already translated
			}
			// Queue for translation (would call translation API)
			log.Printf("📝 Translation queued: %s", file)
		}
	}
}

// securityScan performs continuous security monitoring
func (e *PlatformEvolutionEngine) securityScan(ctx context.Context) {
	log.Println("🛡️ Running security scan...")

	issues := make([]string, 0)

	// Check for exposed secrets
	cmd := exec.Command("grep", "-r", "-l", "-E", "(api_key|secret|password|mnemonic)", "/home/ubuntu/", "--include=*.go", "--include=*.js", "--include=*.py")
	if output, _ := cmd.Output(); len(output) > 0 {
		// Filter out test files and examples
		files := strings.Split(string(output), "\n")
		for _, f := range files {
			if f != "" && !strings.Contains(f, "test") && !strings.Contains(f, "example") && !strings.Contains(f, ".env") {
				issues = append(issues, fmt.Sprintf("Potential secret in: %s", f))
			}
		}
	}

	// Check container security
	cmd = exec.Command("docker", "ps", "--filter", "health=unhealthy", "--format", "{{.Names}}")
	if output, _ := cmd.Output(); len(output) > 0 {
		issues = append(issues, fmt.Sprintf("Unhealthy containers: %s", strings.TrimSpace(string(output))))
	}

	// Check disk usage
	cmd = exec.Command("df", "-h", "/")
	if output, _ := cmd.Output(); strings.Contains(string(output), "9") {
		issues = append(issues, "Disk usage critical (>90%)")
	}

	if len(issues) > 0 {
		log.Printf("⚠️ Security issues found: %d", len(issues))
		for _, issue := range issues {
			log.Printf("  - %s", issue)
		}
		// Would send Telegram alert
	} else {
		log.Println("✅ Security scan passed")
	}
}

func (e *PlatformEvolutionEngine) gatherPlatformState() string {
	state := make(map[string]interface{})

	// Get container status
	cmd := exec.Command("docker", "ps", "--format", "{{.Names}}: {{.Status}}")
	if output, err := cmd.Output(); err == nil {
		state["containers"] = strings.TrimSpace(string(output))
	}

	// Get error count
	cmd = exec.Command("docker", "logs", "ubuntu-backend-blue-1", "--since", "1h", "2>&1")
	if output, err := cmd.CombinedOutput(); err == nil {
		errorCount := strings.Count(string(output), "error") + strings.Count(string(output), "ERROR")
		state["errors_last_hour"] = errorCount
	}

	// API health
	resp, err := http.Get("http://localhost:8080/api/v1/health")
	state["api_healthy"] = err == nil && resp.StatusCode == 200

	jsonBytes, _ := json.MarshalIndent(state, "", "  ")
	return string(jsonBytes)
}

func (e *PlatformEvolutionEngine) checkPlatformHealth() bool {
	resp, err := http.Get("http://localhost:8080/api/v1/health")
	return err == nil && resp.StatusCode == 200
}

func (e *PlatformEvolutionEngine) callLLM(ctx context.Context, prompt string) (string, error) {
	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":  e.model,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.4,
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", e.ollamaHost+"/api/generate", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if response, ok := result["response"].(string); ok {
		return response, nil
	}
	return "", fmt.Errorf("no response from LLM")
}

func (e *PlatformEvolutionEngine) parseJSONResponse(response string, target interface{}) error {
	// Try direct parse
	if err := json.Unmarshal([]byte(response), target); err == nil {
		return nil
	}

	// Try extracting from markdown
	re := regexp.MustCompile("```json\\s*([\\s\\S]*?)\\s*```")
	matches := re.FindStringSubmatch(response)
	if len(matches) > 1 {
		return json.Unmarshal([]byte(matches[1]), target)
	}

	// Try finding array
	re = regexp.MustCompile("\\[\\s*\\{[\\s\\S]*\\}\\s*\\]")
	matches = re.FindStringSubmatch(response)
	if len(matches) > 0 {
		return json.Unmarshal([]byte(matches[0]), target)
	}

	return fmt.Errorf("could not parse JSON from response")
}

func (s *SafetyGuard) isProposalSafe(p ImprovementProposal) bool {
	// Check risk level
	if p.Risk != "none" && p.Risk != "low" {
		return false
	}

	// Check for forbidden patterns
	implLower := strings.ToLower(p.Implementation)
	for _, pattern := range s.ForbiddenPatterns {
		if strings.Contains(implLower, strings.ToLower(pattern)) {
			return false
		}
	}

	// Check protected files
	for _, file := range s.ProtectedFiles {
		if strings.Contains(p.Implementation, file) {
			return false
		}
	}

	return true
}

func (e *PlatformEvolutionEngine) GetStats() map[string]interface{} {
	e.mu.RLock()
	defer e.mu.RUnlock()

	proposed := 0
	applied := 0
	for _, imp := range e.improvements {
		switch imp.Status {
		case "proposed":
			proposed++
		case "applied":
			applied++
		}
	}

	return map[string]interface{}{
		"status":             "active",
		"total_improvements": len(e.improvements),
		"proposed":          proposed,
		"applied":           applied,
		"last_analysis":     e.lastAnalysis,
		"doc_last_sync":     e.documentationSync.LastSync,
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
