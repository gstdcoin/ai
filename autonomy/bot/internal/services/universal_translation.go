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
	"regexp"
	"strings"
	"sync"
	"time"
)

// UniversalTranslationService provides auto-translation for all platform content
type UniversalTranslationService struct {
	mu             sync.RWMutex
	cache          map[string]string // key: "lang:hash" -> translation
	supportedLangs []string
	ollamaHost     string
	model          string
	pendingQueue   []TranslationJob
	stats          TranslationStats
}

// TranslationJob represents a pending translation
type TranslationJob struct {
	ID         string    `json:"id"`
	SourceLang string    `json:"source_lang"`
	TargetLang string    `json:"target_lang"`
	SourceText string    `json:"source_text"`
	Context    string    `json:"context"` // ui, docs, error, help
	Priority   int       `json:"priority"` // 1=urgent, 5=background
	CreatedAt  time.Time `json:"created_at"`
}

// TranslationStats tracks translation metrics
type TranslationStats struct {
	TotalTranslated int            `json:"total_translated"`
	CacheHits       int            `json:"cache_hits"`
	ByLanguage      map[string]int `json:"by_language"`
	QueueSize       int            `json:"queue_size"`
}

func NewUniversalTranslationService() *UniversalTranslationService {
	return &UniversalTranslationService{
		cache: make(map[string]string),
		supportedLangs: []string{
			"en", "ru", "zh", "es", "de", "fr", "ja", "ko", 
			"pt", "it", "ar", "hi", "tr", "vi", "th", "id",
		},
		ollamaHost:   getEnvOrDefault("OLLAMA_HOST", "http://gstd_ollama:11434"),
		model:        "qwen2.5:1.5b",
		pendingQueue: make([]TranslationJob, 0),
		stats: TranslationStats{
			ByLanguage: make(map[string]int),
		},
	}
}

// Translate translates text to target language
func (s *UniversalTranslationService) Translate(ctx context.Context, text, sourceLang, targetLang, context string) (string, error) {
	if sourceLang == targetLang {
		return text, nil
	}

	// Check cache first
	cacheKey := s.getCacheKey(text, targetLang)
	s.mu.RLock()
	if cached, ok := s.cache[cacheKey]; ok {
		s.mu.RUnlock()
		s.mu.Lock()
		s.stats.CacheHits++
		s.mu.Unlock()
		return cached, nil
	}
	s.mu.RUnlock()

	// Translate using LLM
	translated, err := s.translateWithLLM(ctx, text, sourceLang, targetLang, context)
	if err != nil {
		return text, err // Return original on error
	}

	// Cache result
	s.mu.Lock()
	s.cache[cacheKey] = translated
	s.stats.TotalTranslated++
	s.stats.ByLanguage[targetLang]++
	s.mu.Unlock()

	return translated, nil
}

// TranslateBatch translates multiple texts efficiently
func (s *UniversalTranslationService) TranslateBatch(ctx context.Context, texts []string, sourceLang, targetLang string) ([]string, error) {
	results := make([]string, len(texts))
	
	for i, text := range texts {
		translated, err := s.Translate(ctx, text, sourceLang, targetLang, "batch")
		if err != nil {
			results[i] = text // Use original on error
		} else {
			results[i] = translated
		}
	}
	
	return results, nil
}

// TranslateJSON translates all string values in a JSON object
func (s *UniversalTranslationService) TranslateJSON(ctx context.Context, jsonData map[string]interface{}, targetLang string) (map[string]interface{}, error) {
	return s.translateJSONRecursive(ctx, jsonData, targetLang)
}

func (s *UniversalTranslationService) translateJSONRecursive(ctx context.Context, data map[string]interface{}, targetLang string) (map[string]interface{}, error) {
	result := make(map[string]interface{})
	
	for key, value := range data {
		switch v := value.(type) {
		case string:
			translated, err := s.Translate(ctx, v, "en", targetLang, "json")
			if err != nil {
				result[key] = v
			} else {
				result[key] = translated
			}
		case map[string]interface{}:
			translated, err := s.translateJSONRecursive(ctx, v, targetLang)
			if err != nil {
				result[key] = v
			} else {
				result[key] = translated
			}
		case []interface{}:
			arr := make([]interface{}, len(v))
			for i, item := range v {
				if str, ok := item.(string); ok {
					translated, _ := s.Translate(ctx, str, "en", targetLang, "json")
					arr[i] = translated
				} else if m, ok := item.(map[string]interface{}); ok {
					translated, _ := s.translateJSONRecursive(ctx, m, targetLang)
					arr[i] = translated
				} else {
					arr[i] = item
				}
			}
			result[key] = arr
		default:
			result[key] = value
		}
	}
	
	return result, nil
}

