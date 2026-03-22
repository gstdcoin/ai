package services

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// DEPT 10: ORACLE (Web Researcher) — Global Intelligence Gatherer
//
// Gives the platform internet access. It can scrape DDG or specific
// URLs to gather the latest best practices, crypto news, or
// technical documentation. The Autonomous Developer (DEPT 9) and
// Economics (DEPT 3) use this to stay ahead of the market.
// ═══════════════════════════════════════════════════════════════

func (op *PlatformOperator) SearchWeb(query string) (string, error) {
	// Let's use duckduckgo html to bypass API keys
	searchURL := fmt.Sprintf("https://html.duckduckgo.com/html/?q=%s", url.QueryEscape(query))

	req, _ := http.NewRequest("GET", searchURL, nil)
	// DDG requires a valid User-Agent
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	html := string(body)

	// Extract basic text snippets using regex (rough but effective for AI context)
	re := regexp.MustCompile("(?s)<a class=\"result__url\" href=\"(.*?)\">(.*?)</a>.*?<a class=\"result__snippet.*?>(.*?)</a>")
	matches := re.FindAllStringSubmatch(html, 5) // top 5 results

	if len(matches) == 0 {
		return "No results found.", nil
	}

	var resultBuilder strings.Builder
	for i, m := range matches {
		urlStr := strings.TrimSpace(m[1])
		snippet := strings.TrimSpace(m[3])
		// Remove remaining HTML tags
		snippet = regexp.MustCompile("<[^>]*>").ReplaceAllString(snippet, "")

		resultBuilder.WriteString(fmt.Sprintf("[%d] URL: %s\nSnippet: %s\n\n", i+1, urlStr, snippet))
	}

	log.Printf("🌐 ORACLE: Searched web for '%s', found %d results", query, len(matches))
	return resultBuilder.String(), nil
}

// ScrapeURL fetches the text content of a single web page.
func (op *PlatformOperator) ScrapeURL(target string) (string, error) {
	req, _ := http.NewRequest("GET", target, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	text := string(body)

	// Clean text heavily (remove scripts, styles, tags)
	text = regexp.MustCompile("(?is)<script.*?>.*?</script>").ReplaceAllString(text, "")
	text = regexp.MustCompile("(?is)<style.*?>.*?</style>").ReplaceAllString(text, "")
	text = regexp.MustCompile("<[^>]*>").ReplaceAllString(text, " ")
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")

	if len(text) > 8000 {
		text = text[:8000] // Cap to 8000 chars to save AI tokens
	}

	return strings.TrimSpace(text), nil
}
