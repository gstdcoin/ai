package services

// ═══════════════════════════════════════════════════════════════════════════
// WebSearchService — Real-time Internet Search for the Swarm
//
// Uses free, no-key-required APIs:
//   1. DuckDuckGo Instant Answer API (ddg - free, no key)
//   2. Wikipedia API (free, no key)
//   3. Brave Search API (free tier, key optional)
//
// Purpose: Inject up-to-date context into AI responses so the swarm
// always has current information, not just training data.
// ═══════════════════════════════════════════════════════════════════════════

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// WebSearchService provides real-time internet search capabilities.
type WebSearchService struct {
	client     *http.Client
	braveKey   string // optional — Brave Search API key
	mu         sync.RWMutex
	queryCache map[string]cachedSearch
}

type cachedSearch struct {
	results  []SearchResult
	cachedAt time.Time
}

// SearchResult is a single search result item.
type SearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
	Source  string `json:"source"` // "ddg", "wikipedia", "brave"
}

// WebSearchContext is what gets injected into the AI prompt.
type WebSearchContext struct {
	Query       string         `json:"query"`
	Results     []SearchResult `json:"results"`
	SearchedAt  time.Time      `json:"searched_at"`
	HasResults  bool           `json:"has_results"`
	ContextText string         `json:"context_text"` // pre-formatted for prompt injection
}

// NewWebSearchService creates the search service.
func NewWebSearchService(braveKey string) *WebSearchService {
	s := &WebSearchService{
		braveKey:   braveKey,
		queryCache: make(map[string]cachedSearch),
		client: &http.Client{
			Timeout: 8 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        20,
				MaxIdleConnsPerHost: 5,
				IdleConnTimeout:     60 * time.Second,
			},
		},
	}
	log.Printf("🌐 [WebSearch] Active (DuckDuckGo + Wikipedia free). Brave=%v", braveKey != "")
	return s
}

// NeedsSearch returns true if the query likely requires real-time info.
func NeedsSearch(query string) bool {
	lower := strings.ToLower(query)

	// Keywords that indicate need for up-to-date info
	realTimeKeywords := []string{
		"today", "now", "current", "latest", "recent", "news", "price",
		"today's", "right now", "2024", "2025", "2026", "этот год",
		"сейчас", "последние", "новости", "цена", "курс", "актуальный",
		"weather", "погода", "событие", "event", "just happened",
		"what happened", "when did", "who won", "result", "update",
	}

	for _, kw := range realTimeKeywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}

	return false
}

// Search performs a search using all available free sources in parallel.
func (s *WebSearchService) Search(ctx context.Context, query string) (*WebSearchContext, error) {
	// Check cache (1 min TTL to avoid hammering APIs)
	s.mu.RLock()
	if cached, ok := s.queryCache[query]; ok && time.Since(cached.cachedAt) < time.Minute {
		s.mu.RUnlock()
		log.Printf("[WebSearch] Cache hit for: %s", query[:minInt(len(query), 40)])
		return s.buildContext(query, cached.results), nil
	}
	s.mu.RUnlock()

	type searchResult struct {
		results []SearchResult
		err     error
	}

	resultsCh := make(chan searchResult, 3)

	// DuckDuckGo (always available, no key)
	go func() {
		results, err := s.searchDDG(ctx, query)
		resultsCh <- searchResult{results, err}
	}()

	// Wikipedia (great for factual queries)
	go func() {
		results, err := s.searchWikipedia(ctx, query)
		resultsCh <- searchResult{results, err}
	}()

	// Brave Search (if key configured)
	go func() {
		if s.braveKey == "" {
			resultsCh <- searchResult{nil, nil}
			return
		}
		results, err := s.searchBrave(ctx, query)
		resultsCh <- searchResult{results, err}
	}()

	// Collect results from all 3 goroutines
	var allResults []SearchResult
	for i := 0; i < 3; i++ {
		r := <-resultsCh
		if r.err == nil && len(r.results) > 0 {
			allResults = append(allResults, r.results...)
		}
	}

	// Deduplicate by URL
	seen := map[string]bool{}
	var unique []SearchResult
	for _, r := range allResults {
		if !seen[r.URL] {
			seen[r.URL] = true
			unique = append(unique, r)
			if len(unique) >= 6 {
				break
			}
		}
	}

	// Cache results
	s.mu.Lock()
	s.queryCache[query] = cachedSearch{results: unique, cachedAt: time.Now()}
	// Evict old entries if cache too large
	if len(s.queryCache) > 200 {
		for k, v := range s.queryCache {
			if time.Since(v.cachedAt) > 5*time.Minute {
				delete(s.queryCache, k)
			}
		}
	}
	s.mu.Unlock()

	log.Printf("[WebSearch] Query '%s': %d results from %d sources",
		query[:minInt(len(query), 40)], len(unique), 3)

	return s.buildContext(query, unique), nil
}

