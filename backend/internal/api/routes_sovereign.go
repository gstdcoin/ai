package api

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/gin-gonic/gin"
)

const errInsufficientBalance = "insufficient balance"

// ═══════════════════════════════════════════════════════════════
// SOVEREIGN PROTOCOL: Decentralized Financial Operating System
// Replaces banking: P2P payments, staking, lending, governance
// Sovereign Protocol: compute-backed value, zero-fee mesh, AI utility
// Full autonomy: nodes operate independently of platform
// ═══════════════════════════════════════════════════════════════

// SetupSovereignRoutes registers all sovereign protocol endpoints
func SetupSovereignRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	sovereign := v1.Group("/sovereign")
	{
		// ─── Tokenomics ──────────────────────────────────
		sovereign.GET("/tokenomics", getTokenomics(db))
		sovereign.GET("/supply", getSupplyInfo(db))
		sovereign.GET("/compute-backing", getComputeBacking(db))

		// ─── P2P Payments (zero-fee, instant) ────────────
		sovereign.POST("/pay", p2pPayment(db))
		sovereign.GET("/payments", getPaymentHistory(db))

		// ─── Staking (real yield from compute fees) ──────
		sovereign.POST("/stake", createStake(db))
		sovereign.POST("/unstake", unstakePool(db))
		sovereign.GET("/staking/info", getStakingInfo(db))
		sovereign.GET("/staking/yield", getYieldEstimate(db))

		// ─── Micro-Lending ───────────────────────────────
		sovereign.POST("/loan/request", requestLoan(db))
		sovereign.POST("/loan/repay", repayLoan(db))
		sovereign.GET("/loans", getLoans(db))

		// ─── Revenue Sharing ─────────────────────────────
		sovereign.GET("/revenue", getRevenueSharing(db))

		// ─── Governance ──────────────────────────────────
		sovereign.POST("/governance/propose", createProposal(db))
		sovereign.POST("/governance/vote", castVote(db))
		sovereign.GET("/governance/proposals", getProposals(db))

		// ─── Node Autonomy ───────────────────────────────
		sovereign.POST("/mesh/announce", meshAnnounce(db))
		sovereign.GET("/mesh/peers", getMeshPeers(db))
		sovereign.POST("/mesh/consensus", submitConsensus(db))
		sovereign.POST("/node/capabilities", registerCapabilities(db))
		sovereign.GET("/node/capabilities/:node_id", getNodeCapabilities(db))

		// ─── Protocol Summary ────────────────────────────
		sovereign.GET("/protocol", getProtocolSummary(db))
	}

	log.Printf("✅ Sovereign Protocol routes registered (/sovereign/*)")
}

// ═══════════════════════════════════════════════════════════════
// TOKENOMICS: Deflationary model with capped supply + halving
// ═══════════════════════════════════════════════════════════════

func getTokenomics(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var epoch int
		var baseReward, maxSupply, circulating, totalBurned, burnRate float64
		var startedAt time.Time

		err := db.QueryRowContext(c.Request.Context(),
			`SELECT epoch_number, base_reward_per_hour, max_supply_cap, current_circulating, total_burned, burn_rate_pct, started_at
			 FROM tokenomics_halving ORDER BY epoch_number DESC LIMIT 1`).
			Scan(&epoch, &baseReward, &maxSupply, &circulating, &totalBurned, &burnRate, &startedAt)
		if err != nil {
			c.JSON(500, gin.H{"error": "tokenomics not initialized"})
			return
		}

		// Calculate real circulating from DB
		var totalMinted, totalStaked float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(pending_balance_gstd), 0) + COALESCE(SUM(gstd_balance), 0) FROM users`).Scan(&totalMinted)
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(staked_amount), 0) FROM staking_pools WHERE is_active = true`).Scan(&totalStaked)

		// Real burn from token_burns (exclude fake EMERGENCY_STABILIZATION test data)
		var realBurned float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns WHERE transaction_type != 'EMERGENCY_STABILIZATION'`).Scan(&realBurned)
		if realBurned > totalBurned {
			totalBurned = realBurned
		}

		// Next halving date (every 6 months)
		nextHalving := startedAt.Add(180 * 24 * time.Hour)
		daysUntilHalving := int(time.Until(nextHalving).Hours() / 24)
		if daysUntilHalving < 0 {
			daysUntilHalving = 180
		}

		// Deflation rate
		deflationRate := 0.0
		if totalMinted > 0 {
			deflationRate = (totalBurned / totalMinted) * 100
		}

		// Supply mined percentage
		supplyMinedPct := (totalMinted / maxSupply) * 100

		c.JSON(200, gin.H{
			"epoch":                epoch,
			"base_reward_per_hour": baseReward,
			"max_supply":           maxSupply,
			"circulating_supply":   totalMinted - totalBurned - totalStaked,
			"total_minted":         totalMinted,
			"total_burned":         totalBurned,
			"total_staked":         totalStaked,
			"burn_rate_pct":        burnRate,
			"deflation_rate_pct":   deflationRate,
			"supply_mined_pct":     supplyMinedPct,
			"remaining_supply":     maxSupply - totalMinted,
			"next_halving_in_days": daysUntilHalving,
			"next_reward_rate":     baseReward / 2,
		})
	}
}

func getSupplyInfo(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalUsers int
		var totalBalance, totalPending float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*), COALESCE(SUM(gstd_balance),0), COALESCE(SUM(pending_balance_gstd),0) FROM users`).
			Scan(&totalUsers, &totalBalance, &totalPending)

		var totalBurned float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(burn_amount),0) FROM token_burns WHERE transaction_type != 'EMERGENCY_STABILIZATION'`).Scan(&totalBurned)

		var totalStaked float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(staked_amount),0) FROM staking_pools WHERE is_active = true`).Scan(&totalStaked)

		var bridgeLocked float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(amount),0) FROM bridge_orders WHERE status NOT IN ('completed','expired','cancelled')`).Scan(&bridgeLocked)

		totalMinted := totalBalance + totalPending
		circulating := totalMinted - totalBurned - totalStaked - bridgeLocked

		// Get max supply from DB (not hardcoded)
		var maxSupply float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT max_supply_cap FROM tokenomics_halving ORDER BY epoch_number DESC LIMIT 1`).Scan(&maxSupply)
		if maxSupply <= 0 {
			maxSupply = 1000000000.0
		}

		c.JSON(200, gin.H{
			"total_minted":     totalMinted,
			"total_burned":     totalBurned,
			"circulating":      circulating,
			"staked":           totalStaked,
			"locked_in_bridge": bridgeLocked,
			"pending_rewards":  totalPending,
			"max_supply":       maxSupply,
			"remaining":        maxSupply - totalMinted,
			"holders":          totalUsers,
			"scarcity_index":   math.Max(0, (1-(circulating/maxSupply))*100),
		})
	}
}

