package leviathan

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// sourceTier: verified (API) vs raw (RSS/aggregator)
const (
	sourceTierVerified = "verified"
	sourceTierRaw      = "raw"
)

// ExternalContext holds results from Global Senses (NewsCheck, SentimentCheck, HistoricalCheck).
// Sensory Resilience: includes source attribution and state media flag.
// Omnipresence: GitHub, ArXiv as Layers of Truth.
// Omniscience 2.0: NewsTimestamp, CodeLayerTimestamp for Deep Sentiment Correlation (lag detection).
type ExternalContext struct {
	NewsSummary           string
	NewsSource            string
	NewsSourceTier        string
	NewsIsStateMedia      bool
	NewsTimestamp         time.Time // when news was published; zero = unknown
	SentimentSummary      string
	SentimentSource       string
	SentimentSourceTier   string
	SentimentIsStateMedia bool
	HistoricalSummary     string
	HistoricalSource      string
	GitHubSummary         string
	GitHubSource          string
	ArXivSummary          string
	ArXivSource           string
	CodeLayerTimestamp    time.Time // newest UpdatedAt from GitHub/ArXiv; zero = no code layer
}

// BuildContextString returns a Context string for Telegram with specific links to external factors.
// Link Attribution: always includes Source: X (verified) or Source: X (raw).
func (e *ExternalContext) BuildContextString() string {
	return e.BuildContextStringWithTrustHierarchy(nil)
}

// BuildContextStringWithTrustHierarchy — Sovereign Ascension: 1.Code 2.Finance 3.Science 4.Social (only if trust>=0.8).
// getTrust: func(source) float64. If nil, no filtering. Social excluded when getTrust(source) < 0.8.
func (e *ExternalContext) BuildContextStringWithTrustHierarchy(getTrust func(string) float64) string {
	var parts []string
	// 1. Code (GitHub, ArXiv as code/science layer)
	if e.GitHubSummary != "" && e.GitHubSource != "" {
		parts = append(parts, fmt.Sprintf("Code Layer (%s): %s", e.GitHubSource, e.GitHubSummary))
	}
	if e.ArXivSummary != "" && e.ArXivSource != "" {
		parts = append(parts, fmt.Sprintf("Science Layer (%s): %s", e.ArXivSource, e.ArXivSummary))
	}
	// 2. Finance (Pyth) — added by caller when oracleUsed
	// 3. Science — ArXiv above
	// 4. Social — only if trust >= 0.8 (trust_decay < 20%)
	useSocial := func(source string) bool {
		if getTrust == nil {
			return true
		}
		return getTrust(source) >= 0.8
	}
	if e.NewsSummary != "" && e.NewsSource != "" && useSocial(e.NewsSource) {
		tier := e.NewsSourceTier
		if tier == "" {
			tier = sourceTierVerified
		}
		parts = append(parts, fmt.Sprintf("Based on %s headline: %s. Source: %s (%s)", e.NewsSource, e.NewsSummary, e.NewsSource, tier))
	}
	if e.SentimentSummary != "" && e.SentimentSource != "" && e.SentimentSource != "OneHourPriceChange (Int-Logic)" && useSocial(e.SentimentSource) {
		tier := e.SentimentSourceTier
		if tier == "" {
			tier = sourceTierVerified
		}
		parts = append(parts, fmt.Sprintf("%s sentiment: %s. Source: %s (%s)", e.SentimentSource, e.SentimentSummary, e.SentimentSource, tier))
	}
	if e.HistoricalSummary != "" && e.HistoricalSource != "" {
		parts = append(parts, fmt.Sprintf("%s similar past: %s. Source: %s (verified)", e.HistoricalSource, e.HistoricalSummary, e.HistoricalSource))
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "; ")
}

// HasAnyExternalData returns true if at least one sensor returned data (required for verdict).
// Sensory Resilience: verdict in 99% cases — HistoricalCheck (Polymarket) always available as fallback.
func (e *ExternalContext) HasAnyExternalData() bool {
	return (e.NewsSummary != "" && e.NewsSource != "") ||
		(e.SentimentSummary != "" && e.SentimentSource != "") ||
		(e.HistoricalSummary != "" && e.HistoricalSource != "")
}

