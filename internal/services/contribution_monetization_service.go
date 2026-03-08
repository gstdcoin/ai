package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// ContributionMonetizationService tracks compute contributions and calculates XAUt share.
// Each node (PC, server, phone) receives a share of XAUt proportional to its contribution.
// A2A Symbio: referrers get 1% of referred node's compute_units as bonus.
type ContributionMonetizationService struct {
	db          *sql.DB
	poolMonitor *PoolMonitorService
	referral    *ReferralService // optional: for compute referral bonus
}

// ContributionRecord represents a single compute contribution
type ContributionRecord struct {
	NodeID       string  `json:"node_id"`
	WalletAddr   string  `json:"wallet_address"`
	Platform     string  `json:"platform"` // mobile, desktop, server
	ComputeUnits float64 `json:"compute_units"`
	TaskID       string  `json:"task_id"`
	Model        string  `json:"model"`
}

// XAUtShare represents a node's share of XAUt for an epoch
type XAUtShare struct {
	WalletAddr   string  `json:"wallet_address"`
	Platform     string  `json:"platform"`
	ComputeUnits float64 `json:"compute_units"`
	SharePct     float64 `json:"share_pct"`
	XAUtAmount   float64 `json:"xaut_amount"`
	EpochEnd     string  `json:"epoch_end"`
}

// NewContributionMonetizationService creates the service
func NewContributionMonetizationService(db *sql.DB, poolMonitor *PoolMonitorService, referral *ReferralService) *ContributionMonetizationService {
	svc := &ContributionMonetizationService{db: db, poolMonitor: poolMonitor, referral: referral}
	svc.ensureSchema()
	return svc
}

func (s *ContributionMonetizationService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS compute_contributions (
			id SERIAL PRIMARY KEY,
			node_id VARCHAR(128) NOT NULL,
			wallet_address VARCHAR(128),
			platform VARCHAR(16) NOT NULL,
			compute_units DECIMAL(18,6) NOT NULL,
			task_id VARCHAR(64),
			model VARCHAR(64),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_compute_contributions_wallet ON compute_contributions(wallet_address);
		CREATE INDEX IF NOT EXISTS idx_compute_contributions_platform ON compute_contributions(platform);
		CREATE INDEX IF NOT EXISTS idx_compute_contributions_created ON compute_contributions(created_at);
	`)
	if err != nil {
		log.Printf("⚠️ compute_contributions schema: %v", err)
		return
	}
	log.Printf("📊 Contribution Monetization schema ensured")
}

// Record stores a compute contribution for XAUt share calculation
func (s *ContributionMonetizationService) Record(ctx context.Context, r *ContributionRecord) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO compute_contributions (node_id, wallet_address, platform, compute_units, task_id, model)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, r.NodeID, nullIfEmpty(r.WalletAddr), r.Platform, r.ComputeUnits, nullIfEmpty(r.TaskID), nullIfEmpty(r.Model))
	if err != nil {
		return err
	}
	// A2A Symbio: 1% of compute_units to referrer when a referred node contributes
	if s.referral != nil && r.WalletAddr != "" && r.ComputeUnits > 0 {
		_ = s.referral.ProcessComputeReferralBonus(ctx, r.WalletAddr, r.NodeID, r.ComputeUnits)
	}
	return nil
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// GetSharesForEpoch returns XAUt shares for the given epoch (last 24h or 7d)
func (s *ContributionMonetizationService) GetSharesForEpoch(ctx context.Context, epochHours int) ([]XAUtShare, float64, error) {
	if s.db == nil {
		return nil, 0, nil
	}

	since := time.Now().Add(-time.Duration(epochHours) * time.Hour)

	var total float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(compute_units), 0) FROM compute_contributions WHERE created_at >= $1
	`, since).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(wallet_address, node_id) as wallet, platform, SUM(compute_units) as units
		FROM compute_contributions
		WHERE created_at >= $1
		GROUP BY COALESCE(wallet_address, node_id), platform
	`, since)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var shares []XAUtShare
	for rows.Next() {
		var w, p string
		var u float64
		if err := rows.Scan(&w, &p, &u); err != nil {
			continue
		}
		sharePct := 0.0
		if total > 0 {
			sharePct = (u / total) * 100
		}
		shares = append(shares, XAUtShare{
			WalletAddr:   w,
			Platform:     p,
			ComputeUnits: u,
			SharePct:     sharePct,
			EpochEnd:     time.Now().Format(time.RFC3339),
		})
	}

	return shares, total, nil
}

// GetXAUtPrice returns current XAUt price in USD (for share valuation)
func (s *ContributionMonetizationService) GetXAUtPriceUSD() float64 {
	if s.poolMonitor != nil {
		return s.poolMonitor.GetXAUtPriceUSD()
	}
	return 2350.0
}
