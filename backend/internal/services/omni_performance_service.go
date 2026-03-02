package services

import (
	"context"
	"database/sql"
	"log"
	"strings"
)

// OmniPerformanceService implements GSTD Staking Gate and Ultra-Inference for Omni-Performance protocol.
// Ultra models (70B, DeepSeek-R1) require 100 GSTD staked OR 1 GSTD per session.
const (
	UltraStakingThresholdGSTD = 100
	UltraSessionCostGSTD      = 1.0
)

var ultraModels = map[string]bool{
	"llama3.3:70b":      true,
	"llama3.1:70b":      true,
	"qwen2.5-coder:32b": true,
	"deepseek-r1":       true,
	"deepseek-r1:70b":   true,
}

// OmniPerformanceService handles Ultra-Inference access control
type OmniPerformanceService struct {
	db *sql.DB
}

// NewOmniPerformanceService creates the service
func NewOmniPerformanceService(db *sql.DB) *OmniPerformanceService {
	return &OmniPerformanceService{db: db}
}

// IsUltraModel returns true if model requires Ultra access (GSTD gate)
func IsUltraModel(model string) bool {
	if model == "" {
		return false
	}
	model = strings.ToLower(strings.TrimSpace(model))
	return ultraModels[model] || strings.Contains(model, "70b") || strings.Contains(model, "deepseek-r1")
}

// UltraAccessResult describes whether user can access Ultra inference
type UltraAccessResult struct {
	Allowed      bool    `json:"allowed"`
	Mode         string  `json:"mode"` // "standard" or "ultra"
	StakedGSTD   float64 `json:"staked_gstd"`
	BalanceGSTD  float64 `json:"balance_gstd"`
	SessionCost  float64 `json:"session_cost"`
	Message      string  `json:"message"`
	RequiresGate bool    `json:"requires_gate"`
}

// CheckUltraAccess verifies if wallet can use Ultra models.
// Requires: 100 GSTD in gstd_frozen (staking) OR 1 GSTD available for one-time session.
func (s *OmniPerformanceService) CheckUltraAccess(ctx context.Context, wallet string) (*UltraAccessResult, error) {
	res := &UltraAccessResult{
		Mode:         "standard",
		SessionCost:  UltraSessionCostGSTD,
		RequiresGate: true,
	}
	if wallet == "" {
		res.Allowed = false
		res.Message = "Connect wallet for Ultra (Hive Memory) access"
		return res, nil
	}

	var balance, frozen float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(gstd_balance, 0), COALESCE(gstd_frozen, 0)
		FROM users WHERE wallet_address = $1
	`, wallet).Scan(&balance, &frozen)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	res.BalanceGSTD = balance
	res.StakedGSTD = frozen

	// Gate: 100 GSTD staked OR 1 GSTD for session
	if frozen >= UltraStakingThresholdGSTD {
		res.Allowed = true
		res.Mode = "ultra"
		res.Message = "Ultra access via GSTD staking"
		return res, nil
	}
	if balance >= UltraSessionCostGSTD {
		res.Allowed = true
		res.Mode = "ultra"
		res.Message = "Ultra access via session payment (1 GSTD)"
		return res, nil
	}

	res.Allowed = false
	res.Message = "Ultra requires 100 GSTD staked or 1 GSTD per session. Activate GSTD access for expert response."
	return res, nil
}

// DeductUltraSession deducts 1 GSTD for one-time Ultra session (when not staked)
func (s *OmniPerformanceService) DeductUltraSession(ctx context.Context, wallet string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET gstd_balance = gstd_balance - $1
		WHERE wallet_address = $2 AND COALESCE(gstd_frozen, 0) < $3 AND gstd_balance >= $1
	`, UltraSessionCostGSTD, wallet, UltraStakingThresholdGSTD)
	if err != nil {
		log.Printf("OmniPerformance: DeductUltraSession failed: %v", err)
		return err
	}
	return nil
}
