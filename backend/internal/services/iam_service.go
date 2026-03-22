package services

// ═══════════════════════════════════════════════════════════════
// IAM & RBAC SERVICE (awesome-iam)
// Source: https://github.com/kdeldycke/awesome-iam
//
// Features:
//   - Enterprise Roles (Admin, Developer, Analyst, Viewer)
//   - Team / Organization accounts (shared balance)
//   - API Key Scopes (read, trade, run_nodes)
// ═══════════════════════════════════════════════════════════════

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

type IAMRole string

const (
	RoleAdmin     IAMRole = "admin"
	RoleDeveloper IAMRole = "developer"
	RoleAnalyst   IAMRole = "analyst"
	RoleViewer    IAMRole = "viewer"
)

type IAMTeam struct {
	TeamID        string    `json:"team_id"`
	Name          string    `json:"name"`
	OwnerWallet   string    `json:"owner_wallet"`
	BillingWallet string    `json:"billing_wallet"`
	SpendingLimit float64   `json:"spending_limit_gstd"`
	CreatedAt     time.Time `json:"created_at"`
}

type IAMMember struct {
	WalletAddress string    `json:"wallet_address"`
	TeamID        string    `json:"team_id"`
	Role          IAMRole   `json:"role"`
	JoinedAt      time.Time `json:"joined_at"`
}

type IAMService struct {
	db *sql.DB
}

func NewIAMService(db *sql.DB) *IAMService {
	svc := &IAMService{db: db}
	svc.ensureSchema()
	return svc
}

func (s *IAMService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS iam_teams (
			team_id VARCHAR(64) PRIMARY KEY,
			name VARCHAR(128) NOT NULL,
			owner_wallet VARCHAR(128) NOT NULL,
			billing_wallet VARCHAR(128) NOT NULL,
			spending_limit_gstd DECIMAL(18,8) DEFAULT 0,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS iam_members (
			wallet_address VARCHAR(128) NOT NULL,
			team_id VARCHAR(64) REFERENCES iam_teams(team_id) ON DELETE CASCADE,
			role VARCHAR(32) DEFAULT 'viewer',
			joined_at TIMESTAMP DEFAULT NOW(),
			PRIMARY KEY (wallet_address, team_id)
		);
		CREATE INDEX IF NOT EXISTS idx_iam_members_team ON iam_members(team_id);
	`)
	log.Println("🔑 IAM & RBAC Service initialized (Enterprise Teams)")
}

// CreateTeam creates an enterprise team
func (s *IAMService) CreateTeam(ctx context.Context, ownerWallet, teamName string) (*IAMTeam, error) {
	if s.db == nil {
		return nil, fmt.Errorf("db not available")
	}

	teamID := fmt.Sprintf("team_%x", time.Now().UnixNano())

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO iam_teams (team_id, name, owner_wallet, billing_wallet)
		VALUES ($1, $2, $3, $4)
	`, teamID, teamName, ownerWallet, ownerWallet)
	if err != nil {
		return nil, err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO iam_members (wallet_address, team_id, role)
		VALUES ($1, $2, $3)
	`, ownerWallet, teamID, RoleAdmin)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &IAMTeam{
		TeamID:        teamID,
		Name:          teamName,
		OwnerWallet:   ownerWallet,
		BillingWallet: ownerWallet,
		CreatedAt:     time.Now(),
	}, nil
}

// AddMember adds a user to a team
func (s *IAMService) AddMember(ctx context.Context, actorWallet, targetWallet, teamID string, role IAMRole) error {
	if s.db == nil {
		return fmt.Errorf("db not available")
	}

	// Verify actor is Admin
	var actorRole string
	err := s.db.QueryRowContext(ctx, `SELECT role FROM iam_members WHERE wallet_address = $1 AND team_id = $2`, actorWallet, teamID).Scan(&actorRole)
	if err != nil || actorRole != string(RoleAdmin) {
		return fmt.Errorf("permission denied: only admin can add members")
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO iam_members (wallet_address, team_id, role)
		VALUES ($1, $2, $3) ON CONFLICT (wallet_address, team_id) DO UPDATE SET role = EXCLUDED.role
	`, targetWallet, teamID, string(role))

	return err
}

// CheckPermission checks if a wallet has the required role or higher
func (s *IAMService) CheckPermission(ctx context.Context, wallet, teamID string, requiredRole IAMRole) bool {
	if s.db == nil {
		return false
	}

	var currentRole string
	err := s.db.QueryRowContext(ctx, `SELECT role FROM iam_members WHERE wallet_address = $1 AND team_id = $2`, wallet, teamID).Scan(&currentRole)
	if err != nil {
		return false
	}

	// Simple hierarchy tree
	hierarchy := map[IAMRole]int{
		RoleAdmin:     100,
		RoleDeveloper: 50,
		RoleAnalyst:   30,
		RoleViewer:    10,
	}

	return hierarchy[IAMRole(currentRole)] >= hierarchy[requiredRole]
}
