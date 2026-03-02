package leviathan

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Omnipresence: Multi-Vertical Ingestion — GitHub, ArXiv, DEX as "Layers of Truth".
// When media says one thing and GitHub shows another — trust the code.
// Omniscience 2.0: LatestTime for Deep Sentiment Correlation (news lag detection).

// CodeLayer holds GitHub/ArXiv signals (Omnipresence: trust code over news).
type CodeLayer struct {
	GitHubSummary string
	GitHubSource  string
	ArXivSummary  string
	ArXivSource   string
	DEXSignal     string    // Pyth/oracle signal when available
	LatestTime    time.Time // newest UpdatedAt from GitHub/ArXiv; zero = none
}

// GitHubSearchResult from api.github.com/search/repositories
type githubSearchResult struct {
	Items []struct {
		FullName    string `json:"full_name"`
		Description string `json:"description"`
		UpdatedAt   string `json:"updated_at"`
		Stargazers  int    `json:"stargazers_count"`
	} `json:"items"`
}

// ArXivFeedItem from export.arxiv.org
type arxivFeedItem struct {
	Title   string `xml:"title"`
	Summary string `xml:"summary"`
	Updated string `xml:"updated"`
}

type arxivFeed struct {
	Entry []arxivFeedItem `xml:"entry"`
}

// FetchCodeLayer runs GitHub and ArXiv checks (Omnipresence: Layers of Truth).
// Omniscience 2.0: populates LatestTime from GitHub/ArXiv UpdatedAt for lag detection.
func (g *GlobalSenses) FetchCodeLayer(ctx context.Context, query string, isCrypto bool) *CodeLayer {
	cl := &CodeLayer{}
	var ghTime, arTime time.Time
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		cl.GitHubSummary, cl.GitHubSource, ghTime = g.githubCheckWithTime(ctx, query, isCrypto)
	}()
	wg.Add(1)
	go func() {
		defer wg.Done()
		cl.ArXivSummary, cl.ArXivSource, arTime = g.arxivCheckWithTime(ctx, query)
	}()
	wg.Wait()
	if !ghTime.IsZero() && (arTime.IsZero() || ghTime.After(arTime)) {
		cl.LatestTime = ghTime
	} else if !arTime.IsZero() {
		cl.LatestTime = arTime
	}
	return cl
}

func (g *GlobalSenses) githubCheckWithTime(ctx context.Context, query string, isCrypto bool) (summary, source string, latest time.Time) {
	searchQuery := query
	if isCrypto {
		searchQuery = "bitcoin ethereum " + query
	}
	u := fmt.Sprintf("https://api.github.com/search/repositories?q=%s&sort=updated&per_page=3",
		url.QueryEscape(searchQuery))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", time.Time{}
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "Leviathan/1.0")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", "", time.Time{}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", time.Time{}
	}
	var data githubSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", "", time.Time{}
	}
	if len(data.Items) == 0 {
		return "", "", time.Time{}
	}
	var parts []string
	for _, item := range data.Items {
		if item.Description != "" {
			parts = append(parts, item.FullName+": "+item.Description[:minInt(60, len(item.Description))])
		} else {
			parts = append(parts, item.FullName)
		}
		if item.UpdatedAt != "" {
			if t, err := time.Parse(time.RFC3339, item.UpdatedAt); err == nil && (latest.IsZero() || t.After(latest)) {
				latest = t
			}
		}
	}
	return strings.Join(parts, "; "), "GitHub", latest
}

func (g *GlobalSenses) arxivCheckWithTime(ctx context.Context, query string) (summary, source string, latest time.Time) {
	u := fmt.Sprintf("https://export.arxiv.org/api/query?search_query=all:%s&start=0&max_results=3&sortBy=lastUpdatedDate",
		url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", time.Time{}
	}
	req.Header.Set("User-Agent", "Leviathan/1.0")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", "", time.Time{}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", time.Time{}
	}
	var feed arxivFeed
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return "", "", time.Time{}
	}
	if len(feed.Entry) == 0 {
		return "", "", time.Time{}
	}
	var parts []string
	for _, e := range feed.Entry {
		title := strings.TrimSpace(strings.ReplaceAll(e.Title, "\n", " "))
		if len(title) > 80 {
			title = title[:77] + "..."
		}
		parts = append(parts, title)
		if e.Updated != "" {
			if t, err := time.Parse(time.RFC3339, e.Updated); err == nil {
				t = t.Truncate(time.Second)
				if latest.IsZero() || t.After(latest) {
					latest = t
				}
			}
		}
	}
	return strings.Join(parts, " | "), "ArXiv", latest
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// CodeTrumpsNews returns true when code layer contradicts news — trust code (Omnipresence).
func (cl *CodeLayer) CodeTrumpsNews(newsNegative bool) bool {
	if cl.GitHubSummary == "" && cl.ArXivSummary == "" {
		return false
	}
	codeText := strings.ToLower(cl.GitHubSummary + " " + cl.ArXivSummary)
	codePositive := strings.Contains(codeText, "adopt") || strings.Contains(codeText, "merge") ||
		strings.Contains(codeText, "release") || strings.Contains(codeText, "growth") ||
		strings.Contains(codeText, "upgrade") || strings.Contains(codeText, "integrate")
	codeNegative := strings.Contains(codeText, "deprecat") || strings.Contains(codeText, "security") ||
		strings.Contains(codeText, "vulnerability") || strings.Contains(codeText, "break")
	if newsNegative && codePositive {
		return true
	}
	if !newsNegative && codeNegative {
		return true
	}
	return false
}

// HasCodeLayer returns true if we have GitHub or ArXiv data.
func (cl *CodeLayer) HasCodeLayer() bool {
	return (cl.GitHubSummary != "" && cl.GitHubSource != "") ||
		(cl.ArXivSummary != "" && cl.ArXivSource != "")
}

// CodeLayerPositive returns true if Code Layer signals positive (growth, merge, release, etc.).
func (cl *CodeLayer) CodeLayerPositive() bool {
	if cl.GitHubSummary == "" && cl.ArXivSummary == "" {
		return false
	}
	codeText := strings.ToLower(cl.GitHubSummary + " " + cl.ArXivSummary)
	return strings.Contains(codeText, "adopt") || strings.Contains(codeText, "merge") ||
		strings.Contains(codeText, "release") || strings.Contains(codeText, "growth") ||
		strings.Contains(codeText, "upgrade") || strings.Contains(codeText, "integrate")
}

// CodeLayerNegative returns true if Code Layer signals negative.
func (cl *CodeLayer) CodeLayerNegative() bool {
	if cl.GitHubSummary == "" && cl.ArXivSummary == "" {
		return false
	}
	codeText := strings.ToLower(cl.GitHubSummary + " " + cl.ArXivSummary)
	return strings.Contains(codeText, "deprecat") || strings.Contains(codeText, "security") ||
		strings.Contains(codeText, "vulnerability") || strings.Contains(codeText, "break")
}

// CodeLayerContradictsFinance — Cognitive Synergy: highest protection. Block when Code and Pyth disagree.
// oracleLag = Pyth bullish (market underpricing). Code positive vs Pyth negative or Code negative vs Pyth positive = conflict.
func (cl *CodeLayer) CodeLayerContradictsFinance(oracleLag bool) bool {
	if !cl.HasCodeLayer() {
		return false
	}
	codePos := cl.CodeLayerPositive()
	codeNeg := cl.CodeLayerNegative()
	pythPos := oracleLag // oracle lag = bullish
	return (codePos && !pythPos) || (codeNeg && pythPos)
}
