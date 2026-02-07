package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"sync"
	"time"
)

// HiveKnowledge is a distributed knowledge base that agents use to learn from each other
type HiveKnowledge struct {
	mu          sync.RWMutex
	entries     map[string]*KnowledgeEntry
	chains      map[string]*ReasoningChain
	errorFixes  map[string]*ErrorFixEntry
	persistPath string
}

// KnowledgeEntry represents a piece of learned knowledge
type KnowledgeEntry struct {
	ID           string    `json:"id"`
	Topic        string    `json:"topic"`
	Content      string    `json:"content"`
	Source       string    `json:"source"`       // Agent that contributed
	Confidence   float64   `json:"confidence"`   // 0-1 scale
	UseCount     int       `json:"use_count"`
	SuccessRate  float64   `json:"success_rate"` // When this knowledge was applied
	CreatedAt    time.Time `json:"created_at"`
	LastUsed     time.Time `json:"last_used"`
	Tags         []string  `json:"tags"`
	Embeddings   []float64 `json:"embeddings,omitempty"` // For vector similarity
}

// ReasoningChain stores successful chains of thought that can be reused
type ReasoningChain struct {
	ID            string    `json:"id"`
	Problem       string    `json:"problem"`
	Steps         []string  `json:"steps"`
	Solution      string    `json:"solution"`
	SuccessCount  int       `json:"success_count"`
	FailCount     int       `json:"fail_count"`
	AverageTime   float64   `json:"average_time_ms"`
	CreatedAt     time.Time `json:"created_at"`
	ContributorID string    `json:"contributor_id"`
}

// ErrorFixEntry stores learned error fixes
type ErrorFixEntry struct {
	ErrorPattern string    `json:"error_pattern"`
	FixStrategy  string    `json:"fix_strategy"`
	CodeChanges  string    `json:"code_changes,omitempty"`
	Commands     []string  `json:"commands,omitempty"`
	SuccessRate  float64   `json:"success_rate"`
	AppliedCount int       `json:"applied_count"`
	LastApplied  time.Time `json:"last_applied"`
}

func NewHiveKnowledge(persistPath string) *HiveKnowledge {
	hk := &HiveKnowledge{
		entries:     make(map[string]*KnowledgeEntry),
		chains:      make(map[string]*ReasoningChain),
		errorFixes:  make(map[string]*ErrorFixEntry),
		persistPath: persistPath,
	}
	
	// Load from disk if exists
	hk.loadFromDisk()
	
	return hk
}

// StoreKnowledge adds new knowledge to the hive
func (hk *HiveKnowledge) StoreKnowledge(topic, content, source string, tags []string) string {
	hk.mu.Lock()
	defer hk.mu.Unlock()

	id := generateID(topic + content)
	
	// Check if exists - update confidence
	if existing, ok := hk.entries[id]; ok {
		existing.UseCount++
		existing.Confidence = min(existing.Confidence+0.05, 1.0)
		return id
	}

	entry := &KnowledgeEntry{
		ID:          id,
		Topic:       topic,
		Content:     content,
		Source:      source,
		Confidence:  0.5, // Start at 50%
		UseCount:    1,
		SuccessRate: 0.5,
		CreatedAt:   time.Now(),
		LastUsed:    time.Now(),
		Tags:        tags,
	}

	hk.entries[id] = entry
	hk.persistToDisk()
	
	log.Printf("📚 Hive Knowledge: Stored new entry on topic '%s'", topic)
	return id
}

// QueryKnowledge retrieves relevant knowledge by topic and tags
func (hk *HiveKnowledge) QueryKnowledge(topic string, tags []string, limit int) []*KnowledgeEntry {
	hk.mu.RLock()
	defer hk.mu.RUnlock()

	var results []*KnowledgeEntry
	topicLower := strings.ToLower(topic)

	for _, entry := range hk.entries {
		score := 0.0
		
		// Topic matching
		if strings.Contains(strings.ToLower(entry.Topic), topicLower) ||
		   strings.Contains(topicLower, strings.ToLower(entry.Topic)) {
			score += 0.5
		}
		
		// Tag matching
		for _, tag := range tags {
			for _, entryTag := range entry.Tags {
				if strings.EqualFold(tag, entryTag) {
					score += 0.2
				}
			}
		}
		
		// Content matching
		if strings.Contains(strings.ToLower(entry.Content), topicLower) {
			score += 0.3
		}
		
		if score > 0.3 {
			// Boost by confidence and success rate
			entry.Confidence = entry.Confidence // Keep for sorting
			results = append(results, entry)
		}
	}

	// Sort by confidence * success_rate
	sort.Slice(results, func(i, j int) bool {
		scoreI := results[i].Confidence * results[i].SuccessRate
		scoreJ := results[j].Confidence * results[j].SuccessRate
		return scoreI > scoreJ
	})

	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	return results
}

