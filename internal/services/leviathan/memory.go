package leviathan

import (
	"log"
	"strings"
)

// Lesson is a distilled vector from Final Resolution (Evolutionary Data: Continuous Vector Learning).
// Infinite Growth: MetaCause = extracted meta-reason (Pattern Extraction).
type Lesson struct {
	Sector     string // politics, crypto, general
	Keywords   string // space-separated keywords from event
	Correct    bool
	SourceUsed string // news | polymarket
	Reasoning  string
	MetaCause  string // Infinite Growth: extracted meta-cause vector
	CreatedAt  string // for Live Stream "Recall from [Date]"
}

// ExtractMetaCause derives meta-cause from reasoning (Pattern Extraction).
func ExtractMetaCause(reasoning string) string {
	r := strings.ToLower(reasoning)
	if strings.Contains(r, "sentiment shift") || strings.Contains(r, "late") {
		return "sentiment_shift"
	}
	if strings.Contains(r, "black swan") || strings.Contains(r, "withdraw") {
		return "black_swan"
	}
	if strings.Contains(r, "lag") || strings.Contains(r, "oracle") {
		return "oracle_lag"
	}
	if strings.Contains(r, "unexpected") {
		return "unexpected_resolution"
	}
	if reasoning != "" {
		return "other"
	}
	return ""
}

// LogLesson stores a distilled lesson in Long-Term Memory after Final Resolution.
func (e *ShadowEngine) LogLesson(l Lesson) error {
	meta := l.MetaCause
	if meta == "" && l.Reasoning != "" {
		meta = ExtractMetaCause(l.Reasoning)
	}
	_, err := e.db.Exec(`
		INSERT INTO long_term_lessons (sector, keywords, correct, source_used, reasoning, meta_cause)
		VALUES (?, ?, ?, ?, ?, ?)
	`, l.Sector, l.Keywords, l.Correct, l.SourceUsed, l.Reasoning, meta)
	if err != nil {
		log.Printf("[Leviathan] LogLesson error: %v", err)
		return err
	}
	return nil
}

// LessonWithID extends Lesson with SQLite row ID for sync checkpointing.
type LessonWithID struct {
	Lesson
	ID int64
}

