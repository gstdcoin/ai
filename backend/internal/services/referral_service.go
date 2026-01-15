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
func (s *ReferralService) GetUserStats(ctx context.Context, userID int) (*ReferralStats, error) {
	stats := &ReferralStats{}

	// Get referral code
	err := s.db.QueryRowContext(ctx, "SELECT referral_code FROM users WHERE id = $1", userID).Scan(&stats.ReferralCode)
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
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE referred_by_user_id = $1", userID).Scan(&stats.TotalReferred)
	if err != nil {
		log.Printf("Error counting referrals: %v", err)
		stats.TotalReferred = 0
	}

	// Get total earned (paid)
	err = s.db.QueryRowContext(ctx, 
		"SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards WHERE referrer_id = $1 AND status = 'paid'", 
		userID).Scan(&stats.TotalEarned)
	if err != nil {
		log.Printf("Error summing earned rewards: %v", err)
	}

	// Get pending rewards
	err = s.db.QueryRowContext(ctx, 
		"SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards WHERE referrer_id = $1 AND status = 'pending'", 
		userID).Scan(&stats.PendingRewards)
	if err != nil {
		log.Printf("Error summing pending rewards: %v", err)
	}

	return stats, nil
}

// ProcessReferralReward calculates and records a referral reward when a task is completed/paid
// This should be called from PaymentTracker or wherever tasks are finalized
func (s *ReferralService) ProcessReferralReward(ctx context.Context, workerUserID int, taskID string, platformFeeGSTD float64) error {
	// 5% of platform fee goes to referrer
	if platformFeeGSTD <= 0 {
		return nil
	}

	// Find referrer
	var referrerID int
	err := s.db.QueryRowContext(ctx, "SELECT referred_by_user_id FROM users WHERE id = $1", workerUserID).Scan(&referrerID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil // No referrer
		}
		return err
	}
	
	if referrerID == 0 {
		return nil
	}

	rewardAmount := platformFeeGSTD * 0.05 // 5% share

	// Record reward
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO referral_rewards (referrer_id, referred_user_id, task_id, amount_gstd, status)
		VALUES ($1, $2, $3, $4, 'pending')
	`, referrerID, workerUserID, taskID, rewardAmount)

	if err != nil {
		log.Printf("Failed to record referral reward: %v", err)
		return err
	}

	return nil
}

// ApplyReferralCode links a user to a referrer
func (s *ReferralService) ApplyReferralCode(ctx context.Context, userID int, code string) error {
	// Cannot refer yourself
	var ownerID int
	err := s.db.QueryRowContext(ctx, "SELECT id FROM users WHERE referral_code = $1", code).Scan(&ownerID)
	if err != nil {
		return fmt.Errorf("invalid referral code")
	}

	if ownerID == userID {
		return fmt.Errorf("cannot refer yourself")
	}

	// Check if already referred
	var existingReferrer sql.NullInt64
	s.db.QueryRowContext(ctx, "SELECT referred_by_user_id FROM users WHERE id = $1", userID).Scan(&existingReferrer)
	if existingReferrer.Valid {
		return fmt.Errorf("already has a referrer")
	}

	// Link
	_, err = s.db.ExecContext(ctx, "UPDATE users SET referred_by_user_id = $1 WHERE id = $2", ownerID, userID)
	return err
}