// GetUITranslations returns all UI strings for a language
func (s *UniversalTranslationService) GetUITranslations(targetLang string) map[string]string {
	// Core UI strings that should always be available
	uiStrings := map[string]string{
		"welcome":           "Welcome",
		"login":             "Login",
		"logout":            "Logout",
		"dashboard":         "Dashboard",
		"balance":           "Balance",
		"tasks":             "Tasks",
		"nodes":             "Nodes",
		"settings":          "Settings",
		"help":              "Help",
		"connect_wallet":    "Connect Wallet",
		"claim_rewards":     "Claim Rewards",
		"create_task":       "Create Task",
		"my_earnings":       "My Earnings",
		"referrals":         "Referrals",
		"documentation":     "Documentation",
		"api_docs":          "API Documentation",
		"support":           "Support",
		"loading":           "Loading...",
		"error":             "Error",
		"success":           "Success",
		"submit":            "Submit",
		"cancel":            "Cancel",
		"confirm":           "Confirm",
		"back":              "Back",
		"next":              "Next",
		"finish":            "Finish",
		"no_tasks":          "No tasks available",
		"task_completed":    "Task completed!",
		"reward_claimed":    "Reward claimed!",
		"wallet_connected":  "Wallet connected",
		"connection_error":  "Connection error",
		"try_again":         "Try again",
	}

	if targetLang == "en" {
		return uiStrings
	}

	// Translate all strings
	ctx := context.Background()
	translated := make(map[string]string)
	
	for key, value := range uiStrings {
		t, err := s.Translate(ctx, value, "en", targetLang, "ui")
		if err != nil {
			translated[key] = value
		} else {
			translated[key] = t
		}
	}
	
	return translated
}

// DetectLanguage detects the language of input text
func (s *UniversalTranslationService) DetectLanguage(text string) string {
	// Simple heuristic detection
	if containsCyrillic(text) {
		return "ru"
	}
	if containsChinese(text) {
		return "zh"
	}
	if containsJapanese(text) {
		return "ja"
	}
	if containsKorean(text) {
		return "ko"
	}
	if containsArabic(text) {
		return "ar"
	}
	return "en" // Default to English
}

// QueueBackgroundTranslation adds a translation job to the background queue
func (s *UniversalTranslationService) QueueBackgroundTranslation(sourceText, sourceLang, targetLang, context string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	job := TranslationJob{
		ID:         generateID(sourceText + targetLang),
		SourceLang: sourceLang,
		TargetLang: targetLang,
		SourceText: sourceText,
		Context:    context,
		Priority:   5, // Background priority
		CreatedAt:  time.Now(),
	}
	
	s.pendingQueue = append(s.pendingQueue, job)
	s.stats.QueueSize = len(s.pendingQueue)
}

// ProcessBackgroundQueue processes pending translation jobs
func (s *UniversalTranslationService) ProcessBackgroundQueue(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.processQueueBatch(ctx)
		}
	}
}

func (s *UniversalTranslationService) processQueueBatch(ctx context.Context) {
	s.mu.Lock()
	if len(s.pendingQueue) == 0 {
		s.mu.Unlock()
		return
	}
	
	// Take up to 5 jobs
	batchSize := 5
	if len(s.pendingQueue) < batchSize {
		batchSize = len(s.pendingQueue)
	}
	
	batch := s.pendingQueue[:batchSize]
	s.pendingQueue = s.pendingQueue[batchSize:]
	s.stats.QueueSize = len(s.pendingQueue)
	s.mu.Unlock()
	
	for _, job := range batch {
		_, err := s.Translate(ctx, job.SourceText, job.SourceLang, job.TargetLang, job.Context)
		if err != nil {
			log.Printf("Background translation failed: %v", err)
		}
	}
}

