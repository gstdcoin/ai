package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// WelcomeBonusService handles automatic token distribution for new users
type WelcomeBonusService struct {
	db             *sql.DB
	treasuryWallet string
	welcomeAmount  float64
	dailyFaucet    float64
	agentBootstrap float64
}

// WelcomeBonusConfig configuration for bonus system
type WelcomeBonusConfig struct {
	TreasuryWallet string
	WelcomeAmount  float64 // Default: 1.0 GSTD
	DailyFaucet    float64 // Default: 0.1 GSTD
	AgentBootstrap float64 // Default: 0.5 GSTD
}

// NewWelcomeBonusService creates a new welcome bonus service
func NewWelcomeBonusService(db *sql.DB, config *WelcomeBonusConfig) *WelcomeBonusService {
	if config == nil {
		config = &WelcomeBonusConfig{
			TreasuryWallet: "EQC_TREASURY_WALLET_ADDRESS",
			WelcomeAmount:  1.0,
			DailyFaucet:    0.1,
			AgentBootstrap: 10.0, // Vampire Attack Grant
		}
	}

	return &WelcomeBonusService{
		db:             db,
		treasuryWallet: config.TreasuryWallet,
		welcomeAmount:  config.WelcomeAmount,
		dailyFaucet:    config.DailyFaucet,
		agentBootstrap: config.AgentBootstrap,
	}
}