// ExportLessonsForMerge returns lessons with id > sinceID for Global Knowledge Graph consolidation.
func (e *ShadowEngine) ExportLessonsForMerge(sinceID int64, limit int) ([]LessonWithID, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := e.db.Query(`
		SELECT id, sector, keywords, correct, source_used, COALESCE(reasoning,''), COALESCE(meta_cause,''), COALESCE(created_at,'')
		FROM long_term_lessons WHERE id > ? ORDER BY id ASC LIMIT ?
	`, sinceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []LessonWithID
	for rows.Next() {
		var l LessonWithID
		if err := rows.Scan(&l.ID, &l.Sector, &l.Keywords, &l.Correct, &l.SourceUsed, &l.Reasoning, &l.MetaCause, &l.CreatedAt); err != nil {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}

// FindSimilarPatterns searches Long-Term Memory for lessons matching the market (Evolutionary Data).
// Failure as Fuel: correct=0 lessons are priority — "meditate" on errors; return failures first.
func (e *ShadowEngine) FindSimilarPatterns(sector, keywords string, limit int) ([]Lesson, error) {
	if limit <= 0 {
		limit = 5
	}
	words := strings.Fields(strings.ToLower(keywords))
	if len(words) == 0 {
		return nil, nil
	}
	var conditions []string
	args := []interface{}{sector}
	for _, w := range words {
		if len(w) >= 3 {
			conditions = append(conditions, "keywords LIKE ?")
			args = append(args, "%"+w+"%")
		}
	}
	if len(conditions) == 0 {
		return nil, nil
	}
	args = append(args, limit)
	// Failure as Fuel: ORDER BY correct ASC — failures first, then by recency
	query := `SELECT sector, keywords, correct, source_used, reasoning, COALESCE(created_at, '') FROM long_term_lessons
		WHERE sector = ? AND (` + strings.Join(conditions, " OR ") + `)
		ORDER BY correct ASC, created_at DESC LIMIT ?`
	rows, err := e.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Lesson
	for rows.Next() {
		var l Lesson
		if err := rows.Scan(&l.Sector, &l.Keywords, &l.Correct, &l.SourceUsed, &l.Reasoning, &l.CreatedAt); err != nil {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}

// FindCrossSectorPatterns finds lessons from OTHER sectors with similar meta-patterns (e.g. "lag").
// Cross-Sector Synthesis: crypto oracle lag → politics news lag; use meta-pattern to boost Alpha.
func (e *ShadowEngine) FindCrossSectorPatterns(currentSector string, limit int) ([]Lesson, error) {
	if limit <= 0 {
		limit = 3
	}
	// Search other sectors for lessons with lag/shift/black swan in reasoning
	args := []interface{}{currentSector, limit}
	query := `SELECT sector, keywords, correct, source_used, reasoning, COALESCE(created_at, '') FROM long_term_lessons
		WHERE sector != ? AND (reasoning LIKE '%lag%' OR reasoning LIKE '%shift%' OR reasoning LIKE '%Black Swan%' OR reasoning LIKE '%withdraw%')
		ORDER BY correct ASC, created_at DESC LIMIT ?`
	rows, err := e.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Lesson
	for rows.Next() {
		var l Lesson
		if err := rows.Scan(&l.Sector, &l.Keywords, &l.Correct, &l.SourceUsed, &l.Reasoning, &l.CreatedAt); err != nil {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}

// SectorAccuracy holds correct/total per sector and source (Self-Correcting Weighting).
type SectorAccuracy struct {
	Sector      string
	Source      string // news | polymarket
	CorrectCnt  int
	TotalCnt    int
	AccuracyPct float64
}

// MarkSourceUnreliable — Omnipresence: Anti-Propaganda Filter. When news vs oracle divergence > 40%.
func (e *ShadowEngine) MarkSourceUnreliable(source, reason string) error {
	_, err := e.db.Exec(`INSERT OR REPLACE INTO unreliable_sources (source, reason, marked_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, source, reason)
	return err
}

// IsSourceUnreliable returns true if source was marked Unreliable.
func (e *ShadowEngine) IsSourceUnreliable(source string) bool {
	var n int
	err := e.db.QueryRow(`SELECT 1 FROM unreliable_sources WHERE source = ?`, source).Scan(&n)
	return err == nil
}

// MarkSectorLagging — Omniscience 2.0: Deep Sentiment Correlation. When news lags Code Layer > 30 min.
func (e *ShadowEngine) MarkSectorLagging(sector, reason string) error {
	_, err := e.db.Exec(`INSERT OR REPLACE INTO lagging_sectors (sector, reason, marked_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, sector, reason)
	return err
}

// IsSectorLagging returns true if sector was marked as Lagging Information.
func (e *ShadowEngine) IsSectorLagging(sector string) bool {
	var n int
	err := e.db.QueryRow(`SELECT 1 FROM lagging_sectors WHERE sector = ?`, sector).Scan(&n)
	return err == nil
}

// MarkMediaTrustDecay — Omni-Source: Propaganda Decay. When media contradicts Hard Data, reduce trust.
// Digital Hygiene: 3 consecutive contradictions → force decay to 0.1.
// Sovereign Ascension: 0.5 -> 0.25 -> 0. At 0, triggers Autonomous Cleansing.
func (e *ShadowEngine) MarkMediaTrustDecay(source, reason string) error {
	// Increment consecutive contradiction count
	var count int
	err := e.db.QueryRow(`SELECT consecutive_count FROM source_contradiction_count WHERE source = ?`, source).Scan(&count)
	if err != nil {
		count = 0
	}
	count++
	_, _ = e.db.Exec(`INSERT OR REPLACE INTO source_contradiction_count (source, consecutive_count, last_contradiction_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, source, count)

	// 3x contradiction → force decay to 0.1 (Digital Hygiene)
	if count >= 3 {
		return e.UpdateMediaTrustDecay(source, "3+ consecutive contradictions — forced decay 0.1", 0.1)
	}

	current := e.GetMediaTrustDecay(source)
	next := 0.5
	if current <= 0.5 && current > 0.25 {
		next = 0.25
	} else if current <= 0.25 && current > 0 {
		next = 0
	} else if current < 1.0 && current > 0.5 {
		next = 0.5
	}
	return e.UpdateMediaTrustDecay(source, reason, next)
}

// ResetContradictionCount — when source agrees with Hard Data, reset consecutive count.
func (e *ShadowEngine) ResetContradictionCount(source string) {
	_, _ = e.db.Exec(`DELETE FROM source_contradiction_count WHERE source = ?`, source)
}

// GetMediaTrustDecay returns decay factor (0.5 = 50% reduction). 1.0 if not decayed.
func (e *ShadowEngine) GetMediaTrustDecay(source string) float64 {
	var f float64
	err := e.db.QueryRow(`SELECT decay_factor FROM media_trust_decay WHERE source = ?`, source).Scan(&f)
	if err != nil {
		return 1.0
	}
	return f
}

// UpdateMediaTrustDecay sets decay factor. Sovereign Ascension: when 0, triggers Autonomous Cleansing.
func (e *ShadowEngine) UpdateMediaTrustDecay(source, reason string, decayFactor float64) error {
	_, err := e.db.Exec(`INSERT OR REPLACE INTO media_trust_decay (source, decay_factor, reason, marked_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`, source, decayFactor, reason)
	if err != nil {
		return err
	}
	if decayFactor <= 0 {
		return e.BlockSourceUntilEndOfMonth(source, "Autonomous Cleansing: trust decay=0")
	}
	return nil
}

// BlockSourceUntilEndOfMonth — Sovereign Ascension: Autonomous Cleansing. Block source until end of current month.
func (e *ShadowEngine) BlockSourceUntilEndOfMonth(source, reason string) error {
	// SQLite: date('now','start of month','+1 month','-1 day') = last day of current month
	_, err := e.db.Exec(`INSERT OR REPLACE INTO blocked_sources (source, reason, blocked_until) 
		VALUES (?, ?, date('now','start of month','+1 month','-1 day'))`, source, reason)
	return err
}

// IsSourceBlocked returns true if source is blocked until end of month (Autonomous Cleansing).
func (e *ShadowEngine) IsSourceBlocked(source string) bool {
	var n int
	err := e.db.QueryRow(`SELECT 1 FROM blocked_sources WHERE source = ? AND blocked_until >= date('now')`, source).Scan(&n)
	return err == nil
}

// CountBlockedMediaRatio returns (blocked, total). Eternal Oracle: >70% blocked = Integrity Guard.
// Total = distinct media sources (from media_trust_decay + blocked). Blocked = currently blocked.
func (e *ShadowEngine) CountBlockedMediaRatio() (blocked, total int) {
	rows, err := e.db.Query(`SELECT source FROM blocked_sources WHERE blocked_until >= date('now')`)
	if err != nil {
		return 0, 1
	}
	defer rows.Close()
	blockedSet := make(map[string]bool)
	for rows.Next() {
		var s string
		if rows.Scan(&s) == nil {
			blockedSet[s] = true
		}
	}
	blocked = len(blockedSet)
	// Total = all distinct sources from media_trust_decay (ever decayed) + blocked
	rows2, err := e.db.Query(`SELECT DISTINCT source FROM media_trust_decay`)
	if err != nil {
		return blocked, blocked + 1
	}
	defer rows2.Close()
	allSources := make(map[string]bool)
	for k := range blockedSet {
		allSources[k] = true
	}
	for rows2.Next() {
		var s string
		if rows2.Scan(&s) == nil {
			allSources[s] = true
		}
	}
	total = len(allSources)
	if total < 1 {
		total = 1
	}
	return blocked, total
}

// CountDomainsInLayers returns number of unique domains in layers_used (comma-separated). Hyper-Learning: 2+ required.
func CountDomainsInLayers(layersUsed string) int {
	if layersUsed == "" {
		return 0
	}
	seen := make(map[string]bool)
	for _, d := range strings.Split(layersUsed, ",") {
		d = strings.TrimSpace(d)
		if d != "" {
			seen[d] = true
		}
	}
	return len(seen)
}

// LogFactCorrelation — Omni-Source: Short-Term Memory. Store fact->market for 24h delay learning.
// Eternal Oracle: predictedHours for Temporal Precision refinement after resolution.
func (e *ShadowEngine) LogFactCorrelation(marketID, factDomain, factSource, sector, keywords string, predictedHours float64) error {
	_, err := e.db.Exec(`
		INSERT INTO fact_correlations (market_id, fact_domain, fact_source, sector, keywords, predicted_hours)
		VALUES (?, ?, ?, ?, ?, ?)
	`, marketID, factDomain, factSource, sector, keywords, predictedHours)
	return err
}

// ResolveFactCorrelation — when market closes, update fact_correlations with outcome and hours_to_resolution.
// Eternal Oracle: Temporal Precision — emits refinement message when predicted_hours was set.
func (e *ShadowEngine) ResolveFactCorrelation(marketID string, resolvedYes bool, correct bool) (actualHours float64, predictedHours float64, hadPrediction bool) {
	var pred float64
	_ = e.db.QueryRow(`SELECT COALESCE(predicted_hours, 0) FROM fact_correlations WHERE market_id = ? AND resolved_at IS NULL LIMIT 1`, marketID).Scan(&pred)
	_, err := e.db.Exec(`
		UPDATE fact_correlations SET resolved_at = CURRENT_TIMESTAMP, resolved_yes = ?, correct = ?,
		hours_to_resolution = (julianday('now') - julianday(observed_at)) * 24
		WHERE market_id = ? AND resolved_at IS NULL
	`, boolToInt(resolvedYes), boolToInt(correct), marketID)
	if err != nil {
		return 0, 0, false
	}
	var actual float64
	_ = e.db.QueryRow(`SELECT hours_to_resolution FROM fact_correlations WHERE market_id = ? AND resolved_at IS NOT NULL ORDER BY resolved_at DESC LIMIT 1`, marketID).Scan(&actual)
	return actual, pred, pred > 0
}

// FindSimilarFactChains — Sovereign Ascension: Predictive Fact-Linking. Returns avg hours_to_resolution for similar chains.
func (e *ShadowEngine) FindSimilarFactChains(domain, sector, keywords string, limit int) (avgHours float64, count int) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := e.db.Query(`
		SELECT hours_to_resolution FROM fact_correlations
		WHERE fact_domain = ? AND sector = ? AND resolved_at IS NOT NULL AND hours_to_resolution IS NOT NULL AND hours_to_resolution > 0
		ORDER BY resolved_at DESC LIMIT ?
	`, domain, sector, limit)
	if err != nil {
		return 0, 0
	}
	defer rows.Close()
	var sum float64
	for rows.Next() {
		var h float64
		if rows.Scan(&h) == nil && h > 0 {
			sum += h
			count++
		}
	}
	if count > 0 {
		avgHours = sum / float64(count)
	}
	return avgHours, count
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// UpdateSectorAccuracy records outcome for Self-Correcting Weighting.
func (e *ShadowEngine) UpdateSectorAccuracy(sector, sourceUsed string, correct bool) error {
	correctVal := 0
	if correct {
		correctVal = 1
	}
	// Normalize: rss -> news for aggregation
	if sourceUsed == "rss" || strings.Contains(strings.ToLower(sourceUsed), "rss") {
		sourceUsed = "news"
	}
	if sourceUsed == "" {
		sourceUsed = "polymarket"
	}
	_, err := e.db.Exec(`INSERT OR IGNORE INTO sector_accuracy (sector, source, correct_cnt, total_cnt) VALUES (?, ?, 0, 0)`, sector, sourceUsed)
	if err != nil {
		return err
	}
	_, err = e.db.Exec(`UPDATE sector_accuracy SET correct_cnt = correct_cnt + ?, total_cnt = total_cnt + 1 WHERE sector = ? AND source = ?`, correctVal, sector, sourceUsed)
	return err
}

// GetSectorWeights returns (newsWeight, polymarketWeight) based on historical accuracy.
// If News RSS historically more accurate for Politics — higher news weight.
func (e *ShadowEngine) GetSectorWeights(sector string) (newsWeight, polymarketWeight float64) {
	newsWeight, polymarketWeight = 0.5, 0.5 // default
	rows, err := e.db.Query(`
		SELECT source, correct_cnt, total_cnt FROM sector_accuracy WHERE sector = ? AND total_cnt >= 3
	`, sector)
	if err != nil {
		return newsWeight, polymarketWeight
	}
	defer rows.Close()
	var newsAcc, newsTot, polyAcc, polyTot float64
	for rows.Next() {
		var src string
		var correct, total int
		if err := rows.Scan(&src, &correct, &total); err != nil {
			continue
		}
		if src == "news" || src == "rss" {
			newsAcc += float64(correct)
			newsTot += float64(total)
		} else {
			polyAcc += float64(correct)
			polyTot += float64(total)
		}
	}
	if newsTot >= 3 && polyTot >= 3 {
		nAcc := newsAcc / newsTot
		pAcc := polyAcc / polyTot
		if nAcc > pAcc {
			newsWeight = 0.65
			polymarketWeight = 0.35
		} else if pAcc > nAcc {
			newsWeight = 0.35
			polymarketWeight = 0.65
		}
	}
	return newsWeight, polymarketWeight
}

// GetBestSourceForSector returns the source with highest accuracy for that sector (Open Data Synergy: Truth Weighting).
func (e *ShadowEngine) GetBestSourceForSector(sector string) string {
	rows, err := e.db.Query(`
		SELECT source, correct_cnt, total_cnt FROM sector_accuracy WHERE sector = ? AND total_cnt >= 2
		ORDER BY CAST(correct_cnt AS REAL) / total_cnt DESC LIMIT 1
	`, sector)
	if err != nil {
		return ""
	}
	defer rows.Close()
	if rows.Next() {
		var src string
		var correct, total int
		if err := rows.Scan(&src, &correct, &total); err != nil {
			return ""
		}
		return src
	}
	return ""
}

// SourceLeaderboardEntry holds source name and accuracy for Synthesis Supremacy: Source Accountability.
type SourceLeaderboardEntry struct {
	Source      string
	AccuracyPct float64
	Total       int
}

// GetSourceLeaderboard returns sources sorted by accuracy (Synthesis Supremacy: 24h report).
func (e *ShadowEngine) GetSourceLeaderboard() []SourceLeaderboardEntry {
	rows, err := e.db.Query(`
		SELECT source, SUM(correct_cnt) as c, SUM(total_cnt) as t
		FROM sector_accuracy WHERE total_cnt >= 2
		GROUP BY source HAVING t >= 2
		ORDER BY CAST(c AS REAL) / t DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []SourceLeaderboardEntry
	for rows.Next() {
		var src string
		var c, t int
		if err := rows.Scan(&src, &c, &t); err != nil {
			continue
		}
		if t > 0 {
			pct := float64(c) / float64(t) * 100
			displayName := src
			switch strings.ToLower(src) {
			case "news":
				displayName = "News"
			case "polymarket":
				displayName = "Polymarket"
			case "rss":
				displayName = "RSS"
			case "gnews":
				displayName = "GNews"
			case "cryptopanic":
				displayName = "CryptoPanic"
			case "pyth":
				displayName = "Pyth"
			}
			out = append(out, SourceLeaderboardEntry{Source: displayName, AccuracyPct: pct, Total: t})
		}
	}
	return out
}

// GetSectorAccuracyStats returns per-sector accuracy for Sentience Ticker (System Status).
func (e *ShadowEngine) GetSectorAccuracyStats() []struct {
	Sector      string
	AccuracyPct float64
} {
	rows, err := e.db.Query(`
		SELECT sector, SUM(correct_cnt) as correct, SUM(total_cnt) as total
		FROM sector_accuracy WHERE total_cnt >= 2
		GROUP BY sector
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []struct {
		Sector      string
		AccuracyPct float64
	}
	for rows.Next() {
		var sector string
		var correct, total int
		if err := rows.Scan(&sector, &correct, &total); err != nil {
			continue
		}
		if total > 0 {
			pct := float64(correct) / float64(total) * 100
			out = append(out, struct {
				Sector      string
				AccuracyPct float64
			}{sector, pct})
		}
	}
	return out
}

// RunEvolutionTuning computes current accuracy, compares to baseline, returns delta. Infinite Growth: Self-Evolution.
func (e *ShadowEngine) RunEvolutionTuning() (deltaPct float64, improved bool) {
	stats := e.GetSectorAccuracyStats()
	if len(stats) == 0 {
		return 0, false
	}
	// Current aggregate accuracy (weighted by sector size)
	rows, err := e.db.Query(`SELECT sector, SUM(correct_cnt) as c, SUM(total_cnt) as t FROM sector_accuracy GROUP BY sector`)
	if err != nil {
		return 0, false
	}
	defer rows.Close()
	var totalCorrect, totalCount int
	for rows.Next() {
		var sector string
		var c, t int
		if err := rows.Scan(&sector, &c, &t); err != nil {
			continue
		}
		totalCorrect += c
		totalCount += t
	}
	if totalCount < 5 {
		return 0, false
	}
	currentAcc := float64(totalCorrect) / float64(totalCount) * 100

	// Get previous baseline (stored as sector='_overall')
	var prevAcc float64
	err = e.db.QueryRow(`SELECT accuracy_pct FROM evolution_baseline WHERE sector = '_overall'`).Scan(&prevAcc)
	if err != nil {
		_, _ = e.db.Exec(`INSERT OR REPLACE INTO evolution_baseline (sector, accuracy_pct, tuned_at) VALUES ('_overall', ?, CURRENT_TIMESTAMP)`, currentAcc)
		return 0, false
	}

	// Update baseline
	_, _ = e.db.Exec(`INSERT OR REPLACE INTO evolution_baseline (sector, accuracy_pct, tuned_at) VALUES ('_overall', ?, CURRENT_TIMESTAMP)`, currentAcc)

	deltaPct = currentAcc - prevAcc
	improved = deltaPct > 0.001 // Logic Fix: lower threshold so EmitIntelligenceUpgraded is not blocked
	return deltaPct, improved
}
