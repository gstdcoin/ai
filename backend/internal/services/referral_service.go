package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

type ReferralService struct {
	db *sql.DB
}

func NewReferralService(db *sql.DB) *ReferralService {
	return &ReferralService{db: db}
}

type ReferralStats struct {
	ReferralCode   string  `json:"referral_code"`
	TotalReferred  int     `json:"total_referred"`
	TotalEarned    float64 `json:"total_earned"`
	PendingRewards float64 `json:"pending_rewards"`
}

// GetUserStats returns referral statistics for a user
func (s *ReferralService) GetUserStats(ctx context.Context, walletAddress string) (*ReferralStats, error) {
	stats := &ReferralStats{}

	// Get referral code
	err := s.db.QueryRowContext(ctx, "SELECT referral_code FROM users WHERE wallet_address = $1", walletAddress).Scan(&stats.ReferralCode)
	if err != nil {
		if err == sql.ErrNoRows {
			// Generate if missing (lazy generation)
			// This relies on the DB trigger or explicit update if trigger didn't fire for old users
			// For now, let's assume it exists or return empty
			return stats, nil
		}
		return nil, err
	}

	// Get total referred users
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE referred_by = $1", walletAddress).Scan(&stats.TotalReferred)
	if err != nil {
		log.Printf("Error counting referrals: %v", err)
		stats.TotalReferred = 0
	}

	// Get total earned (paid)
	err = s.db.QueryRowContext(ctx, 
		"SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards WHERE referrer_address = $1 AND status = 'paid'", 
		walletAddress).Scan(&stats.TotalEarned)
	if err != nil {
		log.Printf("Error summing earned rewards: %v", err)
	}

	// Get pending rewards
	err = s.db.QueryRowContext(ctx, 
		"SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards WHERE referrer_address = $1 AND status = 'pending'", 
		walletAddress).Scan(&stats.PendingRewards)
	if err != nil {
		log.Printf("Error summing pending rewards: %v", err)
	}

	return stats, nil
}

// ProcessReferralReward calculates and records a referral reward when a task is completed/paid
// This should be called from PaymentTracker or wherever tasks are finalized
func (s *ReferralService) ProcessReferralReward(ctx context.Context, workerAddress string, taskID string, platformFeeGSTD float64) error {
	// 5% of platform fee goes to referrer
	if platformFeeGSTD <= 0 {
		return nil
	}

	// Find referrer
	var referrerAddress string
	err := s.db.QueryRowContext(ctx, "SELECT referred_by FROM users WHERE wallet_address = $1", workerAddress).Scan(&referrerAddress)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil // No referrer
		}
		return err
	}
	
	if referrerAddress == "" {
		return nil
	}

	rewardAmount := platformFeeGSTD * 0.05 // 5% of fee (Referral Bonus from Admin Share)

	// Record reward
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO referral_rewards (referrer_address, referred_user_address, task_id, amount_gstd, status)
		VALUES ($1, $2, $3, $4, 'pending')
	`, referrerAddress, workerAddress, taskID, rewardAmount)

	if err != nil {
		log.Printf("Failed to record referral reward: %v", err)
		return err
	}

	return nil
}

// ApplyReferralCode links a user to a referrer
func (s *ReferralService) ApplyReferralCode(ctx context.Context, walletAddress string, code string) error {
	// Cannot refer yourself
	var ownerAddress string
	err := s.db.QueryRowContext(ctx, "SELECT wallet_address FROM users WHERE referral_code = $1", code).Scan(&ownerAddress)
	if err != nil {
		return fmt.Errorf("invalid referral code")
	}

	if ownerAddress == walletAddress {
		return fmt.Errorf("cannot refer yourself")
	}

	// Check if already referred
	var existingReferrer sql.NullString
	s.db.QueryRowContext(ctx, "SELECT referred_by FROM users WHERE wallet_address = $1", walletAddress).Scan(&existingReferrer)
	if existingReferrer.Valid && existingReferrer.String != "" {
		return fmt.Errorf("already has a referrer")
	}

	// Link
	_, err = s.db.ExecContext(ctx, "UPDATE users SET referred_by = $1 WHERE wallet_address = $2", ownerAddress, walletAddress)
	return err
}