// IsIntLogicOnly returns true when verdict uses only internal logic (no GNews/CryptoPanic/RSS).
// Steady Flow: Ticker Clarity — Architect sees (Int-Logic) for pure system calculation.
func (e *ExternalContext) IsIntLogicOnly() bool {
	hasRealNews := e.NewsSummary != "" && e.NewsSource != ""
	hasRealSentiment := e.SentimentSummary != "" && e.SentimentSource != "" && e.SentimentSource != "OneHourPriceChange (Int-Logic)"
	return !hasRealNews && !hasRealSentiment
}

// CountDistinctSources returns number of distinct data sources (Open Data Synergy: Multi-Source Fusion).
// Sources: News, Sentiment, Historical, Pyth, GitHub/ArXiv (Omnipresence: code layer).
func (e *ExternalContext) CountDistinctSources(oracleUsed bool) int {
	n := 0
	if e.NewsSummary != "" && e.NewsSource != "" {
		n++
	}
	if e.SentimentSummary != "" && e.SentimentSource != "" && e.SentimentSource != "OneHourPriceChange (Int-Logic)" {
		n++
	}
	if e.HistoricalSummary != "" && e.HistoricalSource != "" {
		n++
	}
	if oracleUsed {
		n++
	}
	if e.HasCodeLayer() {
		n++
	}
	return n
}

// HasMultiSourceFusion returns true when >= 2 distinct sources (Open Data Synergy).
func (e *ExternalContext) HasMultiSourceFusion(oracleUsed bool) bool {
	return e.CountDistinctSources(oracleUsed) >= 2
}

// DomainsPresent returns unique domains from current sources. Omni-Source: Cross-Domain Check.
func (e *ExternalContext) DomainsPresent(oracleUsed bool) []string {
	seen := make(map[string]bool)
	if e.NewsSummary != "" && e.NewsSource != "" {
		seen[SourceToDomain(e.NewsSource)] = true
	}
	if e.SentimentSummary != "" && e.SentimentSource != "" && e.SentimentSource != "OneHourPriceChange (Int-Logic)" {
		seen[SourceToDomain(e.SentimentSource)] = true
	}
	if e.HistoricalSummary != "" && e.HistoricalSource != "" {
		seen[SourceToDomain(e.HistoricalSource)] = true
	}
	if oracleUsed {
		seen[DomainFinance] = true // Pyth
	}
	if e.GitHubSummary != "" {
		seen[DomainCode] = true
	}
	if e.ArXivSummary != "" {
		seen[DomainScience] = true
	}
	var out []string
	for d := range seen {
		out = append(out, d)
	}
	return out
}

// HasCrossDomainConfirmation returns true when 2+ different domains confirm (Omni-Source Validation).
func (e *ExternalContext) HasCrossDomainConfirmation(oracleUsed bool) bool {
	domains := e.DomainsPresent(oracleUsed)
	return len(domains) >= 2
}

// LayersUsedString returns comma-separated domains for storage (Omni-Source / Hyper-Learning).
func (e *ExternalContext) LayersUsedString(oracleUsed bool) string {
	domains := e.DomainsPresent(oracleUsed)
	return strings.Join(domains, ",")
}

// MediaContradictsHardData — Omni-Source: Propaganda Decay. Media says X, Code/Finance says Y.
func (e *ExternalContext) MediaContradictsHardData(oracleUsed bool, isCrypto bool) bool {
	// Code layer contradicts news sentiment
	if e.HasCodeLayer() && e.CodeTrumpsNews() {
		return true
	}
	// Oracle (Pyth) vs negative news on crypto
	if oracleUsed && isCrypto && e.IsSentimentNegative() {
		return true
	}
	return false
}