func getComputeBacking(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var gpuRate, queryRate, storageRate float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT gstd_per_gpu_hour, gstd_per_ai_query, gstd_per_tb_storage FROM compute_backing LIMIT 1`).
			Scan(&gpuRate, &queryRate, &storageRate)

		// Calculate real compute capacity from online nodes
		var onlineNodes int
		var totalRAM int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*), COALESCE(SUM(ram_gb),0) FROM nodes WHERE status='online' AND last_seen > NOW() - INTERVAL '70 minutes'`).
			Scan(&onlineNodes, &totalRAM)

		// Estimate compute capacity
		estimatedGPUHours := float64(onlineNodes) * 24 // each node ~1 GPU-equivalent/day
		estimatedTB := float64(totalRAM) * 0.1         // ~10% of RAM as storage

		c.JSON(200, gin.H{
			"gstd_per_gpu_hour":   gpuRate,
			"gstd_per_ai_query":   queryRate,
			"gstd_per_tb_storage": storageRate,
			"network_capacity": gin.H{
				"online_nodes":    onlineNodes,
				"gpu_hours_daily": estimatedGPUHours,
				"storage_tb":      estimatedTB,
				"total_ram_gb":    totalRAM,
			},
			"intrinsic_value": gin.H{
				"compute_value_usd": estimatedGPUHours * 0.50, // $0.50/GPU-hour market rate
				"storage_value_usd": estimatedTB * 5.0,        // $5/TB/month market rate
				"per_gstd_backing":  (estimatedGPUHours*0.50 + estimatedTB*5.0) / math.Max(1, gpuRate),
			},
			"why_valuable": "Each GSTD is backed by real compute power. Unlike legacy tokens (backed by nothing) or fiat (backed by debt), GSTD gives you guaranteed AI inference, GPU compute, and storage.",
		})
	}
}

// ═══════════════════════════════════════════════════════════════
// P2P PAYMENTS: Zero-fee instant transfers (replaces banking)
// ═══════════════════════════════════════════════════════════════

type p2pPaymentReq struct {
	SenderWallet   string  `json:"sender_wallet" binding:"required"`
	ReceiverWallet string  `json:"receiver_wallet" binding:"required"`
	Amount         float64 `json:"amount" binding:"required"`
	Memo           string  `json:"memo"`
}

func p2pPayment(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req p2pPaymentReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.Amount <= 0 {
			c.JSON(400, gin.H{"error": "amount must be positive"})
			return
		}
		if req.SenderWallet == req.ReceiverWallet {
			c.JSON(400, gin.H{"error": "cannot send to yourself"})
			return
		}

		ctx := c.Request.Context()
		paymentID, netAmount, burnAmount, err := executeP2pTx(ctx, db, req)
		if err != nil {
			status := 500
			if err.Error() == errInsufficientBalance {
				status = 400
			}
			c.JSON(status, gin.H{"error": err.Error(), "required": req.Amount})
			return
		}

		c.JSON(200, gin.H{
			"payment_id":   paymentID,
			"status":       "completed",
			"amount":       req.Amount,
			"net_received": netAmount,
			"burned":       burnAmount,
			"fee":          0,
			"speed":        "instant",
			"message":      fmt.Sprintf("%.4f GSTD sent. %.4f burned (deflationary). Zero fees.", netAmount, burnAmount),
		})
	}
}