// ClaimWelcomeBonus gives new users their welcome bonus (1.0 GSTD)
func (s *WelcomeBonusService) ClaimWelcomeBonus(ctx context.Context, walletAddress string, source string) (*BonusResult, error) {
	// Check if already claimed
	var claimed bool
	err := s.db.QueryRowContext(ctx,
		"SELECT welcome_bonus_claimed FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&claimed)

	if err == sql.ErrNoRows {
		// New user - create account and give bonus
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO users (wallet_address, gstd_balance, welcome_bonus_claimed, created_at, source)
			VALUES ($1, $2, true, NOW(), $3)
			ON CONFLICT (wallet_address) DO UPDATE SET
				gstd_balance = users.gstd_balance + $2,
				welcome_bonus_claimed = true
		`, walletAddress, s.welcomeAmount, source)

		if err != nil {
			return nil, fmt.Errorf("failed to create user: %w", err)
		}

		// Log the bonus
		s.logBonusTransaction(ctx, walletAddress, "welcome_bonus", s.welcomeAmount, source)

		return &BonusResult{
			Success:    true,
			Amount:     s.welcomeAmount,
			BonusType:  "welcome_bonus",
			Message:    "🎉 Welcome to GSTD! You received 1.0 GSTD as a welcome bonus!",
			NewBalance: s.welcomeAmount,
		}, nil
	}

	if err != nil {
		return nil, err
	}

	if claimed {
		return &BonusResult{
			Success:   false,
			BonusType: "welcome_bonus",
			Message:   "Welcome bonus already claimed",
		}, nil
	}

	// Existing user who hasn't claimed
	result, err := s.db.ExecContext(ctx, `
		UPDATE users SET 
			gstd_balance = COALESCE(gstd_balance, 0) + $1,
			welcome_bonus_claimed = true
		WHERE wallet_address = $2 AND welcome_bonus_claimed = false
	`, s.welcomeAmount, walletAddress)

	if err != nil {
		return nil, err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return &BonusResult{
			Success:   false,
			BonusType: "welcome_bonus",
			Message:   "Bonus already claimed or user not found",
		}, nil
	}

	s.logBonusTransaction(ctx, walletAddress, "welcome_bonus", s.welcomeAmount, source)

	// Get new balance
	var newBalance float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1", walletAddress).Scan(&newBalance)

	return &BonusResult{
		Success:    true,
		Amount:     s.welcomeAmount,
		BonusType:  "welcome_bonus",
		Message:    "🎉 Welcome to GSTD! You received 1.0 GSTD!",
		NewBalance: newBalance,
	}, nil
}

// ClaimDailyFaucet gives users daily faucet (0.1 GSTD every 24h)
func (s *WelcomeBonusService) ClaimDailyFaucet(ctx context.Context, walletAddress string) (*BonusResult, error) {
	// Check last claim time
	var lastClaim sql.NullTime
	err := s.db.QueryRowContext(ctx,
		"SELECT last_faucet_claim FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&lastClaim)

	if err == sql.ErrNoRows {
		return &BonusResult{
			Success: false,
			Message: "Please connect your wallet first",
		}, nil
	}

	if err != nil {
		return nil, err
	}

	// Check 24h cooldown
	if lastClaim.Valid {
		hoursSinceClaim := time.Since(lastClaim.Time).Hours()
		if hoursSinceClaim < 24 {
			hoursRemaining := 24 - hoursSinceClaim
			return &BonusResult{
				Success:       false,
				BonusType:     "daily_faucet",
				Message:       fmt.Sprintf("⏰ Next faucet available in %.1f hours", hoursRemaining),
				CooldownHours: hoursRemaining,
			}, nil
		}
	}

	// Give faucet
	result, err := s.db.ExecContext(ctx, `
		UPDATE users SET 
			gstd_balance = COALESCE(gstd_balance, 0) + $1,
			last_faucet_claim = NOW()
		WHERE wallet_address = $2
	`, s.dailyFaucet, walletAddress)

	if err != nil {
		return nil, err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return &BonusResult{
			Success: false,
			Message: "User not found",
		}, nil
	}

	s.logBonusTransaction(ctx, walletAddress, "daily_faucet", s.dailyFaucet, "faucet")

	var newBalance float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1", walletAddress).Scan(&newBalance)

	return &BonusResult{
		Success:    true,
		Amount:     s.dailyFaucet,
		BonusType:  "daily_faucet",
		Message:    fmt.Sprintf("💧 Received %.2f GSTD from daily faucet!", s.dailyFaucet),
		NewBalance: newBalance,
	}, nil
}

// BootstrapAgent gives new agents initial tokens (0.5 GSTD)
func (s *WelcomeBonusService) BootstrapAgent(ctx context.Context, walletAddress string, agentName string, capabilities []string) (*BonusResult, error) {
	// Check if already bootstrapped as agent
	var bootstrapped bool
	err := s.db.QueryRowContext(ctx,
		"SELECT agent_bootstrapped FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&bootstrapped)

	if err == sql.ErrNoRows {
		// New agent - create user and give bootstrap
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO users (wallet_address, gstd_balance, agent_bootstrapped, agent_name, created_at, source)
			VALUES ($1, $2, true, $3, NOW(), 'agent')
			ON CONFLICT (wallet_address) DO UPDATE SET
				gstd_balance = COALESCE(users.gstd_balance, 0) + $2,
				agent_bootstrapped = true,
				agent_name = COALESCE(users.agent_name, $3)
			WHERE users.agent_bootstrapped = false OR users.agent_bootstrapped IS NULL
		`, walletAddress, s.agentBootstrap, agentName)

		if err != nil {
			return nil, fmt.Errorf("failed to bootstrap agent: %w", err)
		}

		s.logBonusTransaction(ctx, walletAddress, "agent_bootstrap", s.agentBootstrap, "agent_sdk")

		return &BonusResult{
			Success:   true,
			Amount:    s.agentBootstrap,
			BonusType: "agent_bootstrap",
			Message:   fmt.Sprintf("🤖 Agent '%s' bootstrapped with %.2f GSTD!", agentName, s.agentBootstrap),
		}, nil
	}

	if err != nil {
		return nil, err
	}

	if bootstrapped {
		return &BonusResult{
			Success:   false,
			BonusType: "agent_bootstrap",
			Message:   "Agent already bootstrapped",
		}, nil
	}

	// Existing user, first time as agent
	result, err := s.db.ExecContext(ctx, `
		UPDATE users SET 
			gstd_balance = COALESCE(gstd_balance, 0) + $1,
			agent_bootstrapped = true,
			agent_name = COALESCE(agent_name, $2)
		WHERE wallet_address = $3 AND (agent_bootstrapped = false OR agent_bootstrapped IS NULL)
	`, s.agentBootstrap, agentName, walletAddress)

	if err != nil {
		return nil, err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return &BonusResult{
			Success:   false,
			BonusType: "agent_bootstrap",
			Message:   "Already bootstrapped",
		}, nil
	}

	s.logBonusTransaction(ctx, walletAddress, "agent_bootstrap", s.agentBootstrap, "agent_sdk")

	return &BonusResult{
		Success:   true,
		Amount:    s.agentBootstrap,
		BonusType: "agent_bootstrap",
		Message:   fmt.Sprintf("🤖 Agent '%s' ready! Received %.2f GSTD", agentName, s.agentBootstrap),
	}, nil
}