// BuildContextStringOmniSource — Hyper-Learning: Propaganda Erasure. When media contradicts Hard Data, exclude it.
func (e *ExternalContext) BuildContextStringOmniSource(oracleUsed bool, mediaContradicted bool) string {
	if mediaContradicted {
		// Propaganda Erasure: exclude media, keep only Hard Data
		var parts []string
		if e.GitHubSummary != "" && e.GitHubSource != "" {
			parts = append(parts, fmt.Sprintf("Code Layer (GitHub): %s", e.GitHubSummary))
		}
		if e.ArXivSummary != "" && e.ArXivSource != "" {
			parts = append(parts, fmt.Sprintf("Science Layer (ArXiv): %s", e.ArXivSummary))
		}
		if e.HistoricalSummary != "" && e.HistoricalSource != "" {
			parts = append(parts, fmt.Sprintf("%s similar past: %s", e.HistoricalSource, e.HistoricalSummary))
		}
		if oracleUsed {
			parts = append(parts, "Pyth oracle: price signal (Verified)")
		}
		if len(parts) == 0 {
			return ""
		}
		return strings.Join(parts, "; ") + " [Media excluded: contradicted Hard Data]"
	}
	return e.BuildContextString()
}

// HasSourceConflict returns true when Pyth and News/Sentiment disagree (Synthesis Supremacy: Conflict Resolution).
// Pyth YES (oracle lag) vs News NO (negative sentiment) = conflict.
func (e *ExternalContext) HasSourceConflict(oracleUsed bool, isCrypto bool) bool {
	return oracleUsed && isCrypto && e.IsSentimentNegative()
}

// CodeTrumpsNews — Omnipresence: when media says one thing, GitHub/ArXiv shows another — trust code.
func (e *ExternalContext) CodeTrumpsNews() bool {
	cl := &CodeLayer{
		GitHubSummary: e.GitHubSummary,
		GitHubSource:  e.GitHubSource,
		ArXivSummary:  e.ArXivSummary,
		ArXivSource:   e.ArXivSource,
	}
	return cl.CodeTrumpsNews(e.IsSentimentNegative())
}

// HasCodeLayer — Omnipresence: GitHub or ArXiv data available.
func (e *ExternalContext) HasCodeLayer() bool {
	return (e.GitHubSummary != "" && e.GitHubSource != "") ||
		(e.ArXivSummary != "" && e.ArXivSource != "")
}

// CodeLayerContradictsFinance — Cognitive Synergy: block verdict when Code and Pyth disagree (highest protection).
func (e *ExternalContext) CodeLayerContradictsFinance(oracleLag bool) bool {
	cl := &CodeLayer{
		GitHubSummary: e.GitHubSummary,
		GitHubSource:  e.GitHubSource,
		ArXivSummary:  e.ArXivSummary,
		ArXivSource:   e.ArXivSource,
	}
	return cl.CodeLayerContradictsFinance(oracleLag)
}

// IsSentimentNegative returns true if sentiment check indicates negative tone.
func (e *ExternalContext) IsSentimentNegative() bool {
	s := strings.ToLower(e.SentimentSummary)
	return strings.Contains(s, "negative") || strings.Contains(s, "negativ") ||
		strings.Contains(s, "bearish") || strings.Contains(s, "down") ||
		strings.Contains(s, "sell") || strings.Contains(s, "fear")
}

// ConflictWithMarketPct returns 0-100: how much news contradicts Polymarket trend.
// Market YES + negative sentiment = high conflict. Market NO + positive sentiment = high conflict.
func (e *ExternalContext) ConflictWithMarketPct(marketYesPct float64) float64 {
	marketBetYES := marketYesPct > 0.5
	newsNegative := e.IsSentimentNegative()
	newsPositive := e.IsSentimentPositive()
	if (marketBetYES && newsNegative) || (!marketBetYES && newsPositive) {
		return 80
	}
	return 0
}

// IsSentimentPositive returns true if sentiment indicates positive tone.
func (e *ExternalContext) IsSentimentPositive() bool {
	s := strings.ToLower(e.SentimentSummary)
	return strings.Contains(s, "positive") || strings.Contains(s, "bullish") ||
		strings.Contains(s, "gain") || strings.Contains(s, "rise") ||
		strings.Contains(s, "approve") || strings.Contains(s, "pass")
}

