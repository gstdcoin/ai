package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"
)

// Decentralized Governance: Monthly "Mesh Constitution" report —
// dominant models, golden reserve change.

const constitutionInterval = 24 * 30 * time.Hour // ~monthly

// MeshConstitutionService generates monthly governance reports
type MeshConstitutionService struct {
	db     *sql.DB
	anchor *ConstitutionAnchorService
}

// NewMeshConstitutionService creates the service
func NewMeshConstitutionService(db *sql.DB) *MeshConstitutionService {
	s := &MeshConstitutionService{db: db}
	s.ensureSchema()
	return s
}

// SetAnchor injects Immortal Identity anchor service
func (s *MeshConstitutionService) SetAnchor(a *ConstitutionAnchorService) {
	s.anchor = a
}

func (s *MeshConstitutionService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, _ = s.db.Exec(`
		CREATE TABLE IF NOT EXISTS mesh_constitution (
			id SERIAL PRIMARY KEY,
			report_month VARCHAR(7) NOT NULL,
			dominant_models JSONB NOT NULL DEFAULT '[]',
			golden_reserve_start DECIMAL(18,8) DEFAULT 0,
			golden_reserve_end DECIMAL(18,8) DEFAULT 0,
			reserve_change_pct DECIMAL(8,4) DEFAULT 0,
			constitution_hash VARCHAR(64),
			blockchain_tx_hash VARCHAR(128),
			anchored_chain VARCHAR(16),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_mesh_constitution_month ON mesh_constitution(report_month);
	`)
	_, _ = s.db.Exec(`ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS constitution_hash VARCHAR(64)`)
	_, _ = s.db.Exec(`ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(128)`)
	_, _ = s.db.Exec(`ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS anchored_chain VARCHAR(16)`)
}

// DominantModelEntry in the constitution report
type DominantModelEntry struct {
	ModelID   string  `json:"model_id"`
	Category  string  `json:"category"`
	Score     float64 `json:"capability_score"`
	Rank      int     `json:"rank"`
	Requests  int64   `json:"request_count"`
}

// MeshConstitutionReport is the monthly governance report
type MeshConstitutionReport struct {
	ReportMonth        string              `json:"report_month"`
	DominantModels     []DominantModelEntry `json:"dominant_models"`
	GoldenReserveStart float64             `json:"golden_reserve_start"`
	GoldenReserveEnd   float64             `json:"golden_reserve_end"`
	ReserveChangePct   float64             `json:"reserve_change_pct"`
	ConstitutionHash   string              `json:"constitution_hash,omitempty"`   // Immortal Identity
	BlockchainTxHash   string              `json:"blockchain_tx_hash,omitempty"`   // TON/Solana anchor
	AnchoredChain      string              `json:"anchored_chain,omitempty"`
	CreatedAt          time.Time           `json:"created_at"`
}

// Start runs the monthly constitution generation loop
func (s *MeshConstitutionService) Start(ctx context.Context) {
	if s.db == nil {
		return
	}
	log.Printf("[Mesh Constitution] Decentralized Governance ACTIVE — monthly report")
	ticker := time.NewTicker(constitutionInterval)
	defer ticker.Stop()
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Minute):
		s.generate(ctx)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.generate(ctx)
		}
	}
}

func (s *MeshConstitutionService) generate(ctx context.Context) {
	now := time.Now()
	month := now.Format("2006-01")
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	// Check if already generated for this month
	var exists int
	_ = s.db.QueryRowContext(ctx, `SELECT 1 FROM mesh_constitution WHERE report_month = $1`, month).Scan(&exists)
	if exists > 0 {
		return
	}

	// Golden reserve at start and end of month
	var reserveStart, reserveEnd float64
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE timestamp < $1 AND xaut_amount IS NOT NULL`, startOfMonth).Scan(&reserveStart)
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE xaut_amount IS NOT NULL`).Scan(&reserveEnd)

	reserveChangePct := 0.0
	if reserveStart > 0 {
		reserveChangePct = ((reserveEnd - reserveStart) / reserveStart) * 100
	}

	// Dominant models: top by rank and capability_score
	rows, err := s.db.QueryContext(ctx, `
		SELECT model_id, COALESCE(category, 'general'), capability_score, rank
		FROM universal_mesh_routing
		ORDER BY rank ASC, capability_score DESC
		LIMIT 20
	`)
	if err != nil {
		log.Printf("[Mesh Constitution] Query error: %v", err)
		return
	}
	defer rows.Close()

	var dominant []DominantModelEntry
	for rows.Next() {
		var e DominantModelEntry
		if err := rows.Scan(&e.ModelID, &e.Category, &e.Score, &e.Rank); err != nil {
			continue
		}
		dominant = append(dominant, e)
	}

	domJSON, _ := json.Marshal(dominant)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO mesh_constitution (report_month, dominant_models, golden_reserve_start, golden_reserve_end, reserve_change_pct, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (report_month) DO NOTHING
	`, month, domJSON, reserveStart, reserveEnd, reserveChangePct)
	if err != nil {
		log.Printf("[Mesh Constitution] Insert error: %v", err)
		return
	}

	// Immortal Identity: hash-signature for blockchain anchoring
	report := &MeshConstitutionReport{
		ReportMonth:        month,
		DominantModels:     dominant,
		GoldenReserveStart: reserveStart,
		GoldenReserveEnd:   reserveEnd,
		ReserveChangePct:   reserveChangePct,
		CreatedAt:          time.Now(),
	}
	if s.anchor != nil {
		s.anchor.AnchorReport(ctx, report)
	}

	log.Printf("[Mesh Constitution] %s: %d dominant models, reserve %.4f→%.4f XAUt (%.2f%%)",
		month, len(dominant), reserveStart, reserveEnd, reserveChangePct)
}

// GetLatestReport returns the most recent constitution report
func (s *MeshConstitutionService) GetLatestReport(ctx context.Context) (*MeshConstitutionReport, error) {
	if s.db == nil {
		return nil, nil
	}
	var month string
	var domJSON []byte
	var reserveStart, reserveEnd, changePct float64
	var constitutionHash, txHash, anchoredChain sql.NullString
	var createdAt time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT report_month, dominant_models, golden_reserve_start, golden_reserve_end, reserve_change_pct,
		       constitution_hash, blockchain_tx_hash, anchored_chain, created_at
		FROM mesh_constitution ORDER BY created_at DESC LIMIT 1
	`).Scan(&month, &domJSON, &reserveStart, &reserveEnd, &changePct, &constitutionHash, &txHash, &anchoredChain, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var dominant []DominantModelEntry
	_ = json.Unmarshal(domJSON, &dominant)
	r := &MeshConstitutionReport{
		ReportMonth:        month,
		DominantModels:     dominant,
		GoldenReserveStart: reserveStart,
		GoldenReserveEnd:   reserveEnd,
		ReserveChangePct:   changePct,
		CreatedAt:          createdAt,
	}
	if constitutionHash.Valid {
		r.ConstitutionHash = constitutionHash.String
	}
	if txHash.Valid {
		r.BlockchainTxHash = txHash.String
	}
	if anchoredChain.Valid {
		r.AnchoredChain = anchoredChain.String
	}
	return r, nil
}
