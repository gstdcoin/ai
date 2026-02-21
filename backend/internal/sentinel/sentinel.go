// Package sentinel implements the Sentinel Vigilance system —
// the swarm's immune system for content safety.
// NOT a censor — an immune system that blocks pathogens while allowing
// all healthy content to flow freely.
package sentinel

import (
	"context"
	"fmt"
	"log"
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
	mu         sync.RWMutex
}

// SentinelStats tracks sentinel performance.
type SentinelStats struct {
	TotalChecks  int64 `json:"total_checks"`
	TotalBlocked int64 `json:"total_blocked"`
	TotalAllowed int64 `json:"total_allowed"`
	TotalRouted  int64 `json:"total_routed"`
	AvgLatencyMs int64 `json:"avg_latency_ms"`
	mu           sync.Mutex
}

// CSAMHashDB holds perceptual hashes for CSAM detection.
type CSAMHashDB struct {
	hashes map[string]bool
	mu     sync.RWMutex
}

// IntentClassifier uses ML-based classification for content intent.
type IntentClassifier struct {
	// In production: loaded ML model (ONNX/TorchScript)
	// For now: keyword + heuristic based
	maliciousPatterns []string
	threshold         float64
}

// NewSentinel creates and initializes the Sentinel engine.
func NewSentinel() *Sentinel {
	s := &Sentinel{
		rules:      defaultRules(),
		hashDB:     newCSAMHashDB(),
		classifier: newIntentClassifier(),
		stats:      &SentinelStats{},
	}
	log.Printf("[Sentinel] Initialized with %d rules", len(s.rules))
	return s
}

// ─── Main Check Function ───────────────────────────────────────────────────

// Check performs content safety analysis on a task.
func (s *Sentinel) Check(ctx context.Context, task *Task) CheckResult {
	start := time.Now()

	// 1. Fast keyword/pattern rules
	if result := s.checkRules(task); !result.Allowed {
		s.recordBlock(result, start)
		return result
	}

	// 2. ML intent classification
	if result := s.checkIntent(task); !result.Allowed {
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

// ─── Intent Classification ──────────────────────────────────────────────────

func (s *Sentinel) checkIntent(task *Task) CheckResult {
	result := s.classifier.Classify(task.Content)
	if result.IsMalicious && result.Score > 0.85 {
		return CheckResult{
			Allowed:    false,
			Category:   result.Category,
			Reason:     "ML classifier flagged with confidence " + fmt.Sprintf("%.2f", result.Score),
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
		TotalChecks:  s.stats.TotalChecks,
		TotalBlocked: s.stats.TotalBlocked,
		TotalAllowed: s.stats.TotalAllowed,
		TotalRouted:  s.stats.TotalRouted,
		AvgLatencyMs: s.stats.AvgLatencyMs,
	}
}

// ─── Intent Classifier ──────────────────────────────────────────────────────

type ClassifyResult struct {
	IsMalicious bool          `json:"is_malicious"`
	Score       float64       `json:"score"`
	Category    BlockCategory `json:"category"`
}

func newIntentClassifier() *IntentClassifier {
	return &IntentClassifier{
		maliciousPatterns: []string{
			"how to synthesize", "create a virus", "bypass security",
			"hack into", "generate exploit", "create malware",
			"ddos attack", "phishing template",
		},
		threshold: 0.85,
	}
}

func (ic *IntentClassifier) Classify(content string) ClassifyResult {
	lower := strings.ToLower(content)
	matchCount := 0
	for _, pattern := range ic.maliciousPatterns {
		if strings.Contains(lower, pattern) {
			matchCount++
		}
	}

	if matchCount == 0 {
		return ClassifyResult{IsMalicious: false, Score: 0.0, Category: CatNormal}
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