// ShouldApplySuperAlpha returns true if news 80%+ contradicts Polymarket trend (+10% to alpha).
func (e *ExternalContext) ShouldApplySuperAlpha(marketYesPct float64) bool {
	return e.ConflictWithMarketPct(marketYesPct) >= 80
}

// PoliticalWeightingMultiplier returns 0.5 if primary news source is State Media, else 1.0.
func (e *ExternalContext) PoliticalWeightingMultiplier() float64 {
	if e.NewsIsStateMedia || e.SentimentIsStateMedia {
		return 0.5
	}
	return 1.0
}

// GlobalSenses runs NewsCheck, SentimentCheck, HistoricalCheck in parallel.
type GlobalSenses struct {
	cfg    *Config
	pm     *PolymarketClient
	client *http.Client
}

// NewGlobalSenses creates the Global Senses sensor layer.
func NewGlobalSenses(cfg *Config, pm *PolymarketClient) *GlobalSenses {
	return &GlobalSenses{
		cfg:    cfg,
		pm:     pm,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Fetch runs all 3 checks in parallel. Sensory Resilience: Multi-Tier Fetching — primary API, then RSS fallback.
func (g *GlobalSenses) Fetch(ctx context.Context, market MarketPrice) *ExternalContext {
	var wg sync.WaitGroup
	var ext ExternalContext

	query := extractSearchQuery(market)
	isCrypto := isCryptoMarket(market)

	// NewsCheck: GNews → RSS fallback. Omniscience 2.0: NewsTimestamp for Deep Sentiment Correlation.
	wg.Add(1)
	go func() {
		defer wg.Done()
		ext.NewsSummary, ext.NewsSource, ext.NewsSourceTier, ext.NewsIsStateMedia, ext.NewsTimestamp = g.newsCheckMultiTierWithTime(ctx, query)
	}()

	// SentimentCheck: CryptoPanic/GNews → RSS fallback
	wg.Add(1)
	go func() {
		defer wg.Done()
		ext.SentimentSummary, ext.SentimentSource, ext.SentimentSourceTier, ext.SentimentIsStateMedia = g.sentimentCheckMultiTier(ctx, query, isCrypto)
	}()

	// HistoricalCheck: Polymarket (always available, no external API)
	wg.Add(1)
	go func() {
		defer wg.Done()
		ext.HistoricalSummary, ext.HistoricalSource = g.historicalCheck(ctx, query)
	}()

	// Omnipresence: Multi-Vertical — GitHub, ArXiv (Layers of Truth). Omniscience 2.0: CodeLayerTimestamp for lag detection.
	wg.Add(1)
	go func() {
		defer wg.Done()
		cl := g.FetchCodeLayer(ctx, query, isCrypto)
		ext.GitHubSummary, ext.GitHubSource = cl.GitHubSummary, cl.GitHubSource
		ext.ArXivSummary, ext.ArXivSource = cl.ArXivSummary, cl.ArXivSource
		ext.CodeLayerTimestamp = cl.LatestTime
	}()

	wg.Wait()

	// Steady Flow: Data Maximization — when GNews unavailable, use OneHourPriceChange as sentiment surrogate
	if (ext.NewsSummary == "" || ext.NewsSource == "") && (ext.SentimentSummary == "" || ext.SentimentSource == "") {
		if market.OneHourChange > 0.05 {
			ext.SentimentSummary = "Temporary Hype"
			ext.SentimentSource = "OneHourPriceChange (Int-Logic)"
		} else if market.OneHourChange < -0.05 {
			ext.SentimentSummary = "Panic sell"
			ext.SentimentSource = "OneHourPriceChange (Int-Logic)"
		}
	}

	return &ext
}

func extractSearchQuery(market MarketPrice) string {
	// Use event name + first few words of question (max ~50 chars for API)
	text := market.EventName + " " + market.Question
	words := strings.Fields(text)
	var out []string
	n := 0
	for _, w := range words {
		if n+len(w)+1 > 50 {
			break
		}
		out = append(out, w)
		n += len(w) + 1
	}
	return strings.Join(out, " ")
}

func isCryptoMarket(market MarketPrice) bool {
	s := strings.ToLower(market.EventName + " " + market.Question)
	crypto := []string{"btc", "bitcoin", "eth", "ethereum", "sol", "solana", "crypto", "token", "defi", "nft"}
	for _, c := range crypto {
		if strings.Contains(s, c) {
			return true
		}
	}
	return false
}

// InferSector returns politics, crypto, or general.
func InferSector(market MarketPrice) string {
	return InferSectorFromText(market.EventName + " " + market.Question)
}

// ExtractSubtextKeywords returns deeper keywords for Weight Evolution (when news dominant).
// Uses InferSectorFromText logic to extract policy/candidate/asset terms for deeper analysis.
func ExtractSubtextKeywords(text string) []string {
	t := strings.ToLower(text)
	var out []string
	// Political subtext
	for _, w := range []string{"trump", "biden", "congress", "senate", "bill", "veto", "impeach", "nominee", "endorsement"} {
		if strings.Contains(t, w) {
			out = append(out, w)
		}
	}
	// Crypto subtext
	for _, w := range []string{"btc", "bitcoin", "eth", "ethereum", "sec", "etf", "halving", "whale"} {
		if strings.Contains(t, w) {
			out = append(out, w)
		}
	}
	// Risk subtext
	for _, w := range []string{"deadline", "default", "shutdown", "crash", "ban", "regulation"} {
		if strings.Contains(t, w) {
			out = append(out, w)
		}
	}
	return out
}

// InferSectorFromText infers sector from event name + question text.
// Omniscience 2.0: technology → GitHub 100%; crypto/finance → DEX/Pyth 100%.
func InferSectorFromText(text string) string {
	t := strings.ToLower(text)
	// Technology: software, github, merge, release, api, tech, ai (Omniscience 2.0: GitHub 100%).
	tech := []string{"github", "software", "merge", "release", "api", "tech", "ai ", "openai", "llm", "model", "protocol"}
	for _, w := range tech {
		if strings.Contains(t, w) {
			return "technology"
		}
	}
	if strings.Contains(t, "trump") || strings.Contains(t, "biden") || strings.Contains(t, "election") ||
		strings.Contains(t, "vote") || strings.Contains(t, "congress") || strings.Contains(t, "senate") ||
		strings.Contains(t, "president") || strings.Contains(t, "government") || strings.Contains(t, "policy") {
		return "politics"
	}
	if strings.Contains(t, "btc") || strings.Contains(t, "bitcoin") || strings.Contains(t, "eth") ||
		strings.Contains(t, "ethereum") || strings.Contains(t, "crypto") || strings.Contains(t, "sol") ||
		strings.Contains(t, "token") || strings.Contains(t, "price") || strings.Contains(t, "market cap") {
		return "crypto"
	}
	return "general"
}

// InferSourceUsed returns "news" if external news/sentiment was primary, else "polymarket".
func (e *ExternalContext) InferSourceUsed() string {
	if (e.NewsSummary != "" || e.SentimentSummary != "") && e.HistoricalSummary == "" {
		return "news"
	}
	if (e.NewsSummary != "" || e.SentimentSummary != "") && (e.HistoricalSummary != "") {
		return "news" // both present, news had influence
	}
	return "polymarket"
}

// IsPoliticalMarket returns true for political markets (Political Weighting applies).
func IsPoliticalMarket(market MarketPrice) bool {
	s := strings.ToLower(market.EventName + " " + market.Question)
	pol := []string{"trump", "biden", "election", "vote", "congress", "senate", "president", "government", "policy", "bill", "law"}
	for _, p := range pol {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

// newsCheckMultiTier: GNews API → Open RSS fallback. Sensory Resilience: verdict in 99% cases.
func (g *GlobalSenses) newsCheckMultiTier(ctx context.Context, query string) (summary, source, tier string, isStateMedia bool) {
	sum, src, t, stateMedia, _ := g.newsCheckMultiTierWithTime(ctx, query)
	return sum, src, t, stateMedia
}

// newsCheckMultiTierWithTime returns (summary, source, tier, isStateMedia, newsTimestamp). Omniscience 2.0: Deep Sentiment Correlation.
func (g *GlobalSenses) newsCheckMultiTierWithTime(ctx context.Context, query string) (summary, source, tier string, isStateMedia bool, newsTimestamp time.Time) {
	if g.cfg.GNewsAPIKey != "" {
		sum, src, stateMedia, ts := g.newsCheckGNewsWithTime(ctx, query)
		if sum != "" && src != "" {
			return sum, src, sourceTierVerified, stateMedia, ts
		}
		log.Printf("[Leviathan] NewsCheck GNews unavailable, falling back to RSS")
	}
	sum, src, ts := g.newsCheckRSSWithTime(ctx, query)
	if sum != "" && src != "" {
		return sum, src, sourceTierRaw, isStateMediaSource(src), ts
	}
	return "", "", "", false, time.Time{}
}

func (g *GlobalSenses) newsCheckGNews(ctx context.Context, query string) (summary, source string, isStateMedia bool) {
	sum, src, stateMedia, _ := g.newsCheckGNewsWithTime(ctx, query)
	return sum, src, stateMedia
}

func (g *GlobalSenses) newsCheckGNewsWithTime(ctx context.Context, query string) (summary, source string, isStateMedia bool, publishedAt time.Time) {
	u := fmt.Sprintf("https://gnews.io/api/v4/search?q=%s&lang=en&max=3&apikey=%s",
		url.QueryEscape(query), url.QueryEscape(g.cfg.GNewsAPIKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", false, time.Time{}
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", "", false, time.Time{}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", false, time.Time{}
	}
	var data struct {
		Articles []struct {
			Title       string `json:"title"`
			PublishedAt string `json:"publishedAt"`
			Source      struct {
				Name string `json:"name"`
			} `json:"source"`
		} `json:"articles"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", "", false, time.Time{}
	}
	if len(data.Articles) == 0 {
		return "", "", false, time.Time{}
	}
	top := data.Articles[0]
	src := top.Source.Name
	if src == "" {
		src = "GNews"
	}
	summary = top.Title
	if len(summary) > 80 {
		summary = summary[:77] + "..."
	}
	if top.PublishedAt != "" {
		if t, err := time.Parse("2006-01-02T15:04:05Z", top.PublishedAt); err == nil {
			publishedAt = t
		} else if t, err := time.Parse(time.RFC3339, top.PublishedAt); err == nil {
			publishedAt = t
		}
	}
	return summary, src, isStateMediaSource(src), publishedAt
}

// newsCheckRSS: Google News RSS — open aggregator, no API key.
func (g *GlobalSenses) newsCheckRSS(ctx context.Context, query string) (summary, source string) {
	sum, src, _ := g.newsCheckRSSWithTime(ctx, query)
	return sum, src
}

// newsCheckRSSWithTime returns (summary, source, pubDate). Omniscience 2.0: Deep Sentiment Correlation.
func (g *GlobalSenses) newsCheckRSSWithTime(ctx context.Context, query string) (summary, source string, pubDate time.Time) {
	u := fmt.Sprintf("https://news.google.com/rss/search?q=%s&hl=en-US&gl=US&ceid=US:en",
		url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", time.Time{}
	}
	req.Header.Set("User-Agent", "Leviathan/1.0")
	resp, err := g.client.Do(req)
	if err != nil {
		log.Printf("[Leviathan] NewsCheck RSS error: %v", err)
		return "", "", time.Time{}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", time.Time{}
	}
	var feed rssFeed
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return "", "", time.Time{}
	}
	if len(feed.Channel.Items) == 0 {
		return "", "", time.Time{}
	}
	item := feed.Channel.Items[0]
	summary = stripHTML(item.Title)
	if len(summary) > 80 {
		summary = summary[:77] + "..."
	}
	source = extractRSSSource(item.Source)
	if source == "" {
		source = "Open RSS"
	}
	if item.PubDate != "" {
		if t, err := time.Parse(time.RFC1123Z, item.PubDate); err == nil {
			pubDate = t
		} else if t, err := time.Parse(time.RFC1123, item.PubDate); err == nil {
			pubDate = t
		}
	}
	return summary, source, pubDate
}

type rssFeed struct {
	Channel struct {
		Items []struct {
			Title   string `xml:"title"`
			Source  string `xml:"source"`
			PubDate string `xml:"pubDate"`
		} `xml:"item"`
	} `xml:"channel"`
}

func stripHTML(s string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	return strings.TrimSpace(re.ReplaceAllString(s, ""))
}

func extractRSSSource(itemSource string) string {
	// Google RSS source can be in format "Source Name" or URL
	s := strings.TrimSpace(itemSource)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http") {
		return "Open RSS"
	}
	return s
}

var stateMediaPatterns = []string{"rt ", "rt.", "tass", "xinhua", "cgtn", "global times", "sputnik", "cctv", "peoples daily", "pravda", "sana", "irna", "presstv"}

func isStateMediaSource(source string) bool {
	s := strings.ToLower(source)
	for _, p := range stateMediaPatterns {
		if strings.Contains(s, p) {
			return true
		}
	}
	return false
}

// sentimentCheckMultiTier: CryptoPanic/GNews → RSS fallback.
func (g *GlobalSenses) sentimentCheckMultiTier(ctx context.Context, query string, isCrypto bool) (summary, source, tier string, isStateMedia bool) {
	// Tier 1: CryptoPanic (crypto) or GNews
	if isCrypto && g.cfg.CryptoPanicAPIKey != "" {
		sum, src := g.sentimentCryptoPanic(ctx, query)
		if sum != "" && src != "" {
			return sum, src, sourceTierVerified, false
		}
	}
	if g.cfg.GNewsAPIKey != "" {
		sum, src, stateMedia := g.sentimentFromGNewsWithStateMedia(ctx, query)
		if sum != "" && src != "" {
			return sum, src, sourceTierVerified, stateMedia
		}
	}
	// Tier 2: RSS fallback
	sum, src := g.sentimentFromRSS(ctx, query)
	if sum != "" && src != "" {
		return sum, src, sourceTierRaw, isStateMediaSource(src)
	}
	return "", "", "", false
}

func (g *GlobalSenses) sentimentCryptoPanic(ctx context.Context, query string) (summary, source string) {
	u := fmt.Sprintf("https://cryptopanic.com/api/v1/posts/?auth_token=%s&public=true&filter=hot",
		url.QueryEscape(g.cfg.CryptoPanicAPIKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", ""
	}
	resp, err := g.client.Do(req)
	if err != nil {
		log.Printf("[Leviathan] SentimentCheck CryptoPanic error: %v", err)
		return "", ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", ""
	}
	var data struct {
		Results []struct {
			Title string `json:"title"`
			Votes struct {
				Positive int `json:"positive"`
				Negative int `json:"negative"`
			} `json:"votes"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", ""
	}
	if len(data.Results) == 0 {
		return "", ""
	}
	pos, neg := 0, 0
	for _, r := range data.Results {
		pos += r.Votes.Positive
		neg += r.Votes.Negative
	}
	if pos > neg {
		return "positive/bullish", "CryptoPanic"
	}
	if neg > pos {
		return "negative/bearish sentiment flip", "CryptoPanic"
	}
	return "neutral", "CryptoPanic"
}

func (g *GlobalSenses) sentimentFromGNewsWithStateMedia(ctx context.Context, query string) (summary, source string, isStateMedia bool) {
	if g.cfg.GNewsAPIKey == "" {
		return "", "", false
	}
	u := fmt.Sprintf("https://gnews.io/api/v4/search?q=%s&lang=en&max=5&apikey=%s",
		url.QueryEscape(query), url.QueryEscape(g.cfg.GNewsAPIKey))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", "", false
	}
	resp, err := g.client.Do(req)
	if err != nil {
		return "", "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", false
	}
	var data struct {
		Articles []struct {
			Title  string `json:"title"`
			Source struct {
				Name string `json:"name"`
			} `json:"source"`
		} `json:"articles"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", "", false
	}
	negWords := []string{"crash", "fall", "drop", "fail", "lose", "loss", "crisis", "scandal", "resign", "withdraw"}
	posWords := []string{"win", "gain", "rise", "surge", "approve", "pass", "deal", "agree"}
	negCount, posCount := 0, 0
	var firstSource string
	for i, a := range data.Articles {
		if i == 0 && a.Source.Name != "" {
			firstSource = a.Source.Name
		}
		t := strings.ToLower(a.Title)
		for _, w := range negWords {
			if strings.Contains(t, w) {
				negCount++
				break
			}
		}
		for _, w := range posWords {
			if strings.Contains(t, w) {
				posCount++
				break
			}
		}
	}
	src := firstSource
	if src == "" {
		src = "GNews"
	}
	if negCount > posCount {
		return "negative headline bias", src, isStateMediaSource(src)
	}
	if posCount > negCount {
		return "positive headline bias", src, isStateMediaSource(src)
	}
	return "neutral headlines", src, isStateMediaSource(src)
}

func (g *GlobalSenses) sentimentFromRSS(ctx context.Context, query string) (summary, source string) {
	u := fmt.Sprintf("https://news.google.com/rss/search?q=%s&hl=en-US&gl=US&ceid=US:en",
		url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", ""
	}
	req.Header.Set("User-Agent", "Leviathan/1.0")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", ""
	}
	var feed rssFeed
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return "", ""
	}
	if len(feed.Channel.Items) == 0 {
		return "", ""
	}
	negWords := []string{"crash", "fall", "drop", "fail", "lose", "loss", "crisis", "scandal", "resign", "withdraw"}
	posWords := []string{"win", "gain", "rise", "surge", "approve", "pass", "deal", "agree"}
	negCount, posCount := 0, 0
	for _, item := range feed.Channel.Items {
		t := strings.ToLower(stripHTML(item.Title))
		for _, w := range negWords {
			if strings.Contains(t, w) {
				negCount++
				break
			}
		}
		for _, w := range posWords {
			if strings.Contains(t, w) {
				posCount++
				break
			}
		}
	}
	if negCount > posCount {
		return "negative headline bias (RSS)", "Open RSS"
	}
	if posCount > negCount {
		return "positive headline bias (RSS)", "Open RSS"
	}
	return "neutral headlines (RSS)", "Open RSS"
}

// historicalCheck: Polymarket closed events with similar keywords.
func (g *GlobalSenses) historicalCheck(ctx context.Context, query string) (summary, source string) {
	if g.pm == nil {
		return "", ""
	}
	closed, err := g.pm.FetchClosedEvents(200)
	if err != nil {
		return "", ""
	}
	words := strings.Fields(strings.ToLower(query))
	var matches []MarketPrice
	for _, m := range closed {
		text := strings.ToLower(m.EventName + " " + m.Question)
		score := 0
		for _, w := range words {
			if len(w) < 4 {
				continue
			}
			if strings.Contains(text, w) {
				score++
			}
		}
		if score >= 1 {
			matches = append(matches, m)
		}
	}
	if len(matches) == 0 {
		// Sensory Resilience: Polymarket closed check counts as external data even when no keyword match
		if len(closed) > 0 {
			return "no similar past events in closed markets", "Polymarket"
		}
		return "", ""
	}
	// Summarize outcomes
	yesCount, noCount := 0, 0
	for _, m := range matches {
		if m.ResolvedYes != nil {
			if *m.ResolvedYes {
				yesCount++
			} else {
				noCount++
			}
		}
	}
	if yesCount+noCount == 0 {
		return "", ""
	}
	if yesCount > noCount {
		summary = fmt.Sprintf("similar past: %d resolved YES, %d NO", yesCount, noCount)
	} else if noCount > yesCount {
		summary = fmt.Sprintf("similar past: %d resolved NO, %d YES", noCount, yesCount)
	} else {
		summary = fmt.Sprintf("similar past: %d YES, %d NO (mixed)", yesCount, noCount)
	}
	return summary, "Polymarket closed"
}