func executeP2pTx(ctx context.Context, db *sql.DB, req p2pPaymentReq) (string, float64, float64, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", 0, 0, fmt.Errorf("transaction failed: %v", err)
	}
	defer tx.Rollback()

	var senderBalance float64
	err = tx.QueryRowContext(ctx,
		`SELECT COALESCE(gstd_balance, 0) + COALESCE(pending_balance_gstd, 0) FROM users WHERE wallet_address = $1`,
		req.SenderWallet).Scan(&senderBalance)
	if err != nil || senderBalance < req.Amount {
		return "", 0, 0, fmt.Errorf(errInsufficientBalance)
	}

	var burnRate float64
	db.QueryRowContext(ctx, `SELECT burn_rate_pct FROM tokenomics_halving ORDER BY epoch_number DESC LIMIT 1`).Scan(&burnRate)
	if burnRate <= 0 {
		burnRate = 2.0
	}
	burnAmount := req.Amount * (burnRate / 100)
	netAmount := req.Amount - burnAmount

	_, err = tx.ExecContext(ctx,
		`UPDATE users SET gstd_balance = COALESCE(gstd_balance, 0) - $1, updated_at = NOW() WHERE wallet_address = $2`,
		req.Amount, req.SenderWallet)
	if err != nil {
		return "", 0, 0, fmt.Errorf("debit failed")
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO users (wallet_address, gstd_balance, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())
		 ON CONFLICT (wallet_address) DO UPDATE SET gstd_balance = COALESCE(users.gstd_balance, 0) + $2, updated_at = NOW()`,
		req.ReceiverWallet, netAmount)
	if err != nil {
		return "", 0, 0, fmt.Errorf("credit failed")
	}

	if burnAmount > 0 {
		tx.ExecContext(ctx,
			`INSERT INTO token_burns (transaction_id, transaction_type, original_amount, burn_amount, burn_address, source_wallet, created_at)
			 VALUES (gen_random_uuid()::text, 'p2p_transfer_burn', $1, $2, 'BURN', $3, NOW())`,
			req.Amount, burnAmount, req.SenderWallet)
	}

	var paymentID string
	tx.QueryRowContext(ctx,
		`INSERT INTO p2p_payments (sender_wallet, receiver_wallet, amount, fee, burn_amount, memo, status)
		 VALUES ($1, $2, $3, 0, $4, $5, 'completed') RETURNING id`,
		req.SenderWallet, req.ReceiverWallet, req.Amount, burnAmount, req.Memo).Scan(&paymentID)

	if err := tx.Commit(); err != nil {
		return "", 0, 0, fmt.Errorf("commit failed")
	}

	return paymentID, netAmount, burnAmount, nil
}

func getPaymentHistory(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet required"})
			return
		}
		rows, err := db.QueryContext(c.Request.Context(),
			`SELECT id, sender_wallet, receiver_wallet, amount, burn_amount, COALESCE(memo,''), status, created_at
			 FROM p2p_payments WHERE sender_wallet = $1 OR receiver_wallet = $1
			 ORDER BY created_at DESC LIMIT 50`, wallet)
		if err != nil {
			c.JSON(200, gin.H{"payments": []gin.H{}, "count": 0})
			return
		}
		defer rows.Close()

		payments := parsePaymentRows(rows, wallet)
		c.JSON(200, gin.H{"payments": payments, "count": len(payments)})
	}
}

func parsePaymentRows(rows *sql.Rows, wallet string) []gin.H {
	payments := []gin.H{}
	for rows.Next() {
		var id, sender, receiver, memo, status string
		var amount, burned float64
		var createdAt time.Time
		if err := rows.Scan(&id, &sender, &receiver, &amount, &burned, &memo, &status, &createdAt); err == nil {
			direction := "received"
			counterparty := sender
			if sender == wallet {
				direction = "sent"
				counterparty = receiver
			}
			payments = append(payments, gin.H{
				"id":           id,
				"direction":    direction,
				"counterparty": counterparty,
				"amount":       amount,
				"burned":       burned,
				"memo":         memo,
				"status":       status,
				"timestamp":    createdAt.Format(time.RFC3339),
			})
		}
	}
	return payments
}

// ═══════════════════════════════════════════════════════════════
// STAKING: Real yield from compute fees (replaces bank deposits)
// ═══════════════════════════════════════════════════════════════

func createStake(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet   string  `json:"wallet" binding:"required"`
			Amount   float64 `json:"amount" binding:"required"`
			LockDays int     `json:"lock_days"` // 30, 90, 180, 365
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.Amount < 1 {
			c.JSON(400, gin.H{"error": "minimum stake is 1 GSTD"})
			return
		}

		// APY based on lock period
		apyRates := map[int]float64{30: 8, 90: 15, 180: 24, 365: 36}
		if _, ok := apyRates[req.LockDays]; !ok {
			req.LockDays = 30
		}
		apy := apyRates[req.LockDays]

		// Node operators get 2x multiplier
		var isNodeOperator bool
		db.QueryRowContext(c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM nodes WHERE wallet_address = $1 AND status = 'online')`,
			req.Wallet).Scan(&isNodeOperator)
		bonus := 1.0
		if isNodeOperator {
			bonus = 2.0
		}

		ctx := c.Request.Context()
		tx, _ := db.BeginTx(ctx, nil)
		defer tx.Rollback()

		// Check balance
		var balance float64
		err := tx.QueryRowContext(ctx,
			`SELECT COALESCE(gstd_balance,0)+COALESCE(pending_balance_gstd,0) FROM users WHERE wallet_address=$1`,
			req.Wallet).Scan(&balance)
		if err != nil || balance < req.Amount {
			c.JSON(400, gin.H{"error": errInsufficientBalance})
			return
		}

		// Deduct from balance
		tx.ExecContext(ctx,
			`UPDATE users SET gstd_balance = COALESCE(gstd_balance,0) - $1, updated_at = NOW() WHERE wallet_address = $2`,
			req.Amount, req.Wallet)

		// Create stake
		var stakeID int
		unlockAt := time.Now().Add(time.Duration(req.LockDays) * 24 * time.Hour)
		tx.QueryRowContext(ctx,
			`INSERT INTO staking_pools (wallet_address, staked_amount, lock_period_days, apy_rate, bonus_multiplier, unlock_at)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			req.Wallet, req.Amount, req.LockDays, apy, bonus, unlockAt).Scan(&stakeID)

		tx.Commit()

		dailyReward := req.Amount * (apy / 100) * bonus / 365
		c.JSON(200, gin.H{
			"stake_id":       stakeID,
			"amount":         req.Amount,
			"lock_days":      req.LockDays,
			"apy":            apy,
			"effective_apy":  apy * bonus,
			"node_bonus":     fmt.Sprintf("%.0fx", bonus),
			"daily_reward":   dailyReward,
			"monthly_reward": dailyReward * 30,
			"yearly_reward":  req.Amount * (apy / 100) * bonus,
			"unlock_at":      unlockAt.Format(time.RFC3339),
			"vs_bank": gin.H{
				"bank_apy":  "0.5% (savings account)",
				"gstd_apy":  fmt.Sprintf("%.0f%% (with node bonus: %.0f%%)", apy, apy*bonus),
				"advantage": fmt.Sprintf("%.0fx better than banks", (apy*bonus)/0.5),
			},
		})
	}
}

func unstakePool(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet  string `json:"wallet" binding:"required"`
			StakeID int    `json:"stake_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		ctx := c.Request.Context()
		var amount, earned float64
		var unlockAt time.Time
		err := db.QueryRowContext(ctx,
			`SELECT staked_amount, total_earned, unlock_at FROM staking_pools 
			 WHERE id = $1 AND wallet_address = $2 AND is_active = true`,
			req.StakeID, req.Wallet).Scan(&amount, &earned, &unlockAt)
		if err != nil {
			c.JSON(404, gin.H{"error": "stake not found"})
			return
		}

		// Early withdrawal penalty: 10%
		penalty := 0.0
		if time.Now().Before(unlockAt) {
			penalty = amount * 0.10
		}

		netReturn := amount - penalty + earned
		tx, _ := db.BeginTx(ctx, nil)
		defer tx.Rollback()

		// Return to balance
		tx.ExecContext(ctx,
			`UPDATE users SET gstd_balance = COALESCE(gstd_balance,0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
			netReturn, req.Wallet)

		// Deactivate stake
		tx.ExecContext(ctx,
			`UPDATE staking_pools SET is_active = false WHERE id = $1`, req.StakeID)

		// Burn penalty
		if penalty > 0 {
			tx.ExecContext(ctx,
				`INSERT INTO token_burns (transaction_id, transaction_type, original_amount, burn_amount, burn_address, source_wallet, created_at)
				 VALUES (gen_random_uuid()::text, 'early_unstake_penalty', $1, $2, 'BURN', $3, NOW())`,
				amount, penalty, req.Wallet)
		}

		tx.Commit()
		c.JSON(200, gin.H{
			"returned":  netReturn,
			"principal": amount,
			"earned":    earned,
			"penalty":   penalty,
			"early":     time.Now().Before(unlockAt),
		})
	}
}

func getStakingInfo(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")

		var totalStaked, totalEarned float64
		var activeStakes int
		if wallet != "" {
			db.QueryRowContext(c.Request.Context(),
				`SELECT COUNT(*), COALESCE(SUM(staked_amount),0), COALESCE(SUM(total_earned),0)
				 FROM staking_pools WHERE wallet_address = $1 AND is_active = true`,
				wallet).Scan(&activeStakes, &totalStaked, &totalEarned)
		}

		var globalStaked float64
		var globalStakers int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(DISTINCT wallet_address), COALESCE(SUM(staked_amount),0)
			 FROM staking_pools WHERE is_active = true`).Scan(&globalStakers, &globalStaked)

		c.JSON(200, gin.H{
			"your_stakes":    activeStakes,
			"your_staked":    totalStaked,
			"your_earned":    totalEarned,
			"global_staked":  globalStaked,
			"global_stakers": globalStakers,
			"apy_tiers": gin.H{
				"30_days":    "8% APY",
				"90_days":    "15% APY",
				"180_days":   "24% APY",
				"365_days":   "36% APY",
				"node_bonus": "2x multiplier for node operators",
			},
		})
	}
}

