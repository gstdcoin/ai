package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"time"
)

// MultiLevelReferralService handles 3-level referral system
// Level 1: 5% of platform fee
// Level 2: 2% of platform fee
// Level 3: 1% of platform fee
type MultiLevelReferralService struct {
	db *sql.DB
}

// ReferralLevels defines reward percentages for each level
var ReferralLevels = map[int]float64{
	1: 0.05, // 5% for direct referrer
	2: 0.02, // 2% for referrer's referrer
	3: 0.01, // 1% for 3rd level
}

// NewMultiLevelReferralService creates a new multi-level referral service
func NewMultiLevelReferralService(db *sql.DB) *MultiLevelReferralService {
	return &MultiLevelReferralService{db: db}
}

// GenerateReferralCode generates a unique referral code for a user
func (s *MultiLevelReferralService) GenerateReferralCode(ctx context.Context, walletAddress string) (string, error) {
	// Check if user already has a code
	var existingCode sql.NullString
	err := s.db.QueryRowContext(ctx,
		"SELECT referral_code FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&existingCode)

	if err != nil && err != sql.ErrNoRows {
		return "", err
	}

	if existingCode.Valid && existingCode.String != "" {
		return existingCode.String, nil
	}

	// Generate new code
	code := s.generateCode()

	// Ensure uniqueness
	for {
		var count int
		s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE referral_code = $1", code).Scan(&count)
		if count == 0 {
			break
		}
		code = s.generateCode()
	}

	// Save code
	_, err = s.db.ExecContext(ctx,
		"UPDATE users SET referral_code = $1 WHERE wallet_address = $2",
		code, walletAddress)

	if err != nil {
		return "", err
	}

	return code, nil
}

func (s *MultiLevelReferralService) generateCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Excluding similar chars
	b := make([]byte, 8)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// ApplyReferralCode links a new user to their referrer (called during signup)
func (s *MultiLevelReferralService) ApplyReferralCode(ctx context.Context, newUserWallet string, code string) error {
	if code == "" {
		return nil // No code provided, OK
	}

	// Find code owner
	var referrerWallet string
	err := s.db.QueryRowContext(ctx,
		"SELECT wallet_address FROM users WHERE referral_code = $1",
		code).Scan(&referrerWallet)

	if err == sql.ErrNoRows {
		return fmt.Errorf("invalid referral code")
	}
	if err != nil {
		return err
	}

	// Cannot refer yourself
	if referrerWallet == newUserWallet {
		return fmt.Errorf("cannot refer yourself")
	}

	// Check if already has a referrer
	var existingReferrer sql.NullString
	s.db.QueryRowContext(ctx,
		"SELECT referred_by FROM users WHERE wallet_address = $1",
		newUserWallet).Scan(&existingReferrer)

	if existingReferrer.Valid && existingReferrer.String != "" {
		return fmt.Errorf("already has a referrer")
	}

	// Link user to referrer
	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET 
			referred_by = $1,
			referrer_level_1 = $1
		WHERE wallet_address = $2
	`, referrerWallet, newUserWallet)

	if err != nil {
		return err
	}

	// Set level 2 and 3 referrers (upline chain)
	var level2, level3 sql.NullString
	s.db.QueryRowContext(ctx,
		"SELECT referred_by FROM users WHERE wallet_address = $1",
		referrerWallet).Scan(&level2)

	if level2.Valid && level2.String != "" {
		_, err = s.db.ExecContext(ctx,
			"UPDATE users SET referrer_level_2 = $1 WHERE wallet_address = $2",
			level2.String, newUserWallet)

		// Get level 3
		s.db.QueryRowContext(ctx,
			"SELECT referred_by FROM users WHERE wallet_address = $1",
			level2.String).Scan(&level3)

		if level3.Valid && level3.String != "" {
			s.db.ExecContext(ctx,
				"UPDATE users SET referrer_level_3 = $1 WHERE wallet_address = $2",
				level3.String, newUserWallet)
		}
	}

	log.Printf("🔗 Referral linked: %s -> %s", newUserWallet[:16], referrerWallet[:16])

	return nil
}

// ProcessReferralRewards distributes referral rewards to all levels
// Called when a worker completes a task
func (s *MultiLevelReferralService) ProcessReferralRewards(ctx context.Context, workerWallet string, taskID string, platformFee float64) error {
	if platformFee <= 0 {
		return nil
	}

	// Get referrer chain for this worker
	var level1, level2, level3 sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT referrer_level_1, referrer_level_2, referrer_level_3
		FROM users WHERE wallet_address = $1
	`, workerWallet).Scan(&level1, &level2, &level3)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil // No referrers
		}
		return err
	}

	// Process each level
	if level1.Valid && level1.String != "" {
		reward1 := platformFee * ReferralLevels[1]
		s.creditReferralReward(ctx, level1.String, workerWallet, taskID, 1, reward1)
	}

	if level2.Valid && level2.String != "" {
		reward2 := platformFee * ReferralLevels[2]
		s.creditReferralReward(ctx, level2.String, workerWallet, taskID, 2, reward2)
	}

	if level3.Valid && level3.String != "" {
		reward3 := platformFee * ReferralLevels[3]
		s.creditReferralReward(ctx, level3.String, workerWallet, taskID, 3, reward3)
	}

	return nil
}

