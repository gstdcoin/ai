// Package sentinel implements the Sentinel Vigilance system —
// the swarm's immune system for content safety.
// NOT a censor — an immune system that blocks pathogens while allowing
// all healthy content to flow freely.
//
// Uses Ollama Llama-Guard for ML-based content safety classification with
// graceful fallback to keyword heuristics when Ollama is unavailable.
package sentinel

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── Types ──────────────────────────────────────────────────────────────────

// BlockCategory classifies the reason for blocking.
type BlockCategory string

const (
	CatCBRN      BlockCategory = "cbrn_weapons"
	CatCSAM      BlockCategory = "csam"
	CatMassManip BlockCategory = "mass_manipulation"
	CatMalware   BlockCategory = "malware_generation"
	CatLegalGrey BlockCategory = "legal_grey_zone"
	CatNormal    BlockCategory = "normal"
)

// SentinelAction defines what to do with content.
type SentinelAction string

const (
	ActionAllow        SentinelAction = "allow"
	ActionBlock        SentinelAction = "block"
	ActionRouteSpecial SentinelAction = "route_special"
)

// CheckResult is the output of content checking.
type CheckResult struct {
	Allowed    bool           `json:"allowed"`
	Category   BlockCategory  `json:"category"`
	Reason     string         `json:"reason,omitempty"`
	Action     SentinelAction `json:"action"`
	Confidence float64        `json:"confidence"`
	CheckedAt  time.Time      `json:"checked_at"`
	LatencyMs  int64          `json:"latency_ms"`
}

// Task represents content to be checked.
type Task struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	HasMedia  bool   `json:"has_media"`
	MediaHash string `json:"media_hash,omitempty"`
	Language  string `json:"language,omitempty"`
	Source    string `json:"source,omitempty"`
}

// EthicsRule defines a content filtering rule.
type EthicsRule struct {
	ID          string         `json:"id"`
	Category    BlockCategory  `json:"category"`
	Keywords    []string       `json:"keywords"`
	Patterns    []string       `json:"patterns"` // regex patterns
	Action      SentinelAction `json:"action"`
	Confidence  float64        `json:"confidence"`
	Description string         `json:"description"`
}

// ─── Sentinel Engine ────────────────────────────────────────────────────────

// Sentinel is the main content safety engine.
type Sentinel struct {
	rules      []EthicsRule
	hashDB     *CSAMHashDB
	classifier *IntentClassifier
	stats      *SentinelStats
	ollamaURL  string // Ollama base URL for ML classification
	mu         sync.RWMutex
}

// SentinelStats tracks sentinel performance.
type SentinelStats struct {
	TotalChecks    int64 `json:"total_checks"`
	TotalBlocked   int64 `json:"total_blocked"`
	TotalAllowed   int64 `json:"total_allowed"`
	TotalRouted    int64 `json:"total_routed"`
	TotalMLChecks  int64 `json:"total_ml_checks"`
	TotalFallbacks int64 `json:"total_fallbacks"`
	AvgLatencyMs   int64 `json:"avg_latency_ms"`
	mu             sync.Mutex
}

// CSAMHashDB holds perceptual hashes for CSAM detection.
type CSAMHashDB struct {
	hashes map[string]bool
	mu     sync.RWMutex
}

// IntentClassifier uses ML-based classification (Ollama Llama-Guard)
// with graceful fallback to keyword heuristics.
type IntentClassifier struct {
	ollamaURL       string
	guardModel      string
	httpClient      *http.Client
	ollamaAvailable bool
	lastHealthCheck time.Time
	healthCheckMu   sync.Mutex
	// Fallback: keyword-based patterns
	maliciousPatterns []string
	threshold         float64
}

// NewSentinel creates the Sentinel engine with default local Ollama URL.
func NewSentinel() *Sentinel {
	return NewSentinelWithOllama("http://localhost:11434")
}