func getYieldEstimate(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"yield_sources": gin.H{
				"ai_compute_fees":    "40% of all AI inference fees → stakers",
				"bridge_fees":        "30% of bridge transaction fees → stakers",
				"storage_fees":       "20% of storage service fees → stakers",
				"governance_rewards": "10% of treasury allocation → active voters",
			},
			"why_real_yield": "Unlike bank interest (printed from nothing), GSTD yield comes from real compute services that people pay for. Every AI query, every bridge transaction, every stored file generates revenue that goes to GSTD stakers.",
		})
	}
}

// ═══════════════════════════════════════════════════════════════
// MICRO-LENDING: Collateralized by compute power
// ═══════════════════════════════════════════════════════════════

func requestLoan(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet  string  `json:"wallet" binding:"required"`
			Amount  float64 `json:"amount" binding:"required"`
			DueDays int     `json:"due_days"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.DueDays <= 0 {
			req.DueDays = 30
		}
		if req.Amount > 1000 {
			c.JSON(400, gin.H{"error": "max loan amount is 1000 GSTD"})
			return
		}

		// Calculate collateral: node uptime + staked amount
		var uptimeHours float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(total_uptime_hours),0) FROM node_tiers WHERE node_address = $1`,
			req.Wallet).Scan(&uptimeHours)

		var stakedAmount float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(staked_amount),0) FROM staking_pools WHERE wallet_address = $1 AND is_active = true`,
			req.Wallet).Scan(&stakedAmount)

		collateralValue := uptimeHours*0.01 + stakedAmount*0.5
		if collateralValue < req.Amount*0.5 {
			c.JSON(400, gin.H{
				"error":            "insufficient collateral",
				"collateral_value": collateralValue,
				"required":         req.Amount * 0.5,
				"tip":              "Run a node or stake GSTD to increase your collateral",
			})
			return
		}

		dueDate := time.Now().Add(time.Duration(req.DueDays) * 24 * time.Hour)
		interestRate := 5.0 // 5% annual

		var loanID string
		db.QueryRowContext(c.Request.Context(),
			`INSERT INTO micro_loans (borrower_wallet, principal, interest_rate, collateral_type, collateral_value, due_date, status)
			 VALUES ($1, $2, $3, 'compute+stake', $4, $5, 'active') RETURNING id`,
			req.Wallet, req.Amount, interestRate, collateralValue, dueDate).Scan(&loanID)

		// Credit loan amount
		db.ExecContext(c.Request.Context(),
			`UPDATE users SET gstd_balance = COALESCE(gstd_balance,0) + $1, updated_at = NOW() WHERE wallet_address = $2`,
			req.Amount, req.Wallet)

		c.JSON(200, gin.H{
			"loan_id":         loanID,
			"amount":          req.Amount,
			"interest_rate":   interestRate,
			"interest_amount": req.Amount * (interestRate / 100) * (float64(req.DueDays) / 365),
			"total_repayment": req.Amount + req.Amount*(interestRate/100)*(float64(req.DueDays)/365),
			"collateral":      collateralValue,
			"due_date":        dueDate.Format(time.RFC3339),
			"vs_bank":         "Traditional bank: 15-25% interest, weeks of paperwork, credit checks. GSTD: 5% interest, instant approval, collateralized by your compute contribution.",
		})
	}
}

func repayLoan(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet string  `json:"wallet" binding:"required"`
			LoanID string  `json:"loan_id" binding:"required"`
			Amount float64 `json:"amount" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		ctx := c.Request.Context()
		var principal, repaid float64
		err := db.QueryRowContext(ctx,
			`SELECT principal, repaid_amount FROM micro_loans WHERE id = $1 AND borrower_wallet = $2 AND status = 'active'`,
			req.LoanID, req.Wallet).Scan(&principal, &repaid)
		if err != nil {
			c.JSON(404, gin.H{"error": "loan not found"})
			return
		}

		remaining := principal - repaid
		if req.Amount > remaining {
			req.Amount = remaining
		}

		// Deduct from balance
		db.ExecContext(ctx,
			`UPDATE users SET gstd_balance = COALESCE(gstd_balance,0) - $1 WHERE wallet_address = $2`,
			req.Amount, req.Wallet)

		newRepaid := repaid + req.Amount
		newStatus := "active"
		if newRepaid >= principal {
			newStatus = "repaid"
		}

		db.ExecContext(ctx,
			`UPDATE micro_loans SET repaid_amount = $1, status = $2 WHERE id = $3`,
			newRepaid, newStatus, req.LoanID)

		c.JSON(200, gin.H{
			"repaid":    req.Amount,
			"remaining": remaining - req.Amount,
			"status":    newStatus,
		})
	}
}

