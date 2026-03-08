package leviathan

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	_ "modernc.org/sqlite"
)

// ShadowEngine stores and audits virtual predictions in SQLite.
type ShadowEngine struct {
	db   *sql.DB
	path string
}

// NewShadowEngine opens or creates SQLite DB. Asset Protection: WAL + synchronous=FULL.
func NewShadowEngine(path string) (*ShadowEngine, error) {
	db, err := sql.Open("sqlite", path+"?_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
	// Asset Protection: treat DB as bank vault
	_, _ = db.Exec("PRAGMA synchronous=FULL")
	_, _ = db.Exec("PRAGMA journal_mode=WAL")
	e := &ShadowEngine{db: db, path: path}
	if err := e.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return e, nil
}

func (e *ShadowEngine) migrate() error {
	_, err := e.db.Exec(`
		CREATE TABLE IF NOT EXISTS shadow_predictions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id TEXT NOT NULL,
			market_id TEXT NOT NULL,
			event_name TEXT,
			market_question TEXT,
			leviathan_pct REAL NOT NULL,
			market_pct REAL NOT NULL,
			alpha_pct REAL NOT NULL,
			logic TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			closed_at DATETIME,
			resolved_yes INTEGER,
			correct INTEGER,
			confidence_score REAL DEFAULT 0.5,
			reasoning TEXT
		);
		CREATE INDEX IF NOT EXISTS idx_shadow_event ON shadow_predictions(event_id);
		CREATE INDEX IF NOT EXISTS idx_shadow_market ON shadow_predictions(market_id);
		CREATE INDEX IF NOT EXISTS idx_shadow_closed ON shadow_predictions(closed_at);
	`)
	if err != nil {
		return err
	}
	// Add reasoning column if missing (Self-Correcting Prophet: Feedback Honesty)
	_, _ = e.db.Exec("ALTER TABLE shadow_predictions ADD COLUMN reasoning TEXT")
	// Add source_used for Evolutionary Data (Self-Correcting Weighting)
	_, _ = e.db.Exec("ALTER TABLE shadow_predictions ADD COLUMN source_used TEXT")

	// Evolutionary Data: Long-Term Memory (Continuous Vector Learning)
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS long_term_lessons (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sector TEXT NOT NULL,
			keywords TEXT NOT NULL,
			correct INTEGER NOT NULL,
			source_used TEXT NOT NULL,
			reasoning TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_lessons_sector ON long_term_lessons(sector);
		CREATE INDEX IF NOT EXISTS idx_lessons_keywords ON long_term_lessons(keywords);
	`)

	// Evolutionary Data: Self-Correcting Weighting (sector accuracy by source)
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS sector_accuracy (
			sector TEXT NOT NULL,
			source TEXT NOT NULL,
			correct_cnt INTEGER DEFAULT 0,
			total_cnt INTEGER DEFAULT 0,
			PRIMARY KEY (sector, source)
		);
	`)

	// Infinite Growth: meta_cause for Pattern Extraction
	_, _ = e.db.Exec("ALTER TABLE long_term_lessons ADD COLUMN meta_cause TEXT")

	// Infinite Growth: evolution baseline for Self-Evolution (Genetic Tuning)
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS evolution_baseline (
			sector TEXT PRIMARY KEY,
			accuracy_pct REAL NOT NULL,
			tuned_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// Omnipresence: Anti-Propaganda Filter — sources marked Unreliable when news vs oracle divergence > 40%
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS unreliable_sources (
			source TEXT PRIMARY KEY,
			reason TEXT,
			marked_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// Omniscience 2.0: Deep Sentiment Correlation — sectors where news lags Code Layer > 30 min
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS lagging_sectors (
			sector TEXT PRIMARY KEY,
			reason TEXT,
			marked_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// Omni-Source / Hyper-Learning: layers_used for Cross-Verification (2+ domains required)
	_, _ = e.db.Exec("ALTER TABLE shadow_predictions ADD COLUMN layers_used TEXT")

	// Eternal Oracle: Shadow Execution — predicted reaction time (hours)
	_, _ = e.db.Exec("ALTER TABLE shadow_predictions ADD COLUMN predicted_reaction_hours REAL")

	// Omni-Source: Short-Term Memory — fact->result 24h correlations for delay learning
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS fact_correlations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			market_id TEXT NOT NULL,
			fact_domain TEXT NOT NULL,
			fact_source TEXT NOT NULL,
			fact_hash TEXT,
			sector TEXT NOT NULL,
			keywords TEXT,
			observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			resolved_at DATETIME,
			resolved_yes INTEGER,
			correct INTEGER,
			hours_to_resolution REAL
		);
		CREATE INDEX IF NOT EXISTS idx_fact_market ON fact_correlations(market_id);
		CREATE INDEX IF NOT EXISTS idx_fact_domain ON fact_correlations(fact_domain);
	`)
	// Eternal Oracle: Temporal Precision — predicted hours for refinement after resolution
	_, _ = e.db.Exec("ALTER TABLE fact_correlations ADD COLUMN predicted_hours REAL")

	// Omni-Source: Propaganda Decay — media trust reduction when contradicts Hard Data
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS media_trust_decay (
			source TEXT PRIMARY KEY,
			decay_factor REAL DEFAULT 0.5,
			reason TEXT,
			marked_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)

	// Sovereign Ascension: Autonomous Cleansing — sources blocked until end of month when decay=0
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS blocked_sources (
			source TEXT PRIMARY KEY,
			reason TEXT,
			blocked_until DATE NOT NULL
		);
	`)

	// Digital Hygiene: track consecutive contradictions — 3x → Propaganda Decay 0.1
	_, _ = e.db.Exec(`
		CREATE TABLE IF NOT EXISTS source_contradiction_count (
			source TEXT PRIMARY KEY,
			consecutive_count INTEGER DEFAULT 0,
			last_contradiction_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	return nil
}

func (e *ShadowEngine) LogShadow(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic string) (int64, error) {
	return e.LogShadowWithSourceAndLayers(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, "", "")
}

func (e *ShadowEngine) LogShadowWithSource(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic, sourceUsed string) (int64, error) {
	return e.LogShadowWithSourceAndLayers(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, sourceUsed, "")
}

func (e *ShadowEngine) LogShadowWithSourceAndLayers(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic, sourceUsed, layersUsed string) (int64, error) {
	return e.LogShadowWithSourceAndLayersAndPredictedHours(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, sourceUsed, layersUsed, 0)
}

func (e *ShadowEngine) LogShadowWithSourceAndLayersAndPredictedHours(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic, sourceUsed, layersUsed string, predictedReactionHours float64) (int64, error) {
	res, err := e.db.Exec(`
		INSERT INTO shadow_predictions (event_id, market_id, event_name, market_question, leviathan_pct, market_pct, alpha_pct, logic, source_used, layers_used, predicted_reaction_hours)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, sourceUsed, layersUsed, predictedReactionHours)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (e *ShadowEngine) PendingAudits() ([]string, error) {
	rows, err := e.db.Query(`SELECT DISTINCT market_id FROM shadow_predictions WHERE closed_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// HasPendingPrediction returns true if we have an unaudited shadow bet for this market (cache: skip duplicate processing).
func (e *ShadowEngine) HasPendingPrediction(marketID string) (bool, error) {
	var n int
	err := e.db.QueryRow(`SELECT 1 FROM shadow_predictions WHERE market_id = ? AND closed_at IS NULL LIMIT 1`, marketID).Scan(&n)
	if err == sql.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// AuditClosedMarket performs audit and delegates to AuditClosedMarketAndReport (Final Resolution protocol).
func (e *ShadowEngine) AuditClosedMarket(marketID string, resolvedYes bool) error {
	_, err := e.AuditClosedMarketAndReport(marketID, resolvedYes)
	return err
}

// AuditResult holds data for Feedback Report after market close.
type AuditResult struct {
	MarketID         string
	EventName        string
	MarketQuestion   string
	LeviathanPct     float64
	MarketPctAtBet   float64
	ResolvedYes      bool
	Correct          bool
	VirtualPctEarned float64 // positive if correct, negative if wrong
	Reasoning        string  // Self-Correcting Prophet: why data failed when wrong
	SourceUsed       string  // Evolutionary Data: news | polymarket
	LayersUsed       string  // Omni-Source: comma-separated domains (code,science,finance)
}

// AuditClosedMarketAndReport audits the market and returns affected rows for Feedback Report.
func (e *ShadowEngine) AuditClosedMarketAndReport(marketID string, resolvedYes bool) ([]AuditResult, error) {
	rv := 0
	if resolvedYes {
		rv = 1
	}
	rows, err := e.db.Query(`
		SELECT event_id, event_name, market_question, leviathan_pct, market_pct, COALESCE(source_used, 'polymarket'), COALESCE(layers_used, '')
		FROM shadow_predictions
		WHERE market_id = ? AND closed_at IS NULL
	`, marketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var toUpdate []struct {
		eventID        string
		eventName      string
		marketQuestion string
		leviathanPct   float64
		marketPct      float64
		sourceUsed     string
		layersUsed     string
	}
	for rows.Next() {
		var eventID, eventName, marketQuestion, sourceUsed, layersUsed string
		var leviathanPct, marketPct float64
		if err := rows.Scan(&eventID, &eventName, &marketQuestion, &leviathanPct, &marketPct, &sourceUsed, &layersUsed); err != nil {
			continue
		}
		toUpdate = append(toUpdate, struct {
			eventID        string
			eventName      string
			marketQuestion string
			leviathanPct   float64
			marketPct      float64
			sourceUsed     string
			layersUsed     string
		}{eventID, eventName, marketQuestion, leviathanPct, marketPct, sourceUsed, layersUsed})
	}
	if len(toUpdate) == 0 {
		return nil, nil
	}
	for _, u := range toUpdate {
		correct := (u.leviathanPct >= 0.5 && resolvedYes) || (u.leviathanPct < 0.5 && !resolvedYes)
		if !correct {
			reasoning := inferReasoning(u.leviathanPct, u.marketPct, resolvedYes, u.eventName, u.marketQuestion)
			_, _ = e.db.Exec(`UPDATE shadow_predictions SET closed_at = CURRENT_TIMESTAMP, resolved_yes = ?, correct = 0, confidence_score = CASE WHEN confidence_score - 0.1 < 0.1 THEN 0.1 ELSE confidence_score - 0.1 END, reasoning = ? WHERE market_id = ? AND closed_at IS NULL AND event_id = ?`,
				rv, reasoning, marketID, u.eventID)
		} else {
			_, _ = e.db.Exec(`UPDATE shadow_predictions SET closed_at = CURRENT_TIMESTAMP, resolved_yes = ?, correct = 1, confidence_score = CASE WHEN confidence_score + 0.05 > 0.99 THEN 0.99 ELSE confidence_score + 0.05 END WHERE market_id = ? AND closed_at IS NULL AND event_id = ?`,
				rv, marketID, u.eventID)
		}
	}
	var results []AuditResult
	for _, u := range toUpdate {
		correct := (u.leviathanPct >= 0.5 && resolvedYes) || (u.leviathanPct < 0.5 && !resolvedYes)
		virtualPct := 0.0
		if correct {
			if resolvedYes {
				virtualPct = (1 - u.marketPct) * 100
			} else {
				virtualPct = u.marketPct * 100
			}
		} else {
			if resolvedYes {
				virtualPct = -(u.marketPct * 100)
			} else {
				virtualPct = -((1 - u.marketPct) * 100)
			}
		}
		reasoning := ""
		if !correct {
			reasoning = inferReasoning(u.leviathanPct, u.marketPct, resolvedYes, u.eventName, u.marketQuestion)
		}
		srcUsed := u.sourceUsed
		if srcUsed == "" {
			srcUsed = "polymarket"
		}
		results = append(results, AuditResult{
			MarketID:         marketID,
			EventName:        u.eventName,
			MarketQuestion:   u.marketQuestion,
			LeviathanPct:     u.leviathanPct,
			MarketPctAtBet:   u.marketPct,
			ResolvedYes:      resolvedYes,
			Correct:          correct,
			VirtualPctEarned: virtualPct,
			Reasoning:        reasoning,
			SourceUsed:       srcUsed,
			LayersUsed:       u.layersUsed,
		})
	}
	return results, nil
}

func (e *ShadowEngine) Close() error {
	if e.db != nil {
		return e.db.Close()
	}
	return nil
}

// CountLessons returns the number of lessons in long_term_lessons (Guardian Mode: Bank Vault status).
func (e *ShadowEngine) CountLessons() (int, error) {
	var n int
	err := e.db.QueryRow(`SELECT COUNT(*) FROM long_term_lessons`).Scan(&n)
	return n, err
}

// RunHiddenAudit — Living Leviathan: Continuous Self-Test. Audits all DB tables, returns summary for ticker.
func (e *ShadowEngine) RunHiddenAudit() string {
	var preds, lessons, facts int
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM shadow_predictions`).Scan(&preds)
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM long_term_lessons`).Scan(&lessons)
	_ = e.db.QueryRow(`SELECT COUNT(*) FROM fact_correlations`).Scan(&facts)
	iq := e.GetSystemIQ()
	return fmt.Sprintf("shadow_predictions=%d, long_term_lessons=%d, fact_correlations=%d, IQ=%.1f%%", preds, lessons, facts, iq)
}

// CountLessonsToday returns lessons created today (Omniscience 2.0: Synthetic IQ Reports).
func (e *ShadowEngine) CountLessonsToday() (int, error) {
	var n int
	err := e.db.QueryRow(`SELECT COUNT(*) FROM long_term_lessons WHERE date(created_at) = date('now', 'localtime')`).Scan(&n)
	return n, err
}

// GetSystemIQ returns aggregate accuracy as "IQ" 0-100 (Omniscience 2.0: Synthetic IQ Reports).
func (e *ShadowEngine) GetSystemIQ() float64 {
	var totalCorrect, totalCount int
	err := e.db.QueryRow(`SELECT COALESCE(SUM(correct_cnt), 0), COALESCE(SUM(total_cnt), 0) FROM sector_accuracy WHERE total_cnt >= 1`).Scan(&totalCorrect, &totalCount)
	if err != nil || totalCount < 1 {
		return 50
	}
	return float64(totalCorrect) / float64(totalCount) * 100
}

// inferReasoning generates Feedback Honesty note when prediction was wrong (High-Stakes Discovery heuristics).
// BTC fell + we predicted YES → Late sentiment shift. Politician withdrew → Black Swan event.
func inferReasoning(leviathanPct, marketPct float64, resolvedYes bool, eventName, marketQuestion string) string {
	text := strings.ToLower(eventName + " " + marketQuestion)
	predictedYes := leviathanPct >= 0.5

	// Crypto/BTC: we predicted YES and were wrong → Late sentiment shift (BTC fell)
	if predictedYes && (strings.Contains(text, "btc") || strings.Contains(text, "bitcoin") || strings.Contains(text, "crypto")) {
		return "Late sentiment shift"
	}
	// Politics: politician withdrew, election upset → Black Swan event
	if strings.Contains(text, "politician") || strings.Contains(text, "election") || strings.Contains(text, "president") ||
		strings.Contains(text, "candidate") || strings.Contains(text, "withdraw") {
		return "Black Swan event"
	}
	// High confidence + wrong → Black Swan
	conf := leviathanPct
	if leviathanPct < 0.5 {
		conf = 1 - leviathanPct
	}
	if conf >= 0.85 {
		return "Black Swan event"
	}
	if marketPct >= 0.45 && marketPct <= 0.55 {
		return "Late sentiment shift"
	}
	return "Unexpected market resolution"
}

func (e *ShadowEngine) LogShadowWithNotify(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic string) (int64, string, error) {
	return e.LogShadowWithNotifyAndSource(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, "")
}

func (e *ShadowEngine) LogShadowWithNotifyAndSource(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic, sourceUsed string) (int64, string, error) {
	return e.LogShadowWithNotifyAndSourceAndLayers(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, sourceUsed, "")
}

func (e *ShadowEngine) LogShadowWithNotifyAndSourceAndLayers(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic, sourceUsed, layersUsed string) (int64, string, error) {
	return e.LogShadowWithNotifyAndSourceAndLayersAndPredictedHours(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, sourceUsed, layersUsed, 0)
}

func (e *ShadowEngine) LogShadowWithNotifyAndSourceAndLayersAndPredictedHours(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic, sourceUsed, layersUsed string, predictedReactionHours float64) (int64, string, error) {
	id, err := e.LogShadowWithSourceAndLayersAndPredictedHours(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic, sourceUsed, layersUsed, predictedReactionHours)
	if err != nil {
		return 0, "", err
	}
	msg := fmt.Sprintf(
		"🔱 LEVIATHAN SUPREME INSIGHT\n\nMarket: %s\nDivergence: Market %.1f%% vs Leviathan %.1f%% (Alpha: +%.1f%%)\nContext: %s\nStatus: Logged in Shadow Engine (ID %d)",
		eventName, marketPct*100, leviathanPct*100, alphaPct, logic, id,
	)
	if predictedReactionHours > 0 {
		msg += fmt.Sprintf("\n⏱ Predicted reaction: %.0fh", predictedReactionHours)
	}
	log.Printf("[Leviathan] %s", msg)
	return id, msg, nil
}