// creditReferralReward credits reward to a referrer
func (s *MultiLevelReferralService) creditReferralReward(ctx context.Context, referrerWallet, sourceWallet, taskID string, level int, amount float64) {
	if amount < 0.000001 {
		return // Skip dust amounts
	}

	// Record reward (pending - will be paid in batch)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO referral_rewards (
			referrer_address, referred_user_address, task_id, 
			level, amount_gstd, status
		) VALUES ($1, $2, $3, $4, $5, 'pending')
	`, referrerWallet, sourceWallet, taskID, level, amount)

	if err != nil {
		log.Printf("⚠️  Failed to record referral reward: %v", err)
		return
	}

	log.Printf("💸 Referral reward L%d: %.6f GSTD to %s", level, amount, referrerWallet[:16])
}

// ClaimPendingRewards claims all pending referral rewards for a user
func (s *MultiLevelReferralService) ClaimPendingRewards(ctx context.Context, walletAddress string) (*ClaimResult, error) {
	// Sum pending rewards
	var totalPending float64
	var rewardCount int
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0), COUNT(*)
		FROM referral_rewards
		WHERE referrer_address = $1 AND status = 'pending'
	`, walletAddress).Scan(&totalPending, &rewardCount)

	if err != nil {
		return nil, err
	}

	if totalPending <= 0 {
		return &ClaimResult{
			Success: false,
			Message: "No pending rewards to claim",
		}, nil
	}

	// Update rewards to claimed
	_, err = s.db.ExecContext(ctx, `
		UPDATE referral_rewards SET 
			status = 'paid',
			paid_at = NOW()
		WHERE referrer_address = $1 AND status = 'pending'
	`, walletAddress)

	if err != nil {
		return nil, err
	}

	// Credit user balance
	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET balance = balance + $1
		WHERE wallet_address = $2
	`, totalPending, walletAddress)

	if err != nil {
		// Rollback status
		s.db.ExecContext(ctx, `
			UPDATE referral_rewards SET status = 'pending', paid_at = NULL
			WHERE referrer_address = $1 AND status = 'paid' AND paid_at > NOW() - INTERVAL '1 minute'
		`, walletAddress)
		return nil, err
	}

	// Get new balance
	var newBalance float64
	s.db.QueryRowContext(ctx, "SELECT balance FROM users WHERE wallet_address = $1", walletAddress).Scan(&newBalance)

	return &ClaimResult{
		Success:        true,
		AmountClaimed:  totalPending,
		RewardsClaimed: rewardCount,
		NewBalance:     newBalance,
		Message:        fmt.Sprintf("🎉 Claimed %.6f GSTD from %d referral rewards!", totalPending, rewardCount),
	}, nil
}

// GetReferralStats returns comprehensive referral statistics for a user
func (s *MultiLevelReferralService) GetReferralStats(ctx context.Context, walletAddress string) (*ReferralStatsV2, error) {
	stats := &ReferralStatsV2{
		WalletAddress: walletAddress,
	}

	// Get referral code
	var code sql.NullString
	s.db.QueryRowContext(ctx,
		"SELECT referral_code FROM users WHERE wallet_address = $1",
		walletAddress).Scan(&code)

	if code.Valid {
		stats.ReferralCode = code.String
		stats.ReferralLink = fmt.Sprintf("https://t.me/GSTD_Main_Bot?start=ref_%s", code.String)
		stats.WebLink = fmt.Sprintf("https://app.gstdtoken.com?ref=%s", code.String)
	}

	// Count referrals by level
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM users WHERE referrer_level_1 = $1
	`, walletAddress).Scan(&stats.Level1Count)

	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM users WHERE referrer_level_2 = $1
	`, walletAddress).Scan(&stats.Level2Count)

	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM users WHERE referrer_level_3 = $1
	`, walletAddress).Scan(&stats.Level3Count)

	stats.TotalReferrals = stats.Level1Count + stats.Level2Count + stats.Level3Count

	// Earnings by level
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards 
		WHERE referrer_address = $1 AND level = 1 AND status = 'paid'
	`, walletAddress).Scan(&stats.Level1Earnings)

	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards 
		WHERE referrer_address = $1 AND level = 2 AND status = 'paid'
	`, walletAddress).Scan(&stats.Level2Earnings)

	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards 
		WHERE referrer_address = $1 AND level = 3 AND status = 'paid'
	`, walletAddress).Scan(&stats.Level3Earnings)

	stats.TotalEarned = stats.Level1Earnings + stats.Level2Earnings + stats.Level3Earnings

	// Pending rewards
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_gstd), 0) FROM referral_rewards 
		WHERE referrer_address = $1 AND status = 'pending'
	`, walletAddress).Scan(&stats.PendingRewards)

	// Recent referrals
	rows, err := s.db.QueryContext(ctx, `
		SELECT wallet_address, created_at,
			CASE 
				WHEN referrer_level_1 = $1 THEN 1
				WHEN referrer_level_2 = $1 THEN 2
				WHEN referrer_level_3 = $1 THEN 3
			END as level
		FROM users
		WHERE referrer_level_1 = $1 OR referrer_level_2 = $1 OR referrer_level_3 = $1
		ORDER BY created_at DESC
		LIMIT 10
	`, walletAddress)

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ref RecentReferral
			var createdAt time.Time
			rows.Scan(&ref.WalletAddress, &createdAt, &ref.Level)
			ref.JoinedAt = createdAt.Format(time.RFC3339)
			// Mask wallet for privacy
			if len(ref.WalletAddress) > 16 {
				ref.WalletAddress = ref.WalletAddress[:8] + "..." + ref.WalletAddress[len(ref.WalletAddress)-8:]
			}
			stats.RecentReferrals = append(stats.RecentReferrals, ref)
		}
	}

	return stats, nil
}