func (s *UniversalTranslationService) translateWithLLM(ctx context.Context, text, sourceLang, targetLang, context string) (string, error) {
	langNames := map[string]string{
		"en": "English", "ru": "Russian", "zh": "Chinese", "es": "Spanish",
		"de": "German", "fr": "French", "ja": "Japanese", "ko": "Korean",
		"pt": "Portuguese", "it": "Italian", "ar": "Arabic", "hi": "Hindi",
	}

	sourceN := langNames[sourceLang]
	if sourceN == "" {
		sourceN = sourceLang
	}
	targetN := langNames[targetLang]
	if targetN == "" {
		targetN = targetLang
	}

	prompt := fmt.Sprintf(`Translate the following text from %s to %s.
Context: This is %s text.
Return ONLY the translated text, nothing else.

Text to translate:
%s`, sourceN, targetN, context, text)

	reqBody, _ := json.Marshal(map[string]interface{}{
		"model":  s.model,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.3,
		},
	})

	req, err := http.NewRequestWithContext(ctx, "POST", s.ollamaHost+"/api/generate", bytes.NewBuffer(reqBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if response, ok := result["response"].(string); ok {
		// Clean up response
		response = strings.TrimSpace(response)
		// Remove any markdown or quotes
		response = strings.Trim(response, "\"'`")
		return response, nil
	}

	return "", fmt.Errorf("no translation response")
}

func (s *UniversalTranslationService) getCacheKey(text, targetLang string) string {
	hash := generateID(text)
	return fmt.Sprintf("%s:%s", targetLang, hash)
}

// GetSupportedLanguages returns list of supported languages
func (s *UniversalTranslationService) GetSupportedLanguages() []map[string]string {
	langs := []map[string]string{
		{"code": "en", "name": "English", "native": "English"},
		{"code": "ru", "name": "Russian", "native": "Русский"},
		{"code": "zh", "name": "Chinese", "native": "中文"},
		{"code": "es", "name": "Spanish", "native": "Español"},
		{"code": "de", "name": "German", "native": "Deutsch"},
		{"code": "fr", "name": "French", "native": "Français"},
		{"code": "ja", "name": "Japanese", "native": "日本語"},
		{"code": "ko", "name": "Korean", "native": "한국어"},
		{"code": "pt", "name": "Portuguese", "native": "Português"},
		{"code": "it", "name": "Italian", "native": "Italiano"},
		{"code": "ar", "name": "Arabic", "native": "العربية"},
		{"code": "hi", "name": "Hindi", "native": "हिन्दी"},
		{"code": "tr", "name": "Turkish", "native": "Türkçe"},
		{"code": "vi", "name": "Vietnamese", "native": "Tiếng Việt"},
		{"code": "th", "name": "Thai", "native": "ไทย"},
		{"code": "id", "name": "Indonesian", "native": "Bahasa Indonesia"},
	}
	return langs
}

// GetStats returns translation statistics
func (s *UniversalTranslationService) GetStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	return map[string]interface{}{
		"total_translated": s.stats.TotalTranslated,
		"cache_hits":       s.stats.CacheHits,
		"cache_size":       len(s.cache),
		"queue_size":       s.stats.QueueSize,
		"by_language":      s.stats.ByLanguage,
		"supported_langs":  len(s.supportedLangs),
	}
}

// Helper functions for language detection
func containsCyrillic(text string) bool {
	return regexp.MustCompile(`[\p{Cyrillic}]`).MatchString(text)
}

func containsChinese(text string) bool {
	return regexp.MustCompile(`[\p{Han}]`).MatchString(text)
}

func containsJapanese(text string) bool {
	return regexp.MustCompile(`[\p{Hiragana}\p{Katakana}]`).MatchString(text)
}

func containsKorean(text string) bool {
	return regexp.MustCompile(`[\p{Hangul}]`).MatchString(text)
}

func containsArabic(text string) bool {
	return regexp.MustCompile(`[\p{Arabic}]`).MatchString(text)
}