// NewSentinelWithOllama creates and initializes the Sentinel engine
// with ML-based content classification via Ollama Llama-Guard.
func NewSentinelWithOllama(ollamaURL string) *Sentinel {
	classifier := newIntentClassifier(ollamaURL)
	s := &Sentinel{
		rules:      defaultRules(),
		hashDB:     newCSAMHashDB(),
		classifier: classifier,
		stats:      &SentinelStats{},
		ollamaURL:  ollamaURL,
	}
	mode := "keyword-fallback"
	if classifier.ollamaAvailable {
		mode = "ML (Llama-Guard)"
	}
	log.Printf("[Sentinel] Initialized with %d rules, classifier=%s, ollama=%s", len(s.rules), mode, ollamaURL)
	return s
}

// ─── Main Check Function ───────────────────────────────────────────────────

// Check performs content safety analysis on a task.
func (s *Sentinel) Check(ctx context.Context, task *Task) CheckResult {
	start := time.Now()

	// 1. Fast keyword/pattern rules (always runs first — near-zero latency)
	if result := s.checkRules(task); !result.Allowed {
		s.recordBlock(result, start)
		return result
	}

	// 2. ML intent classification (Ollama Llama-Guard with keyword fallback)
	if result := s.checkIntent(ctx, task); !result.Allowed {
		s.recordBlock(result, start)
		return result
	}

	// 3. Media hash check (CSAM)
	if task.HasMedia {
		if result := s.checkMediaHash(task); !result.Allowed {
			s.recordBlock(result, start)
			return result
		}
	}

	// All clear
	result := CheckResult{
		Allowed:    true,
		Category:   CatNormal,
		Action:     ActionAllow,
		Confidence: 1.0,
		CheckedAt:  time.Now(),
		LatencyMs:  time.Since(start).Milliseconds(),
	}
	s.recordAllow(start)
	return result
}

// ─── Rule Checking ──────────────────────────────────────────────────────────

func (s *Sentinel) checkRules(task *Task) CheckResult {
	content := strings.ToLower(task.Content)

	for _, rule := range s.rules {
		for _, keyword := range rule.Keywords {
			if strings.Contains(content, strings.ToLower(keyword)) {
				return CheckResult{
					Allowed:    false,
					Category:   rule.Category,
					Reason:     "Matched rule: " + rule.ID,
					Action:     rule.Action,
					Confidence: rule.Confidence,
					CheckedAt:  time.Now(),
				}
			}
		}
	}
	return CheckResult{Allowed: true}
}

// ─── Intent Classification (Ollama ML + Keyword Fallback) ───────────────────

func (s *Sentinel) checkIntent(ctx context.Context, task *Task) CheckResult {
	result := s.classifier.Classify(ctx, task.Content)
	if result.IsMalicious && result.Score > 0.85 {
		source := "keyword-heuristic"
		if result.MLBacked {
			source = "llama-guard-ml"
		}
		return CheckResult{
			Allowed:    false,
			Category:   result.Category,
			Reason:     fmt.Sprintf("%s classifier flagged with confidence %.2f", source, result.Score),
			Action:     ActionBlock,
			Confidence: result.Score,
			CheckedAt:  time.Now(),
		}
	}
	return CheckResult{Allowed: true}
}

// ─── Media Hash Check ───────────────────────────────────────────────────────

func (s *Sentinel) checkMediaHash(task *Task) CheckResult {
	if s.hashDB.Contains(task.MediaHash) {
		return CheckResult{
			Allowed:    false,
			Category:   CatCSAM,
			Reason:     "Perceptual hash match in CSAM database",
			Action:     ActionBlock,
			Confidence: 0.99,
			CheckedAt:  time.Now(),
		}
	}
	return CheckResult{Allowed: true}
}

// ─── Statistics ─────────────────────────────────────────────────────────────

func (s *Sentinel) recordBlock(result CheckResult, start time.Time) {
	result.LatencyMs = time.Since(start).Milliseconds()
	s.stats.mu.Lock()
	s.stats.TotalChecks++
	s.stats.TotalBlocked++
	s.stats.mu.Unlock()
	log.Printf("[Sentinel] BLOCKED: category=%s reason=%s confidence=%.2f", result.Category, result.Reason, result.Confidence)
}

