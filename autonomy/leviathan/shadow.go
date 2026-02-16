package leviathan

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// ShadowRecord represents a virtual prediction (no real money).
type ShadowRecord struct {
	ID           int64
	EventID      string
	MarketID     string
	EventName    string
	MarketQuestion string
	LeviathanPct float64
	MarketPct    float64
	AlphaPct     float64
	Logic        string
	CreatedAt    time.Time
	ClosedAt     *time.Time
	ResolvedYes  *bool
	Correct      *bool
	ConfidenceScore float64
}

// ShadowEngine stores and audits virtual predictions in SQLite.
type ShadowEngine struct {
	db   *sql.DB
	path string
}

// NewShadowEngine opens or creates SQLite DB.
func NewShadowEngine(path string) (*ShadowEngine, error) {
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
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
			confidence_score REAL DEFAULT 0.5
		);
		CREATE INDEX IF NOT EXISTS idx_shadow_event ON shadow_predictions(event_id);
		CREATE INDEX IF NOT EXISTS idx_shadow_market ON shadow_predictions(market_id);
		CREATE INDEX IF NOT EXISTS idx_shadow_closed ON shadow_predictions(closed_at);
	`)
	return err
}

// LogShadow records a virtual prediction. No real money.
func (e *ShadowEngine) LogShadow(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic string) (int64, error) {
	res, err := e.db.Exec(`
		INSERT INTO shadow_predictions (event_id, market_id, event_name, market_question, leviathan_pct, market_pct, alpha_pct, logic)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// AuditClosedMarket: when market closes, update resolved_yes and correct. Run post-mortem if wrong.
func (e *ShadowEngine) AuditClosedMarket(marketID string, resolvedYes bool) error {
	_, err := e.db.Exec(`
		UPDATE shadow_predictions
		SET closed_at = CURRENT_TIMESTAMP,
		    resolved_yes = ?,
		    correct = CASE WHEN (leviathan_pct >= 0.5 AND ? = 1) OR (leviathan_pct < 0.5 AND ? = 0) THEN 1 ELSE 0 END,
		    confidence_score = CASE
		        WHEN (leviathan_pct >= 0.5 AND ? = 1) OR (leviathan_pct < 0.5 AND ? = 0)
		        THEN MIN(0.99, confidence_score + 0.05)
		        ELSE MAX(0.1, confidence_score - 0.1)
		    END
		WHERE market_id = ? AND closed_at IS NULL
	`, boolToInt(resolvedYes), boolToInt(resolvedYes), boolToInt(resolvedYes), boolToInt(resolvedYes), boolToInt(resolvedYes), marketID)
	return err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// GetConfidenceScore returns average confidence for Leviathan.
func (e *ShadowEngine) GetConfidenceScore() (float64, error) {
	var score sql.NullFloat64
	err := e.db.QueryRow(`SELECT AVG(confidence_score) FROM shadow_predictions WHERE closed_at IS NOT NULL`).Scan(&score)
	if err != nil || !score.Valid {
		return 0.5, nil
	}
	return score.Float64, nil
}

// PendingAudits returns market IDs we predicted but not yet audited.
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

// Close closes the DB.
func (e *ShadowEngine) Close() error {
	if e.db != nil {
		return e.db.Close()
	}
	return nil
}

// LogShadowWithNotify is a helper that logs and returns formatted message.
func (e *ShadowEngine) LogShadowWithNotify(eventID, marketID, eventName, marketQuestion string, leviathanPct, marketPct, alphaPct float64, logic string) (int64, string, error) {
	id, err := e.LogShadow(eventID, marketID, eventName, marketQuestion, leviathanPct, marketPct, alphaPct, logic)
	if err != nil {
		return 0, "", err
	}
	msg := fmt.Sprintf(
		"🔱 LEVIATHAN SUPREME INSIGHT\n\nMarket: %s\nDivergence: Market %.1f%% vs Leviathan %.1f%% (Alpha: +%.1f%%)\nContext: %s\nStatus: Logged in Shadow Engine (ID %d)",
		eventName, marketPct*100, leviathanPct*100, alphaPct, logic, id,
	)
	log.Printf("[Leviathan] %s", msg)
	return id, msg, nil
}
