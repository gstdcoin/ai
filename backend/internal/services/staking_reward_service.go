package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// StakingRewardService distributes daily APY rewards to stakers.
// Funding source: Golden Reserve pool (filled by 50% of chat fees).
// Formula: daily_reward = staked_amount × (tier_apy / 365)
type StakingRewardService struct {
	db       *sql.DB
	interval time.Duration
}

// StakingTier defines APY tiers based on staked amounts
type StakingTier struct {
	Name     string
	MinStake float64
	APY      float64 // annual percentage yield
}

// Tiers match what is advertised in stakingInfo endpoint
var stakingTiers = []StakingTier{
	{Name: "Diamond", MinStake: 10000, APY: 24.0},
	{Name: "Gold", MinStake: 1000, APY: 18.0},
	{Name: "Silver", MinStake: 100, APY: 15.0},
	{Name: "Bronze", MinStake: 1, APY: 12.0},
}

// NewStakingRewardService creates the staking reward distributor
func NewStakingRewardService(db *sql.DB) *StakingRewardService {
	return &StakingRewardService{
		db:       db,
		interval: 24 * time.Hour,
	}
}

// Start begins the daily reward distribution loop
func (s *StakingRewardService) Start(ctx context.Context) {
	log.Println("💰 [Staking Rewards] Distributor started (24h cycle)")

	// Run immediately on startup, then every 24h
	s.distribute(ctx)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("💰 [Staking Rewards] Distributor stopped")
			return
		case <-ticker.C:
			s.distribute(ctx)
		}
	}
}

// distribute performs one round of reward distribution
func (s *StakingRewardService) distribute(ctx context.Context) {
	log.Println("💰 [Staking Rewards] Starting daily distribution...")

	// 1. Check available reward pool (Golden Reserve with 'STAKING_POOL' source)
	var poolBalance float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(gstd_amount), 0) FROM golden_reserve_log
		WHERE treasury_wallet = 'STAKING_POOL'
	`).Scan(&poolBalance)
	if err != nil {
		log.Printf("⚠️  [Staking Rewards] Failed to read pool balance: %v", err)
		return
	}

	if poolBalance <= 0 {
		log.Println("💰 [Staking Rewards] Pool empty — no rewards to distribute (waiting for chat fee revenue)")
		return
	}

	// 2. Get all stakers with their frozen balances
	rows, err := s.db.QueryContext(ctx, `
		SELECT wallet_address, COALESCE(gstd_frozen, 0) as staked
		FROM users
		WHERE COALESCE(gstd_frozen, 0) > 0
	`)
	if err != nil {
		log.Printf("⚠️  [Staking Rewards] Failed to query stakers: %v", err)
		return
	}
	defer rows.Close()

	type staker struct {
		Wallet string
		Staked float64
	}
	var stakers []staker
	for rows.Next() {
		var st staker
		if err := rows.Scan(&st.Wallet, &st.Staked); err != nil {
			continue
		}
		stakers = append(stakers, st)
	}

	if len(stakers) == 0 {
		log.Println("💰 [Staking Rewards] No stakers found — skipping")
		return
	}

	// 3. Calculate and distribute rewards
	var totalDistributed float64
	var rewardedCount int

	for _, st := range stakers {
		// Determine tier APY
		apy := 12.0 // default Bronze
		for _, tier := range stakingTiers {
			if st.Staked >= tier.MinStake {
				apy = tier.APY
				break // tiers are sorted highest first
			}
		}

		// Daily reward = staked × (APY / 365 / 100)
		dailyReward := st.Staked * (apy / 365.0 / 100.0)

		// Cap reward at available pool
		if totalDistributed+dailyReward > poolBalance {
			dailyReward = poolBalance - totalDistributed
			if dailyReward <= 0 {
				log.Printf("💰 [Staking Rewards] Pool exhausted after %d stakers", rewardedCount)
				break
			}
		}

		// Credit reward to user's gstd_balance
		txID := uuid.New().String()[:16]
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			continue
		}

		// Add reward to balance
		_, err = tx.ExecContext(ctx, `
			UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) + $1, updated_at = NOW()
			WHERE wallet_address = $2
		`, dailyReward, st.Wallet)
		if err != nil {
			tx.Rollback()
			continue
		}

		// Record in transaction history
		_, err = tx.ExecContext(ctx, `
			INSERT INTO transaction_history (tx_id, from_wallet, to_wallet, amount_gstd, tx_type, description, confirmed_at)
			VALUES ($1, 'STAKING_POOL', $2, $3, 'staking_reward', $4, NOW())
		`, txID, st.Wallet, dailyReward,
			fmt.Sprintf("Daily staking reward: %.6f GSTD (%.0f%% APY on %.2f staked)", dailyReward, apy, st.Staked))
		if err != nil {
			// Non-critical — reward already credited
			log.Printf("⚠️  [Staking Rewards] History insert failed for %s: %v", st.Wallet[:12], err)
		}

		if err := tx.Commit(); err != nil {
			tx.Rollback()
			continue
		}

		totalDistributed += dailyReward
		rewardedCount++
	}

	// 4. Deduct distributed amount from pool (negative entry)
	if totalDistributed > 0 {
		_, _ = s.db.ExecContext(ctx, `
			INSERT INTO golden_reserve_log (task_id, gstd_amount, treasury_wallet, timestamp)
			VALUES ($1, $2, 'STAKING_POOL', NOW())
		`, "staking-dist-"+time.Now().Format("2006-01-02"), -totalDistributed)

		log.Printf("💰 [Staking Rewards] Distributed %.6f GSTD to %d stakers (pool remaining: %.6f)",
			totalDistributed, rewardedCount, poolBalance-totalDistributed)
	}
}