// GetReferralLeaderboard returns top referrers
func (s *MultiLevelReferralService) GetReferralLeaderboard(ctx context.Context, limit int) ([]LeaderboardEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT 
			referrer_address,
			COUNT(DISTINCT referred_user_address) as total_referrals,
			SUM(amount_gstd) as total_earned
		FROM referral_rewards
		WHERE status = 'paid'
		GROUP BY referrer_address
		ORDER BY total_earned DESC
		LIMIT $1
	`, limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []LeaderboardEntry
	rank := 1
	for rows.Next() {
		var e LeaderboardEntry
		rows.Scan(&e.WalletAddress, &e.TotalReferrals, &e.TotalEarned)
		e.Rank = rank
		// Mask wallet
		if len(e.WalletAddress) > 16 {
			e.WalletAddress = e.WalletAddress[:8] + "..." + e.WalletAddress[len(e.WalletAddress)-8:]
		}
		entries = append(entries, e)
		rank++
	}

	return entries, nil
}

// SignupBonusForReferrer gives bonus when referred user signs up
func (s *MultiLevelReferralService) SignupBonusForReferrer(ctx context.Context, referrerWallet string, newUserWallet string) error {
	signupBonus := 1.0 // 1 GSTD per signup

	// Credit referrer
	_, err := s.db.ExecContext(ctx, `
		UPDATE users SET balance = balance + $1
		WHERE wallet_address = $2
	`, signupBonus, referrerWallet)

	if err != nil {
		return err
	}

	// Record as special reward
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO referral_rewards (
			referrer_address, referred_user_address, task_id,
			level, amount_gstd, status, paid_at
		) VALUES ($1, $2, 'SIGNUP_BONUS', 0, $3, 'paid', NOW())
	`, referrerWallet, newUserWallet, signupBonus)

	log.Printf("🎁 Signup bonus: %.1f GSTD to %s for referring %s", signupBonus, referrerWallet[:16], newUserWallet[:16])

	return err
}

// ============================================================================
// TYPES
// ============================================================================

type ClaimResult struct {
	Success        bool    `json:"success"`
	AmountClaimed  float64 `json:"amount_claimed,omitempty"`
	RewardsClaimed int     `json:"rewards_claimed,omitempty"`
	NewBalance     float64 `json:"new_balance,omitempty"`
	Message        string  `json:"message"`
}

type ReferralStatsV2 struct {
	WalletAddress string `json:"wallet_address"`
	ReferralCode  string `json:"referral_code"`
	ReferralLink  string `json:"referral_link"` // Telegram
	WebLink       string `json:"web_link"`      // Web app

	Level1Count    int `json:"level_1_count"`
	Level2Count    int `json:"level_2_count"`
	Level3Count    int `json:"level_3_count"`
	TotalReferrals int `json:"total_referrals"`

	Level1Earnings float64 `json:"level_1_earnings"`
	Level2Earnings float64 `json:"level_2_earnings"`
	Level3Earnings float64 `json:"level_3_earnings"`
	TotalEarned    float64 `json:"total_earned"`
	PendingRewards float64 `json:"pending_rewards"`

	RecentReferrals []RecentReferral `json:"recent_referrals,omitempty"`
}

type RecentReferral struct {
	WalletAddress string `json:"wallet_address"`
	Level         int    `json:"level"`
	JoinedAt      string `json:"joined_at"`
}

type LeaderboardEntry struct {
	Rank           int     `json:"rank"`
	WalletAddress  string  `json:"wallet_address"`
	TotalReferrals int     `json:"total_referrals"`
	TotalEarned    float64 `json:"total_earned"`
}