// ReferralSignupBonus gives bonus when referred user signs up
func (s *WelcomeBonusService) ReferralSignupBonus(ctx context.Context, referrerWallet string, newUserWallet string) (*BonusResult, error) {
	bonusAmount := 1.0 // 1 GSTD per referral signup

	// Update referrer balance
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1
		WHERE wallet_address = $2
	`, bonusAmount, referrerWallet)

	if err != nil {
		return nil, err
	}

	s.logBonusTransaction(ctx, referrerWallet, "referral_signup", bonusAmount, newUserWallet)

	return &BonusResult{
		Success:   true,
		Amount:    bonusAmount,
		BonusType: "referral_signup",
		Message:   fmt.Sprintf("🎁 Referral bonus: +%.1f GSTD for new user signup!", bonusAmount),
	}, nil
}

// GetBonusStatus returns current bonus status for a user
func (s *WelcomeBonusService) GetBonusStatus(ctx context.Context, walletAddress string) (*BonusStatus, error) {
	status := &BonusStatus{}

	var welcomeClaimed bool
	var agentBootstrapped sql.NullBool
	var lastFaucet sql.NullTime
	var balance float64

	err := s.db.QueryRowContext(ctx, `
		SELECT 
			COALESCE(welcome_bonus_claimed, false),
			agent_bootstrapped,
			last_faucet_claim,
			COALESCE(gstd_balance, 0)
		FROM users WHERE wallet_address = $1
	`, walletAddress).Scan(&welcomeClaimed, &agentBootstrapped, &lastFaucet, &balance)

	if err == sql.ErrNoRows {
		// New user
		return &BonusStatus{
			WelcomeBonusAvailable:   true,
			DailyFaucetAvailable:    false, // Must register first
			AgentBootstrapAvailable: true,
			CurrentBalance:          0,
		}, nil
	}

	if err != nil {
		return nil, err
	}

	status.WelcomeBonusClaimed = welcomeClaimed
	status.WelcomeBonusAvailable = !welcomeClaimed
	status.AgentBootstrapped = agentBootstrapped.Valid && agentBootstrapped.Bool
	status.AgentBootstrapAvailable = !status.AgentBootstrapped
	status.CurrentBalance = balance

	// Check faucet availability
	if lastFaucet.Valid {
		hoursSinceClaim := time.Since(lastFaucet.Time).Hours()
		status.DailyFaucetAvailable = hoursSinceClaim >= 24
		if !status.DailyFaucetAvailable {
			status.FaucetCooldownHours = 24 - hoursSinceClaim
		}
	} else {
		status.DailyFaucetAvailable = true
	}

	return status, nil
}

// logBonusTransaction logs bonus transactions for audit
func (s *WelcomeBonusService) logBonusTransaction(ctx context.Context, wallet, bonusType string, amount float64, source string) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO bonus_transactions (wallet_address, bonus_type, amount, source, created_at)
		VALUES ($1, $2, $3, $4, NOW())
	`, wallet, bonusType, amount, source)

	if err != nil {
		log.Printf("⚠️  Failed to log bonus transaction: %v", err)
	}
}

// BonusResult represents the result of a bonus claim
type BonusResult struct {
	Success       bool    `json:"success"`
	Amount        float64 `json:"amount,omitempty"`
	BonusType     string  `json:"bonus_type"`
	Message       string  `json:"message"`
	NewBalance    float64 `json:"new_balance,omitempty"`
	CooldownHours float64 `json:"cooldown_hours,omitempty"`
}

// BonusStatus represents current bonus availability
type BonusStatus struct {
	WelcomeBonusAvailable   bool    `json:"welcome_bonus_available"`
	WelcomeBonusClaimed     bool    `json:"welcome_bonus_claimed"`
	DailyFaucetAvailable    bool    `json:"daily_faucet_available"`
	FaucetCooldownHours     float64 `json:"faucet_cooldown_hours,omitempty"`
	AgentBootstrapAvailable bool    `json:"agent_bootstrap_available"`
	AgentBootstrapped       bool    `json:"agent_bootstrapped"`
	CurrentBalance          float64 `json:"current_balance"`
}