// BuildPromptContext creates a formatted string to inject into AI system prompt.
func (s *WebSearchService) BuildPromptContext(ctx *WebSearchContext) string {
	if !ctx.HasResults {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("\n\n[REAL-TIME WEB CONTEXT — Use this to answer accurately]:\n")
	sb.WriteString(fmt.Sprintf("Search query: %s\n", ctx.Query))
	sb.WriteString(fmt.Sprintf("Retrieved at: %s UTC\n\n", ctx.SearchedAt.Format("2006-01-02 15:04")))

	for i, r := range ctx.Results {
		if i >= 5 {
			break
		}
		sb.WriteString(fmt.Sprintf("[%d] %s\n", i+1, r.Title))
		if r.Snippet != "" {
			sb.WriteString(fmt.Sprintf("    %s\n", r.Snippet))
		}
		if r.URL != "" {
			sb.WriteString(fmt.Sprintf("    Source: %s\n", r.URL))
		}
		sb.WriteString("\n")
	}
	sb.WriteString("[END WEB CONTEXT]\n")
	return sb.String()
}

func (s *WebSearchService) buildContext(query string, results []SearchResult) *WebSearchContext {
	ctx := &WebSearchContext{
		Query:      query,
		Results:    results,
		SearchedAt: time.Now(),
		HasResults: len(results) > 0,
	}
	ctx.ContextText = s.BuildPromptContext(ctx)
	return ctx
}

// ─── DuckDuckGo Instant Answer API ─────────────────────────────────────────

func (s *WebSearchService) searchDDG(ctx context.Context, query string) ([]SearchResult, error) {
	// DDG Instant Answer API — free, no key required
	apiURL := "https://api.duckduckgo.com/?q=" + url.QueryEscape(query) +
		"&format=json&no_redirect=1&no_html=1&skip_disambig=1"

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GSTD-Swarm/1.0 (sovereign-ai)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	var ddgResp struct {
		Abstract       string `json:"Abstract"`
		AbstractURL    string `json:"AbstractURL"`
		AbstractSource string `json:"AbstractSource"`
		Answer         string `json:"Answer"`
		AnswerType     string `json:"AnswerType"`
		RelatedTopics  []struct {
			Text     string `json:"Text"`
			FirstURL string `json:"FirstURL"`
		} `json:"RelatedTopics"`
	}

	if err := json.Unmarshal(body, &ddgResp); err != nil {
		return nil, err
	}

	var results []SearchResult

	// Main abstract
	if ddgResp.Abstract != "" {
		results = append(results, SearchResult{
			Title:   ddgResp.AbstractSource,
			URL:     ddgResp.AbstractURL,
			Snippet: truncate(ddgResp.Abstract, 300),
			Source:  "ddg",
		})
	}

	// Instant answer (e.g. calculations, conversions)
	if ddgResp.Answer != "" && ddgResp.AnswerType != "" {
		results = append(results, SearchResult{
			Title:   "Instant Answer",
			URL:     "",
			Snippet: ddgResp.Answer,
			Source:  "ddg",
		})
	}

	// Related topics
	for _, rt := range ddgResp.RelatedTopics {
		if rt.Text == "" {
			continue
		}
		results = append(results, SearchResult{
			Title:   "Related",
			URL:     rt.FirstURL,
			Snippet: truncate(rt.Text, 200),
			Source:  "ddg",
		})
		if len(results) >= 4 {
			break
		}
	}

	return results, nil
}

// ─── Wikipedia API ──────────────────────────────────────────────────────────

func (s *WebSearchService) searchWikipedia(ctx context.Context, query string) ([]SearchResult, error) {
	// Wikipedia REST API — free, no key
	apiURL := "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
		url.QueryEscape(query) + "&format=json&srlimit=3"

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GSTD-Swarm/1.0 (sovereign-ai)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))

	var wikiResp struct {
		Query struct {
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := json.Unmarshal(body, &wikiResp); err != nil {
		return nil, err
	}

	var results []SearchResult
	for _, item := range wikiResp.Query.Search {
		// Remove HTML tags from snippet
		snippet := stripHTML(item.Snippet)
		results = append(results, SearchResult{
			Title:   item.Title,
			URL:     "https://en.wikipedia.org/wiki/" + url.QueryEscape(strings.ReplaceAll(item.Title, " ", "_")),
			Snippet: truncate(snippet, 250),
			Source:  "wikipedia",
		})
	}

	return results, nil
}

// ─── Brave Search API (optional) ───────────────────────────────────────────

func (s *WebSearchService) searchBrave(ctx context.Context, query string) ([]SearchResult, error) {
	if s.braveKey == "" {
		return nil, fmt.Errorf("brave key not configured")
	}

	apiURL := "https://api.search.brave.com/res/v1/web/search?q=" +
		url.QueryEscape(query) + "&count=5&search_lang=en"

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Subscription-Token", s.braveKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("brave status %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	var braveResp struct {
		Web struct {
			Results []struct {
				Title       string `json:"title"`
				URL         string `json:"url"`
				Description string `json:"description"`
			} `json:"results"`
		} `json:"web"`
	}

	if err := json.Unmarshal(body, &braveResp); err != nil {
		return nil, err
	}

	var results []SearchResult
	for _, item := range braveResp.Web.Results {
		results = append(results, SearchResult{
			Title:   item.Title,
			URL:     item.URL,
			Snippet: truncate(item.Description, 250),
			Source:  "brave",
		})
	}

	return results, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func stripHTML(s string) string {
	// Simple HTML tag removal
	result := strings.Builder{}
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	return result.String()
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