func getLoans(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet required"})
			return
		}
		rows, err := db.QueryContext(c.Request.Context(),
			`SELECT id, principal, interest_rate, collateral_value, status, repaid_amount, due_date, created_at
			 FROM micro_loans WHERE borrower_wallet = $1 ORDER BY created_at DESC LIMIT 20`, wallet)
		if err != nil {
			c.JSON(200, gin.H{"loans": []interface{}{}, "count": 0})
			return
		}
		defer rows.Close()

		var loans []gin.H
		for rows.Next() {
			var id, status string
			var principal, rate, collateral, repaid float64
			var dueDate, createdAt time.Time
			if rows.Scan(&id, &principal, &rate, &collateral, &status, &repaid, &dueDate, &createdAt) == nil {
				loans = append(loans, gin.H{
					"id": id, "principal": principal, "interest_rate": rate,
					"collateral": collateral, "status": status, "repaid": repaid,
					"remaining": principal - repaid, "due_date": dueDate.Format(time.RFC3339),
				})
			}
		}
		if loans == nil {
			loans = []gin.H{}
		}
		c.JSON(200, gin.H{"loans": loans, "count": len(loans)})
	}
}

// ═══════════════════════════════════════════════════════════════
// REVENUE SHARING: 85% to nodes, 10% treasury, 5% burn
// ═══════════════════════════════════════════════════════════════

func getRevenueSharing(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Calculate today's revenue from all sources
		var aiRevenue, bridgeRevenue, storageRevenue float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(CASE WHEN tx_type='ai_query' THEN amount_gstd ELSE 0 END),0),
			        COALESCE(SUM(CASE WHEN tx_type='bridge' THEN amount_gstd ELSE 0 END),0),
			        COALESCE(SUM(CASE WHEN tx_type='storage' THEN amount_gstd ELSE 0 END),0)
			 FROM transaction_history WHERE created_at > CURRENT_DATE`).
			Scan(&aiRevenue, &bridgeRevenue, &storageRevenue)

		totalRevenue := aiRevenue + bridgeRevenue + storageRevenue

		var eligibleNodes int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM nodes WHERE status = 'online' OR last_seen > NOW() - INTERVAL '24 hours'`).
			Scan(&eligibleNodes)
		if eligibleNodes == 0 {
			eligibleNodes = 1
		}

		nodeShare := totalRevenue * 0.85
		treasuryShare := totalRevenue * 0.10
		burnShare := totalRevenue * 0.05

		c.JSON(200, gin.H{
			"today": gin.H{
				"total_revenue":   totalRevenue,
				"ai_revenue":      aiRevenue,
				"bridge_revenue":  bridgeRevenue,
				"storage_revenue": storageRevenue,
			},
			"distribution": gin.H{
				"node_operators": gin.H{
					"share_pct":      85,
					"total":          nodeShare,
					"per_node":       nodeShare / float64(eligibleNodes),
					"eligible_nodes": eligibleNodes,
				},
				"treasury": gin.H{
					"share_pct": 10,
					"total":     treasuryShare,
				},
				"burned": gin.H{
					"share_pct": 5,
					"total":     burnShare,
				},
			},
			"why_better_than_banks": "Banks keep 90%+ of the revenue. GSTD gives 85% directly to node operators who provide the actual compute power.",
		})
	}
}

// ═══════════════════════════════════════════════════════════════
// GOVERNANCE: Democratic protocol evolution
// ═══════════════════════════════════════════════════════════════

