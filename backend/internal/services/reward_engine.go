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
	db                  *sql.DB
	tonService          *TONService
	stonFiService       *StonFiService
	jettonTransfer      *JettonTransferService
	tonConfig           config.TONConfig
	treasuryWallet      string
	xautJettonAddr      string
	payoutRetry         *PayoutRetryService
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
	// Use AdminWallet for receiving 5% commission (not TreasuryWallet)
	// Admin will manually manage the GSTD/XAUt pool
	adminWallet := tonConfig.AdminWallet
	if adminWallet == "" {
		log.Printf("⚠️  ADMIN_WALLET not configured - commission will not be sent")
	}
	
	xautJettonAddr := tonConfig.XAUtJettonAddress
	if xautJettonAddr == "" {
		xautJettonAddr = "EQCyD8v6khUUrce9BCvHOaBC9PrvlV9S7D5v67O80p444XAr" // Mainnet XAUt
	}

	// PULL-MODEL: Platform doesn't need wallet for automatic transfers
	// Users sign and pay gas fees themselves via TonConnect
	// Platform wallet is optional - only needed for admin operations (if any)
	// Workers claim rewards via escrow contract, paying gas fees themselves
	
	var jettonTransfer *JettonTransferService
	walletAddr := tonConfig.PlatformWalletAddress
	privateKey := tonConfig.PlatformWalletPrivateKey
	
	// Only initialize if both are provided (for optional admin operations)
	if privateKey != "" && walletAddr != "" {
		jettonTransfer = NewJettonTransferService(
			tonConfig.APIURL,
			tonConfig.APIKey,
			walletAddr,
			privateKey,
		)
		log.Printf("✅ JettonTransferService initialized (optional admin operations)")
	} else {
		log.Printf("ℹ️  PULL-MODEL: JettonTransferService not needed - users sign transactions themselves")
		log.Printf("   Workers claim rewards via escrow contract using TonConnect")
		log.Printf("   Platform only generates payout intents, users pay gas fees")
		jettonTransfer = nil
	}

	return &RewardEngine{
		db:             db,
		tonService:     tonService,
		stonFiService:  stonFiService,
		jettonTransfer: jettonTransfer,
		tonConfig:      tonConfig,
		treasuryWallet: tonConfig.AdminWallet, // Use AdminWallet for treasury
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

	// PULL-MODEL: Workers claim rewards themselves via escrow contract
	// Platform only generates payout intent, workers sign and pay gas fees
	// No automatic transfers - workers use TonConnect to claim via escrow
	log.Printf("Reward available for claim: %.9f GSTD to worker %s (task: %s)", 
		workerReward, workerWallet, task.TaskID)
	log.Printf("Worker can claim via: POST /api/v1/payments/payout-intent with task_id=%s", task.TaskID)

	// Platform fee is collected when worker claims (handled by escrow contract)
	// No need to process platform fee separately - escrow contract handles it
	log.Printf("Platform fee (%.9f GSTD) will be collected when worker claims via escrow", platformFee)

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

// sendGSTDToWorker is DEPRECATED - use pull-model instead
// Workers claim rewards themselves via escrow contract using TonConnect
// This function is kept for backward compatibility but does nothing
func (re *RewardEngine) sendGSTDToWorker(ctx context.Context, workerWallet string, amount float64, taskID string) error {
	// PULL-MODEL: No automatic transfers
	// Workers claim rewards via escrow contract using payout intent
	log.Printf("PULL-MODEL: Worker %s can claim %.9f GSTD for task %s via escrow contract", 
		workerWallet, amount, taskID)
	return nil
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

	// Use JettonTransferService to send transfer
	if re.jettonTransfer != nil {
		comment := fmt.Sprintf("Task reward: %s", taskID)
		txHash, err := re.jettonTransfer.SendJettonTransfer(
			ctx,
			workerWallet,
			re.tonConfig.GSTDJettonAddress,
			amountNano,
			comment,
		)
		if err != nil {
			log.Printf("Error sending jetton transfer: %v", err)
			return fmt.Errorf("failed to send jetton transfer: %w", err)
		}

		log.Printf("✅ Jetton transfer initiated: tx_hash=%s, amount=%d nanoGSTD, to=%s",
			txHash, amountNano, workerWallet)

		// Store transaction hash in database for tracking
		_, err = re.db.ExecContext(ctx, `
			UPDATE tasks
			SET executor_payout_tx_hash = $1,
			    executor_payout_status = 'pending'
			WHERE task_id = $2
		`, txHash, taskID)
		if err != nil {
			log.Printf("Warning: Failed to update task with tx hash: %v", err)
		}

		return nil
	}

	// Fallback: log transfer intent if service not available
	log.Printf("⚠️  JettonTransferService not available - transfer not sent")
	log.Printf("   Transfer intent: %d nanoGSTD to %s (task: %s)", amountNano, workerWallet, taskID)
	
	return nil
}

// processPlatformFee is DEPRECATED - platform fee is handled by escrow contract
// When worker claims reward, escrow contract automatically sends platform fee to treasury
// This function is kept for backward compatibility but does nothing
func (re *RewardEngine) processPlatformFee(ctx context.Context, amount float64, taskID string) error {
	// PULL-MODEL: Platform fee is collected automatically by escrow contract
	// when worker claims reward. No separate processing needed.
	log.Printf("PULL-MODEL: Platform fee (%.9f GSTD) will be collected by escrow contract when worker claims", amount)
	return nil

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


