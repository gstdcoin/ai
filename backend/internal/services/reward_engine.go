package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"

	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/models"
)

type RewardEngine struct {
	db              *sql.DB
	tonService      *TONService
	stonFiService   *StonFiService
	tonConfig       config.TONConfig
	treasuryWallet  string
	xautJettonAddr  string
	payoutRetry     *PayoutRetryService
}

// SetPayoutRetry sets the payout retry service
func (re *RewardEngine) SetPayoutRetry(prs *PayoutRetryService) {
	re.payoutRetry = prs
}

func NewRewardEngine(
	db *sql.DB,
	tonService *TONService,
	stonFiService *StonFiService,
	tonConfig config.TONConfig,
) *RewardEngine {
	// Use configured addresses (Mainnet)
	treasuryWallet := tonConfig.TreasuryWallet
	if treasuryWallet == "" {
		treasuryWallet = "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"
	}
	
	xautJettonAddr := tonConfig.XAUtJettonAddress
	if xautJettonAddr == "" {
		xautJettonAddr = "EQCyD8v6khUUrce9BCvHOaBC9PrvlV9S7D5v67O80p444XAr" // Mainnet XAUt
	}

	return &RewardEngine{
		db:             db,
		tonService:     tonService,
		stonFiService:  stonFiService,
		tonConfig:      tonConfig,
		treasuryWallet: treasuryWallet,
		xautJettonAddr: xautJettonAddr,
	}
}

// DistributeRewards splits the task budget and distributes rewards
func (re *RewardEngine) DistributeRewards(ctx context.Context, task *models.Task, workerWallet string) error {
	if task.BudgetGSTD == nil || *task.BudgetGSTD <= 0 {
		return fmt.Errorf("invalid budget for task %s", task.TaskID)
	}

	budget := *task.BudgetGSTD

	// Calculate 95/5 split
	workerReward := budget * 0.95
	platformFee := budget * 0.05

	log.Printf("Distributing rewards for task %s: Budget=%.9f, Worker=%.9f, Platform=%.9f",
		task.TaskID, budget, workerReward, platformFee)

	// Send 95% to worker
	if err := re.sendGSTDToWorker(ctx, workerWallet, workerReward, task.TaskID); err != nil {
		log.Printf("Error sending reward to worker %s: %v", workerWallet, err)
		// Log failed payout for retry
		if re.payoutRetry != nil {
			re.payoutRetry.LogFailedPayout(ctx, task.TaskID, "worker", workerWallet, workerReward, err.Error())
		}
		// Continue with platform fee even if worker payout fails
	}

	// Send 5% to treasury and swap to XAUt
	if err := re.processPlatformFee(ctx, platformFee, task.TaskID); err != nil {
		log.Printf("Error processing platform fee: %v", err)
		return err
	}

	// Update task with reward information
	_, err := re.db.ExecContext(ctx, `
		UPDATE tasks
		SET reward_gstd = $1,
		    platform_fee_ton = $2,
		    executor_reward_ton = $3,
		    updated_at = NOW()
		WHERE task_id = $4
	`, workerReward, platformFee, workerReward, task.TaskID)

	return err
}