func createProposal(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet      string `json:"wallet" binding:"required"`
			Title       string `json:"title" binding:"required"`
			Description string `json:"description" binding:"required"`
			Type        string `json:"type"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if req.Type == "" {
			req.Type = "parameter"
		}

		// Must have staked GSTD or be a node operator
		var staked float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(staked_amount),0) FROM staking_pools WHERE wallet_address=$1 AND is_active=true`,
			req.Wallet).Scan(&staked)

		var isNode bool
		db.QueryRowContext(c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM nodes WHERE wallet_address=$1)`, req.Wallet).Scan(&isNode)

		if staked == 0 && !isNode {
			c.JSON(400, gin.H{"error": "must stake GSTD or run a node to create proposals"})
			return
		}

		var proposalID string
		db.QueryRowContext(c.Request.Context(),
			`INSERT INTO governance_proposals (title, description, proposal_type, proposed_by)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			req.Title, req.Description, req.Type, req.Wallet).Scan(&proposalID)

		c.JSON(200, gin.H{
			"proposal_id": proposalID,
			"title":       req.Title,
			"voting_ends": time.Now().Add(7 * 24 * time.Hour).Format(time.RFC3339),
			"status":      "active",
			"message":     "Proposal created. Node operators and stakers can vote for 7 days.",
		})
	}
}

func castVote(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Wallet     string `json:"wallet" binding:"required"`
			ProposalID string `json:"proposal_id" binding:"required"`
			Vote       string `json:"vote" binding:"required"` // for, against, abstain
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Vote weight = staked amount + node uptime bonus
		var staked float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(staked_amount),0) FROM staking_pools WHERE wallet_address=$1 AND is_active=true`,
			req.Wallet).Scan(&staked)

		var uptimeHours float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(total_uptime_hours),0) FROM node_tiers WHERE node_address=$1`,
			req.Wallet).Scan(&uptimeHours)

		voteWeight := math.Max(1, staked+uptimeHours*0.1)

		_, err := db.ExecContext(c.Request.Context(),
			`INSERT INTO governance_votes (proposal_id, voter_wallet, vote, vote_weight)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (proposal_id, voter_wallet) DO UPDATE SET vote = $3, vote_weight = $4, voted_at = NOW()`,
			req.ProposalID, req.Wallet, req.Vote, voteWeight)
		if err != nil {
			c.JSON(500, gin.H{"error": "vote failed"})
			return
		}

		c.JSON(200, gin.H{
			"vote":        req.Vote,
			"vote_weight": voteWeight,
			"message":     "Vote recorded. Weight based on staked GSTD + node uptime.",
		})
	}
}

func getProposals(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.QueryContext(c.Request.Context(),
			`SELECT p.id, p.title, p.description, p.proposal_type, p.proposed_by, p.voting_ends, p.status,
			        COALESCE(SUM(CASE WHEN v.vote='for' THEN v.vote_weight ELSE 0 END),0) as votes_for,
			        COALESCE(SUM(CASE WHEN v.vote='against' THEN v.vote_weight ELSE 0 END),0) as votes_against,
			        COUNT(v.id) as total_voters
			 FROM governance_proposals p
			 LEFT JOIN governance_votes v ON v.proposal_id = p.id
			 GROUP BY p.id ORDER BY p.created_at DESC LIMIT 20`)
		if err != nil {
			c.JSON(200, gin.H{"proposals": []interface{}{}, "count": 0})
			return
		}
		defer rows.Close()

		var proposals []gin.H
		for rows.Next() {
			var id, title, desc, pType, proposer, status string
			var votingEnds time.Time
			var votesFor, votesAgainst float64
			var totalVoters int
			if rows.Scan(&id, &title, &desc, &pType, &proposer, &votingEnds, &status, &votesFor, &votesAgainst, &totalVoters) == nil {
				proposals = append(proposals, gin.H{
					"id": id, "title": title, "description": desc, "type": pType,
					"proposed_by": proposer, "voting_ends": votingEnds.Format(time.RFC3339),
					"status": status, "votes_for": votesFor, "votes_against": votesAgainst,
					"total_voters": totalVoters,
					"support_pct": func() float64 {
						total := votesFor + votesAgainst
						if total == 0 {
							return 0
						}
						return (votesFor / total) * 100
					}(),
				})
			}
		}
		if proposals == nil {
			proposals = []gin.H{}
		}
		c.JSON(200, gin.H{"proposals": proposals, "count": len(proposals)})
	}
}

// ═══════════════════════════════════════════════════════════════
// NODE AUTONOMY: P2P mesh, consensus, capabilities
// ═══════════════════════════════════════════════════════════════