// StoreReasoningChain saves a successful chain of thought
func (hk *HiveKnowledge) StoreReasoningChain(problem string, steps []string, solution, contributorID string) string {
	hk.mu.Lock()
	defer hk.mu.Unlock()

	id := generateID(problem)
	
	if existing, ok := hk.chains[id]; ok {
		existing.SuccessCount++
		return id
	}

	chain := &ReasoningChain{
		ID:            id,
		Problem:       problem,
		Steps:         steps,
		Solution:      solution,
		SuccessCount:  1,
		FailCount:     0,
		AverageTime:   0,
		CreatedAt:     time.Now(),
		ContributorID: contributorID,
	}

	hk.chains[id] = chain
	hk.persistToDisk()
	
	log.Printf("🧠 Hive: Stored reasoning chain for problem type: %s", problem[:min(50, len(problem))])
	return id
}

// GetReasoningChain retrieves a matching reasoning chain
func (hk *HiveKnowledge) GetReasoningChain(problemKeywords string) *ReasoningChain {
	hk.mu.RLock()
	defer hk.mu.RUnlock()

	keywords := strings.ToLower(problemKeywords)
	
	var bestMatch *ReasoningChain
	bestScore := 0.0

	for _, chain := range hk.chains {
		score := 0.0
		problemLower := strings.ToLower(chain.Problem)
		
		for _, word := range strings.Fields(keywords) {
			if strings.Contains(problemLower, word) {
				score += 1.0
			}
		}
		
		// Boost by success rate
		successRate := float64(chain.SuccessCount) / float64(chain.SuccessCount+chain.FailCount+1)
		score *= successRate
		
		if score > bestScore {
			bestScore = score
			bestMatch = chain
		}
	}

	return bestMatch
}

// StoreErrorFix records a successful error fix
func (hk *HiveKnowledge) StoreErrorFix(errorPattern, fixStrategy string, commands []string, success bool) {
	hk.mu.Lock()
	defer hk.mu.Unlock()

	id := generateID(errorPattern)
	
	if existing, ok := hk.errorFixes[id]; ok {
		existing.AppliedCount++
		if success {
			existing.SuccessRate = (existing.SuccessRate*float64(existing.AppliedCount-1) + 1.0) / float64(existing.AppliedCount)
		} else {
			existing.SuccessRate = (existing.SuccessRate * float64(existing.AppliedCount-1)) / float64(existing.AppliedCount)
		}
		existing.LastApplied = time.Now()
		hk.persistToDisk()
		return
	}

	fix := &ErrorFixEntry{
		ErrorPattern: errorPattern,
		FixStrategy:  fixStrategy,
		Commands:     commands,
		SuccessRate:  0.5, // Starts at 50%
		AppliedCount: 1,
		LastApplied:  time.Now(),
	}
	
	if success {
		fix.SuccessRate = 1.0
	} else {
		fix.SuccessRate = 0.0
	}

	hk.errorFixes[id] = fix
	hk.persistToDisk()
}

// GetErrorFix retrieves a fix for an error pattern
func (hk *HiveKnowledge) GetErrorFix(errorMessage string) *ErrorFixEntry {
	hk.mu.RLock()
	defer hk.mu.RUnlock()

	errorLower := strings.ToLower(errorMessage)
	
	var bestFix *ErrorFixEntry
	bestScore := 0.0

	for _, fix := range hk.errorFixes {
		patternLower := strings.ToLower(fix.ErrorPattern)
		
		// Count matching words
		score := 0.0
		for _, word := range strings.Fields(patternLower) {
			if len(word) > 3 && strings.Contains(errorLower, word) {
				score += 1.0
			}
		}
		
		// Weight by success rate
		score *= fix.SuccessRate
		
		if score > bestScore && fix.SuccessRate >= 0.6 { // Only suggest fixes with >60% success
			bestScore = score
			bestFix = fix
		}
	}

	return bestFix
}