// sendGSTDToWorker sends GSTD jetton to worker wallet
// SECURITY: Implements withdrawal lock for large payouts and 24-hour aggregation
func (re *RewardEngine) sendGSTDToWorker(ctx context.Context, workerWallet string, amount float64, taskID string) error {
	// SECURITY: 24-hour aggregation check to prevent bypass via multiple small tasks
	var creatorWallet string
	err := re.db.QueryRowContext(ctx, `
		SELECT creator_wallet
		FROM tasks
		WHERE task_id = $1
	`, taskID).Scan(&creatorWallet)
	
	if err == nil && creatorWallet != "" {
		var total24h float64
		err = re.db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(reward_gstd), 0)
			FROM tasks
			WHERE creator_wallet = $1
			  AND status = 'completed'
			  AND completed_at > NOW() - INTERVAL '24 hours'
			  AND reward_gstd IS NOT NULL
		`, creatorWallet).Scan(&total24h)
		
		if err == nil {
			totalWithCurrent := total24h + amount
			aggregationThreshold := 1000.0 // 1000 GSTD total per 24h per wallet
			
			if totalWithCurrent > aggregationThreshold {
				log.Printf("⚠️  AGGREGATION LOCK: Wallet %s has %.9f GSTD in last 24h (current: %.9f, total: %.9f) - Requires approval",
					creatorWallet, total24h, amount, totalWithCurrent)
				
				// Check if withdrawal is already approved
				var lockStatus string
				err = re.db.QueryRowContext(ctx, `
					SELECT status
					FROM withdrawal_locks
					WHERE task_id = $1
				`, taskID).Scan(&lockStatus)
				
				// If no lock exists, create one
				if err != nil {
					_, err = re.db.ExecContext(ctx, `
						INSERT INTO withdrawal_locks (
							task_id, worker_wallet, amount_gstd, status, created_at
						) VALUES ($1, $2, $3, 'pending_approval', NOW())
						ON CONFLICT (task_id) DO NOTHING
					`, taskID, workerWallet, amount)
					
					if err != nil {
						log.Printf("Error logging withdrawal lock: %v", err)
					}
					
					return fmt.Errorf("withdrawal locked: 24h aggregate %.9f GSTD exceeds threshold %.9f GSTD - requires manual approval",
						totalWithCurrent, aggregationThreshold)
				}
				
				// If lock exists, check status
				if lockStatus != "approved" {
					log.Printf("⚠️  Withdrawal still pending approval for task %s (status: %s)", taskID, lockStatus)
					return fmt.Errorf("withdrawal locked: status is '%s' - requires approval", lockStatus)
				}
				
				log.Printf("✅ Withdrawal approved for task %s, processing payout", taskID)
			}
		}
	}
	
	// SECURITY: Withdrawal lock for large payouts (single task threshold)
	threshold := re.tonConfig.WithdrawalLockThreshold
	if threshold > 0 && amount > threshold {
		// Check if withdrawal is already approved
		var lockStatus string
		err := re.db.QueryRowContext(ctx, `
			SELECT status
			FROM withdrawal_locks
			WHERE task_id = $1
		`, taskID).Scan(&lockStatus)

		// If no lock exists, create one
		if err != nil {
			log.Printf("⚠️  LARGE PAYOUT DETECTED: %.9f GSTD to %s (task: %s) - Requires manual approval", 
				amount, workerWallet, taskID)
			
			// Log to withdrawal_locks table for manual review
			_, err := re.db.ExecContext(ctx, `
				INSERT INTO withdrawal_locks (
					task_id, worker_wallet, amount_gstd, status, created_at
				) VALUES ($1, $2, $3, 'pending_approval', NOW())
				ON CONFLICT (task_id) DO NOTHING
			`, taskID, workerWallet, amount)
			
			if err != nil {
				log.Printf("Error logging withdrawal lock: %v", err)
			}
			
			// Return error to prevent payout until approved
			return fmt.Errorf("withdrawal locked: amount %.9f GSTD exceeds threshold %.9f GSTD - requires manual approval", 
				amount, threshold)
		}

		// If lock exists, check status
		if lockStatus != "approved" {
			log.Printf("⚠️  Withdrawal still pending approval for task %s (status: %s)", taskID, lockStatus)
			return fmt.Errorf("withdrawal locked: status is '%s' - requires approval", lockStatus)
		}

		// Status is approved, proceed with payout
		log.Printf("✅ Withdrawal approved for task %s, processing payout", taskID)
	}

	// Convert GSTD to nanotons (9 decimals)
	amountNano := int64(math.Round(amount * 1e9))

	log.Printf("Sending %.9f GSTD to worker %s (task: %s)", amount, workerWallet, taskID)

	// Use TonAPI to send jetton transfer
	// Note: This is a simplified version - in production, you'd use a wallet service
	// that can sign and send transactions
	// For now, we'll log the transaction details
	log.Printf("Jetton transfer: %d nanoGSTD to %s", amountNano, workerWallet)

	// TODO: Implement actual jetton transfer via TonAPI or wallet service
	// This requires:
	// 1. Wallet with GSTD balance
	// 2. Signing capability
	// 3. Transaction construction for jetton transfers

	return nil
}

// processPlatformFee sends platform fee to treasury and swaps to XAUt
func (re *RewardEngine) processPlatformFee(ctx context.Context, amount float64, taskID string) error {
	log.Printf("Processing platform fee: %.9f GSTD (task: %s)", amount, taskID)

	// Step 1: Send GSTD to treasury wallet
	log.Printf("Sending %.9f GSTD to treasury %s", amount, re.treasuryWallet)

	// TODO: Implement actual jetton transfer to treasury
	// For now, we'll proceed with the swap logic

	// Step 2: Swap GSTD to XAUt via STON.fi (Mainnet)
	if re.stonFiService != nil {
		xautAmount, txHash, err := re.stonFiService.SwapGSTDToXAUt(
			ctx, 
			amount, 
			re.tonConfig.GSTDJettonAddress,
			re.xautJettonAddr,
		)
		if err != nil {
			log.Printf("Error swapping GSTD to XAUt: %v", err)
			// Log failed swap for retry
			if re.payoutRetry != nil {
				re.payoutRetry.LogFailedPayout(ctx, taskID, "swap", re.treasuryWallet, amount, err.Error())
			}
			// Continue to log the accumulation even if swap fails
		} else {
			log.Printf("Swapped %.9f GSTD to %.9f XAUt (tx: %s)", amount, xautAmount, txHash)
		}
	}

	// Step 3: Log accumulation in Golden Reserve
	return re.logGoldenReserveAccumulation(ctx, amount, taskID)
}

// logGoldenReserveAccumulation logs the XAUt accumulation
func (re *RewardEngine) logGoldenReserveAccumulation(ctx context.Context, gstdAmount float64, taskID string) error {
	// Create or update golden reserve log
	_, err := re.db.ExecContext(ctx, `
		INSERT INTO golden_reserve_log (
			task_id, gstd_amount, treasury_wallet, timestamp
		) VALUES ($1, $2, $3, NOW())
		ON CONFLICT DO NOTHING
	`, taskID, gstdAmount, re.treasuryWallet)

	if err != nil {
		// Table might not exist, create it if needed
		re.createGoldenReserveTable(ctx)
		// Retry insert
		_, err = re.db.ExecContext(ctx, `
			INSERT INTO golden_reserve_log (
				task_id, gstd_amount, treasury_wallet, timestamp
			) VALUES ($1, $2, $3, NOW())
		`, taskID, gstdAmount, re.treasuryWallet)
	}

	return err
}

// createGoldenReserveTable creates the golden reserve log table if it doesn't exist
func (re *RewardEngine) createGoldenReserveTable(ctx context.Context) {
	_, err := re.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS golden_reserve_log (
			id SERIAL PRIMARY KEY,
			task_id VARCHAR(255) NOT NULL,
			gstd_amount DECIMAL(18, 9) NOT NULL,
			treasury_wallet VARCHAR(48) NOT NULL,
			timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
			INDEX idx_task_id (task_id),
			INDEX idx_timestamp (timestamp DESC)
		)
	`)
	if err != nil {
		log.Printf("Error creating golden_reserve_log table: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	// Simple implementation - in production use os.Getenv
	// For now, return default
	return defaultValue
}