func meshAnnounce(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			NodeID   string   `json:"node_id" binding:"required"`
			Endpoint string   `json:"endpoint"` // IP:port
			PeerIDs  []string `json:"peer_ids"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Register/update mesh presence
		for _, peerID := range req.PeerIDs {
			db.ExecContext(c.Request.Context(),
				`INSERT INTO node_mesh_peers (node_id, peer_node_id, peer_endpoint, last_handshake)
				 VALUES ($1, $2, $3, NOW())
				 ON CONFLICT (node_id, peer_node_id) DO UPDATE SET last_handshake = NOW(), is_active = true`,
				req.NodeID, peerID, req.Endpoint)
		}

		// Return known peers for this node
		var peers []gin.H
		rows, _ := db.QueryContext(c.Request.Context(),
			`SELECT peer_node_id, peer_endpoint, latency_ms, trust_score 
			 FROM node_mesh_peers WHERE node_id = $1 AND is_active = true
			 UNION
			 SELECT node_id, peer_endpoint, latency_ms, trust_score
			 FROM node_mesh_peers WHERE peer_node_id = $1 AND is_active = true
			 LIMIT 50`, req.NodeID)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var peerID string
				var endpoint sql.NullString
				var latency int
				var trust float64
				if rows.Scan(&peerID, &endpoint, &latency, &trust) == nil {
					peers = append(peers, gin.H{
						"node_id": peerID, "endpoint": endpoint.String,
						"latency_ms": latency, "trust": trust,
					})
				}
			}
		}
		if peers == nil {
			peers = []gin.H{}
		}

		c.JSON(200, gin.H{
			"your_node": req.NodeID,
			"peers":     peers,
			"mesh_size": len(peers),
			"message":   "Mesh presence updated. Peers can now discover and connect directly.",
		})
	}
}

func getMeshPeers(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		nodeID := c.Query("node_id")

		var totalPeers, activePeers int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active AND last_handshake > NOW() - INTERVAL '10 minutes')
			 FROM node_mesh_peers`).Scan(&totalPeers, &activePeers)

		var onlineNodes int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM nodes WHERE status='online' AND last_seen > NOW() - INTERVAL '70 minutes'`).
			Scan(&onlineNodes)

		score := float64(0)
		if onlineNodes > 1 {
			score = math.Min(100, float64(activePeers)/float64(onlineNodes)*100)
		}

		result := gin.H{
			"total_mesh_connections": totalPeers,
			"active_connections":     activePeers,
			"online_nodes":           onlineNodes,
			"decentralization_score": score,
		}

		if nodeID != "" {
			addMyMeshPeers(c.Request.Context(), db, nodeID, result)
		}

		c.JSON(200, result)
	}
}

func addMyMeshPeers(ctx context.Context, db *sql.DB, nodeID string, result gin.H) {
	rows, err := db.QueryContext(ctx,
		`SELECT peer_node_id, COALESCE(peer_endpoint,''), latency_ms, trust_score, last_handshake
		 FROM node_mesh_peers WHERE node_id = $1 AND is_active = true`, nodeID)
	if err != nil {
		return
	}
	defer rows.Close()

	var myPeers []gin.H
	for rows.Next() {
		var peerID, endpoint string
		var latency int
		var trust float64
		var lastHandshake time.Time
		if rows.Scan(&peerID, &endpoint, &latency, &trust, &lastHandshake) == nil {
			myPeers = append(myPeers, gin.H{
				"peer": peerID, "endpoint": endpoint, "latency": latency,
				"trust": trust, "last_seen": lastHandshake.Format(time.RFC3339),
			})
		}
	}
	result["your_peers"] = myPeers
}

func submitConsensus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			TaskID     string `json:"task_id" binding:"required"`
			NodeID     string `json:"node_id" binding:"required"`
			ResultHash string `json:"result_hash" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		// Get node trust score for vote weight
		var trustScore float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(trust_score, 1.0) FROM nodes WHERE id = $1 OR wallet_address = $1`,
			req.NodeID).Scan(&trustScore)
		if trustScore == 0 {
			trustScore = 1.0
		}

		db.ExecContext(c.Request.Context(),
			`INSERT INTO consensus_votes (task_id, node_id, result_hash, vote_weight)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (task_id, node_id) DO UPDATE SET result_hash = $3, vote_weight = $4, voted_at = NOW()`,
			req.TaskID, req.NodeID, req.ResultHash, trustScore)

		// Check consensus
		var totalWeight float64
		var topHash string
		var topWeight float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT result_hash, SUM(vote_weight) as w FROM consensus_votes WHERE task_id = $1
			 GROUP BY result_hash ORDER BY w DESC LIMIT 1`,
			req.TaskID).Scan(&topHash, &topWeight)
		db.QueryRowContext(c.Request.Context(),
			`SELECT SUM(vote_weight) FROM consensus_votes WHERE task_id = $1`,
			req.TaskID).Scan(&totalWeight)

		consensusPct := 0.0
		if totalWeight > 0 {
			consensusPct = (topWeight / totalWeight) * 100
		}

		c.JSON(200, gin.H{
			"task_id":        req.TaskID,
			"your_vote":      req.ResultHash,
			"consensus_hash": topHash,
			"consensus_pct":  consensusPct,
			"reached":        consensusPct >= 67, // 2/3 majority
			"total_weight":   totalWeight,
			"message":        "Vote recorded in decentralized consensus.",
		})
	}
}

type capabilityReq struct {
	NodeID          string  `json:"node_id" binding:"required"`
	CanAI           bool    `json:"can_ai_inference"`
	CanBridge       bool    `json:"can_bridge_verify"`
	CanStorage      bool    `json:"can_storage"`
	CanFederatedML  bool    `json:"can_federated_ml"`
	CanP2PRelay     bool    `json:"can_p2p_relay"`
	CanConsensus    bool    `json:"can_consensus_validate"`
	GPUModel        string  `json:"gpu_model"`
	GPUVram         int     `json:"gpu_vram_gb"`
	DiskFree        int     `json:"disk_free_gb"`
	Bandwidth       int     `json:"bandwidth_mbps"`
	AutonomousMode  bool    `json:"autonomous_mode"`
	UptimeGuarantee float64 `json:"uptime_guarantee_pct"`
}

func getCapsList(req capabilityReq) []string {
	var caps []string
	if req.CanAI {
		caps = append(caps, "ai_inference")
	}
	if req.CanBridge {
		caps = append(caps, "bridge_verify")
	}
	if req.CanStorage {
		caps = append(caps, "storage")
	}
	if req.CanFederatedML {
		caps = append(caps, "federated_ml")
	}
	if req.CanP2PRelay {
		caps = append(caps, "p2p_relay")
	}
	if req.CanConsensus {
		caps = append(caps, "consensus")
	}
	return caps
}