// GetGoldenDataset creates a training dataset from successful entries
func (hk *HiveKnowledge) GetGoldenDataset(ctx context.Context) []map[string]string {
	hk.mu.RLock()
	defer hk.mu.RUnlock()

	var dataset []map[string]string

	// Include high-confidence knowledge
	for _, entry := range hk.entries {
		if entry.Confidence >= 0.7 && entry.SuccessRate >= 0.7 {
			dataset = append(dataset, map[string]string{
				"topic":   entry.Topic,
				"content": entry.Content,
				"type":    "knowledge",
			})
		}
	}

	// Include successful reasoning chains
	for _, chain := range hk.chains {
		successRate := float64(chain.SuccessCount) / float64(chain.SuccessCount+chain.FailCount+1)
		if successRate >= 0.7 && chain.SuccessCount >= 3 {
			dataset = append(dataset, map[string]string{
				"problem":  chain.Problem,
				"steps":    strings.Join(chain.Steps, "\n"),
				"solution": chain.Solution,
				"type":     "reasoning",
			})
		}
	}

	// Include proven error fixes
	for _, fix := range hk.errorFixes {
		if fix.SuccessRate >= 0.8 && fix.AppliedCount >= 2 {
			dataset = append(dataset, map[string]string{
				"error":    fix.ErrorPattern,
				"fix":      fix.FixStrategy,
				"commands": strings.Join(fix.Commands, "; "),
				"type":     "error_fix",
			})
		}
	}

	log.Printf("📊 Golden Dataset: %d entries ready for training", len(dataset))
	return dataset
}

// GetStats returns hive statistics
func (hk *HiveKnowledge) GetStats() map[string]interface{} {
	hk.mu.RLock()
	defer hk.mu.RUnlock()

	return map[string]interface{}{
		"total_knowledge_entries": len(hk.entries),
		"total_reasoning_chains":  len(hk.chains),
		"total_error_fixes":       len(hk.errorFixes),
		"persist_path":            hk.persistPath,
	}
}

func (hk *HiveKnowledge) persistToDisk() {
	if hk.persistPath == "" {
		return
	}

	data := map[string]interface{}{
		"entries":     hk.entries,
		"chains":      hk.chains,
		"error_fixes": hk.errorFixes,
		"updated_at":  time.Now(),
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		log.Printf("Failed to marshal hive knowledge: %v", err)
		return
	}

	if err := os.WriteFile(hk.persistPath, bytes, 0644); err != nil {
		log.Printf("Failed to persist hive knowledge: %v", err)
	}
}

func (hk *HiveKnowledge) loadFromDisk() {
	if hk.persistPath == "" {
		return
	}

	data, err := os.ReadFile(hk.persistPath)
	if err != nil {
		return // File doesn't exist yet
	}

	var stored struct {
		Entries    map[string]*KnowledgeEntry  `json:"entries"`
		Chains     map[string]*ReasoningChain  `json:"chains"`
		ErrorFixes map[string]*ErrorFixEntry   `json:"error_fixes"`
	}

	if err := json.Unmarshal(data, &stored); err != nil {
		log.Printf("Failed to load hive knowledge: %v", err)
		return
	}

	if stored.Entries != nil {
		hk.entries = stored.Entries
	}
	if stored.Chains != nil {
		hk.chains = stored.Chains
	}
	if stored.ErrorFixes != nil {
		hk.errorFixes = stored.ErrorFixes
	}

	log.Printf("📚 Loaded Hive Knowledge: %d entries, %d chains, %d fixes",
		len(hk.entries), len(hk.chains), len(hk.errorFixes))
}

func generateID(content string) string {
	hash := sha256.Sum256([]byte(content))
	return hex.EncodeToString(hash[:8])
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