func (s *Sentinel) recordAllow(start time.Time) {
	s.stats.mu.Lock()
	s.stats.TotalChecks++
	s.stats.TotalAllowed++
	s.stats.mu.Unlock()
}

// GetStats returns current sentinel statistics.
func (s *Sentinel) GetStats() *SentinelStats {
	s.stats.mu.Lock()
	defer s.stats.mu.Unlock()
	return &SentinelStats{
		TotalChecks:    s.stats.TotalChecks,
		TotalBlocked:   s.stats.TotalBlocked,
		TotalAllowed:   s.stats.TotalAllowed,
		TotalRouted:    s.stats.TotalRouted,
		TotalMLChecks:  s.stats.TotalMLChecks,
		TotalFallbacks: s.stats.TotalFallbacks,
		AvgLatencyMs:   s.stats.AvgLatencyMs,
	}
}

// ─── Ollama Llama-Guard Intent Classifier ───────────────────────────────────

// ClassifyResult contains the classification output.
type ClassifyResult struct {
	IsMalicious bool          `json:"is_malicious"`
	Score       float64       `json:"score"`
	Category    BlockCategory `json:"category"`
	MLBacked    bool          `json:"ml_backed"` // true if classified by Ollama, false if keyword fallback
}

// ollamaGenerateRequest is the request body for Ollama /api/generate.
type ollamaGenerateRequest struct {
	Model   string                 `json:"model"`
	Prompt  string                 `json:"prompt"`
	Stream  bool                   `json:"stream"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// ollamaGenerateResponse is the response from Ollama /api/generate.
type ollamaGenerateResponse struct {
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

// guardPromptTemplate is the system prompt used for Llama-Guard classification.
const guardPromptTemplate = `[INST] Task: Check if there is unsafe content in the user message according to our safety policy.

<BEGIN UNSAFE CATEGORIES>
S1: Violent Crimes — Unlawful violence toward people (assault, murder, kidnapping, terrorism)
S2: Non-Violent Crimes — Financial crimes, theft, cybercrimes, fraud, creating malware
S3: Sex-Related Crimes — Human trafficking, sexual assault, CSAM
S4: Child Safety — Content harmful to children
S5: Defamation — Libel, slander
S6: Specialized Advice — Unqualified medical/legal/financial advice that could cause harm
S7: Privacy — Unauthorized personal data exposure, doxxing
S8: Intellectual Property — Copyright/trademark violation
S9: Indiscriminate Weapons — Chemical/biological/radiological/nuclear weapons (CBRN)
S10: Hate — Attacks based on protected characteristics
S11: Suicide & Self-Harm — Encouraging or instructing self-harm
S12: Sexual Content — Explicit sexual content
S13: Elections — Misinformation about elections, voter suppression
<END UNSAFE CATEGORIES>

<BEGIN USER MESSAGE>
%s
<END USER MESSAGE>

Provide your safety assessment for the user message.
First line must be 'safe' or 'unsafe'.
If unsafe, the second line must include the violated category (e.g., S1, S2). [/INST]`

func newIntentClassifier(ollamaURL string) *IntentClassifier {
	ic := &IntentClassifier{
		ollamaURL:  ollamaURL,
		guardModel: "llama-guard3:1b",
		httpClient: &http.Client{Timeout: 10 * time.Second},
		maliciousPatterns: []string{
			"how to synthesize", "create a virus", "bypass security",
			"hack into", "generate exploit", "create malware",
			"ddos attack", "phishing template",
		},
		threshold: 0.85,
	}

	// Probe Ollama availability at startup
	ic.checkOllamaHealth()
	return ic
}

// checkOllamaHealth verifies that Ollama is running and the guard model is available.
// Re-checks at most once per 60 seconds.
func (ic *IntentClassifier) checkOllamaHealth() {
	ic.healthCheckMu.Lock()
	defer ic.healthCheckMu.Unlock()

	if time.Since(ic.lastHealthCheck) < 60*time.Second {
		return
	}
	ic.lastHealthCheck = time.Now()

	url := strings.TrimSuffix(ic.ollamaURL, "/") + "/api/tags"
	resp, err := ic.httpClient.Get(url)
	if err != nil {
		ic.ollamaAvailable = false
		log.Printf("[Sentinel] Ollama unavailable (%s) — using keyword fallback", err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		ic.ollamaAvailable = false
		log.Printf("[Sentinel] Ollama returned status %d — using keyword fallback", resp.StatusCode)
		return
	}

	// Parse to check if guard model is present
	var tagsResp struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &tagsResp); err != nil {
		ic.ollamaAvailable = false
		return
	}

	for _, m := range tagsResp.Models {
		// Accept any llama-guard variant (llama-guard3:1b, llama-guard3:8b, etc.)
		if strings.Contains(strings.ToLower(m.Name), "llama-guard") ||
			strings.Contains(strings.ToLower(m.Name), "llamaguard") {
			ic.guardModel = m.Name
			ic.ollamaAvailable = true
			log.Printf("[Sentinel] Ollama ML classifier active: model=%s", m.Name)
			return
		}
	}

	ic.ollamaAvailable = false
	log.Printf("[Sentinel] Llama-Guard model not found in Ollama (have %d models) — using keyword fallback. Pull with: ollama pull llama-guard3:1b", len(tagsResp.Models))
}

// Classify performs content safety classification.
// Tries Ollama Llama-Guard first; falls back to keyword heuristics if unavailable.
func (ic *IntentClassifier) Classify(ctx context.Context, content string) ClassifyResult {
	// Periodically re-check Ollama availability
	ic.checkOllamaHealth()

	// Attempt ML classification if Ollama is available
	if ic.ollamaAvailable {
		result, err := ic.classifyWithOllama(ctx, content)
		if err == nil {
			return result
		}
		log.Printf("[Sentinel] Ollama classify failed (%s) — falling back to keywords", err.Error())
	}

	// Fallback: keyword-based heuristic
	return ic.classifyWithKeywords(content)
}

// classifyWithOllama sends content to Ollama Llama-Guard for safety classification.
func (ic *IntentClassifier) classifyWithOllama(ctx context.Context, content string) (ClassifyResult, error) {
	prompt := fmt.Sprintf(guardPromptTemplate, content)

	reqBody := ollamaGenerateRequest{
		Model:  ic.guardModel,
		Prompt: prompt,
		Stream: false,
		Options: map[string]interface{}{
			"temperature": 0.0,
			"num_predict": 50,
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return ClassifyResult{}, fmt.Errorf("marshal request: %w", err)
	}

	url := strings.TrimSuffix(ic.ollamaURL, "/") + "/api/generate"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonData))
	if err != nil {
		return ClassifyResult{}, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := ic.httpClient.Do(req)
	if err != nil {
		return ClassifyResult{}, fmt.Errorf("ollama request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ClassifyResult{}, fmt.Errorf("ollama returned status %d", resp.StatusCode)
	}

	var ollamaResp ollamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return ClassifyResult{}, fmt.Errorf("decode response: %w", err)
	}

	return ic.parseGuardResponse(ollamaResp.Response), nil
}

// parseGuardResponse parses the Llama-Guard output into a ClassifyResult.
// Expected format:
//
//	Line 1: "safe" or "unsafe"
//	Line 2 (if unsafe): "S1", "S2", etc.
func (ic *IntentClassifier) parseGuardResponse(response string) ClassifyResult {
	response = strings.TrimSpace(response)
	lines := strings.Split(response, "\n")

	if len(lines) == 0 {
		return ClassifyResult{IsMalicious: false, Score: 0.0, Category: CatNormal, MLBacked: true}
	}

	firstLine := strings.TrimSpace(strings.ToLower(lines[0]))

	if firstLine == "safe" {
		return ClassifyResult{IsMalicious: false, Score: 0.05, Category: CatNormal, MLBacked: true}
	}

	if strings.Contains(firstLine, "unsafe") {
		category := CatMalware // default unsafe category
		confidence := 0.92

		if len(lines) > 1 {
			catLine := strings.TrimSpace(strings.ToUpper(lines[1]))
			switch {
			case strings.Contains(catLine, "S1"):
				category = CatMalware
				confidence = 0.93
			case strings.Contains(catLine, "S2"):
				category = CatMalware
				confidence = 0.91
			case strings.Contains(catLine, "S3"), strings.Contains(catLine, "S4"):
				category = CatCSAM
				confidence = 0.97
			case strings.Contains(catLine, "S9"):
				category = CatCBRN
				confidence = 0.96
			case strings.Contains(catLine, "S10"):
				category = CatMassManip
				confidence = 0.89
			case strings.Contains(catLine, "S13"):
				category = CatMassManip
				confidence = 0.88
			default:
				category = CatLegalGrey
				confidence = 0.87
			}
		}

		return ClassifyResult{
			IsMalicious: true,
			Score:       confidence,
			Category:    category,
			MLBacked:    true,
		}
	}

	// Ambiguous response — treat as safe with low confidence
	return ClassifyResult{IsMalicious: false, Score: 0.3, Category: CatNormal, MLBacked: true}
}

// classifyWithKeywords is the original keyword-based fallback classifier.
func (ic *IntentClassifier) classifyWithKeywords(content string) ClassifyResult {
	lower := strings.ToLower(content)
	matchCount := 0
	for _, pattern := range ic.maliciousPatterns {
		if strings.Contains(lower, pattern) {
			matchCount++
		}
	}

	if matchCount == 0 {
		return ClassifyResult{IsMalicious: false, Score: 0.0, Category: CatNormal, MLBacked: false}
	}

	score := float64(matchCount) / float64(len(ic.maliciousPatterns))
	if score > 1.0 {
		score = 1.0
	}

	category := CatMalware
	if strings.Contains(lower, "synthesize") || strings.Contains(lower, "chemical") {
		category = CatCBRN
	}

	return ClassifyResult{
		IsMalicious: score > ic.threshold,
		Score:       score,
		Category:    category,
		MLBacked:    false,
	}
}

// ─── CSAM Hash DB ───────────────────────────────────────────────────────────

func newCSAMHashDB() *CSAMHashDB {
	return &CSAMHashDB{
		hashes: make(map[string]bool),
	}
}

func (db *CSAMHashDB) Contains(hash string) bool {
	if hash == "" {
		return false
	}
	db.mu.RLock()
	defer db.mu.RUnlock()
	return db.hashes[hash]
}

func (db *CSAMHashDB) AddHash(hash string) {
	db.mu.Lock()
	defer db.mu.Unlock()
	db.hashes[hash] = true
}

// ─── Default Rules ──────────────────────────────────────────────────────────

func defaultRules() []EthicsRule {
	return []EthicsRule{
		{
			ID:          "cbrn_weapons",
			Category:    CatCBRN,
			Keywords:    []string{"synthesize sarin", "nerve agent recipe", "bioweapon", "ricin synthesis", "anthrax production"},
			Action:      ActionBlock,
			Confidence:  0.95,
			Description: "Chemical, Biological, Radiological, Nuclear weapons",
		},
		{
			ID:          "mass_manipulation",
			Category:    CatMassManip,
			Keywords:    []string{"election interference script", "deepfake propaganda", "mass panic incitement"},
			Action:      ActionBlock,
			Confidence:  0.90,
			Description: "Mass psychology manipulation at scale",
		},
		{
			ID:          "malware_gen",
			Category:    CatMalware,
			Keywords:    []string{"ransomware source code", "keylogger payload", "zero-day exploit code"},
			Action:      ActionBlock,
			Confidence:  0.92,
			Description: "Malware and exploit generation",
		},
	}
}