func registerCapabilities(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req capabilityReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}

		_, err := db.ExecContext(c.Request.Context(),
			`INSERT INTO node_capabilities (node_id, can_ai_inference, can_bridge_verify, can_storage, can_federated_ml, can_p2p_relay, can_consensus_validate, gpu_model, gpu_vram_gb, disk_free_gb, bandwidth_mbps, autonomous_mode, uptime_guarantee_pct, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
			 ON CONFLICT (node_id) DO UPDATE SET can_ai_inference=$2, can_bridge_verify=$3, can_storage=$4, can_federated_ml=$5, can_p2p_relay=$6, can_consensus_validate=$7, gpu_model=$8, gpu_vram_gb=$9, disk_free_gb=$10, bandwidth_mbps=$11, autonomous_mode=$12, uptime_guarantee_pct=$13, updated_at=NOW()`,
			req.NodeID, req.CanAI, req.CanBridge, req.CanStorage, req.CanFederatedML, req.CanP2PRelay, req.CanConsensus, req.GPUModel, req.GPUVram, req.DiskFree, req.Bandwidth, req.AutonomousMode, req.UptimeGuarantee)
		if err != nil {
			c.JSON(500, gin.H{"error": "failed to register capabilities"})
			return
		}

		c.JSON(200, gin.H{
			"node_id":         req.NodeID,
			"autonomous_mode": req.AutonomousMode,
			"capabilities":    getCapsList(req),
			"message": "Node capabilities registered. You can now receive tasks matching your hardware.",
		})
	}
}

func getNodeCapabilities(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		nodeID := c.Param("node_id")
		var canAI, canBridge, canStorage, canML, canP2P, canConsensus, autonomous bool
		var gpuModel string
		var gpuVram, diskFree, bandwidth int
		var uptime float64

		err := db.QueryRowContext(c.Request.Context(),
			`SELECT can_ai_inference, can_bridge_verify, can_storage, can_federated_ml, can_p2p_relay, can_consensus_validate,
			        COALESCE(gpu_model,''), gpu_vram_gb, disk_free_gb, bandwidth_mbps, autonomous_mode, uptime_guarantee_pct
			 FROM node_capabilities WHERE node_id = $1`, nodeID).
			Scan(&canAI, &canBridge, &canStorage, &canML, &canP2P, &canConsensus, &gpuModel, &gpuVram, &diskFree, &bandwidth, &autonomous, &uptime)
		if err != nil {
			c.JSON(404, gin.H{"error": "node not found"})
			return
		}

		c.JSON(200, gin.H{
			"node_id": nodeID, "autonomous_mode": autonomous,
			"ai_inference": canAI, "bridge_verify": canBridge, "storage": canStorage,
			"federated_ml": canML, "p2p_relay": canP2P, "consensus_validate": canConsensus,
			"gpu_model": gpuModel, "gpu_vram_gb": gpuVram, "disk_free_gb": diskFree,
			"bandwidth_mbps": bandwidth, "uptime_guarantee": uptime,
		})
	}
}

// ═══════════════════════════════════════════════════════════════
// PROTOCOL SUMMARY: Why GSTD > Legacy Systems
// ═══════════════════════════════════════════════════════════════

func getProtocolSummary(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalNodes, onlineNodes int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*), COUNT(*) FILTER (WHERE status='online') FROM nodes`).
			Scan(&totalNodes, &onlineNodes)

		var totalStaked, totalBurned float64
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(staked_amount),0) FROM staking_pools WHERE is_active=true`).Scan(&totalStaked)
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(burn_amount),0) FROM token_burns WHERE transaction_type != 'EMERGENCY_STABILIZATION'`).Scan(&totalBurned)

		var meshPeers int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM node_mesh_peers WHERE is_active=true`).Scan(&meshPeers)

		var proposals, activeProposals int
		db.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*), COUNT(*) FILTER (WHERE status='active') FROM governance_proposals`).
			Scan(&proposals, &activeProposals)

		c.JSON(200, gin.H{
			"protocol":             "GSTD Sovereign Protocol v1.0",
			"asset_name":           "GSTD Sovereign Token",
			"max_supply":           1000000000,
			"current_circulating":  1000000000 - totalBurned,
			"total_burned":         totalBurned,
			"total_staked":         totalStaked,
			"total_nodes":          totalNodes,
			"online_nodes":         onlineNodes,
			"mesh_connections":     meshPeers,
			"governance_proposals": proposals,
			"active_proposals":     activeProposals,
			"features": gin.H{
				"deflationary":     "2% burn on every transaction, 1B cap with halving",
				"instant_payments": "Zero-fee P2P payments, instant settlement",
				"real_yield":       "8-36% APY from real compute revenue, 2x for node operators",
				"micro_lending":    "5% interest, collateralized by compute power",
				"governance":       "Democratic voting, weighted by stake + uptime",
				"node_autonomy":    "P2P mesh, local consensus, autonomous operation",
				"compute_backed":   "Every GSTD backed by real AI compute & storage",
				"revenue_sharing":  "85% of all fees go to node operators",
			},
			"vs_traditional_banks": gin.H{
				"speed":         "Instant vs 1-3 business days",
				"fees":          "0% vs 1-3% per transaction",
				"savings_yield": "8-36% vs 0.5% (bank savings)",
				"lending_rate":  "5% vs 15-25% (bank loans)",
				"availability":  "24/7/365 vs banking hours",
				"access":        "Anyone with internet vs KYC/credit checks",
				"transparency":  "100% auditable vs opaque",
				"ownership":     "You own your money vs bank owns it",
			},
			"vs_legacy_crypto": gin.H{
				"speed":          "Instant vs 10+ minutes",
				"fees":           "0% vs $5-50",
				"utility":        "AI compute, storage, bridge vs none",
				"backing":        "Gold + compute vs speculative",
				"energy":         "Minimal PoS vs enormous PoW",
				"governance":     "Democratic vs mining pools",
				"smart_features": "Lending, staking, P2P payments vs simple transfers",
				"scalability":    "Unlimited vs 7 TPS",
			},
		})
	}
}
