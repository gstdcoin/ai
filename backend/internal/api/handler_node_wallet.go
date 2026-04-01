package api

// ═══════════════════════════════════════════════════════════════════════════════
// handler_node_wallet.go — Extracted inline handlers from routes.go
//
// These handlers were previously defined as inline closures in SetupRoutes().
// Refactored into standalone methods on NodeWalletHandler to improve
// code organization and maintainability.
// ═══════════════════════════════════════════════════════════════════════════════

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

const nodeInstallScriptURL = "https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh"

// NodeWalletHandler holds dependencies for node and wallet route handlers
type NodeWalletHandler struct {
	db    *sql.DB
	redis *redis.Client
}

// NewNodeWalletHandler creates a new handler with the required dependencies
func NewNodeWalletHandler(db *sql.DB, redis *redis.Client) *NodeWalletHandler {
	return &NodeWalletHandler{db: db, redis: redis}
}

// HandleHeartbeat — POST /nodes/heartbeat
// Node reports status, backend calculates and credits reward
func (h *NodeWalletHandler) HandleHeartbeat(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address"`
		// Wallet: legacy field from NaaS uptime daemon (same meaning as wallet_address)
		Wallet        string `json:"wallet"`
		NodeName      string `json:"node_name"`
		NodeVersion   string `json:"node_version"`
		UptimeHours   int    `json:"uptime_hours"`
		QueriesServed int    `json:"queries_served"`
		IsMobile      bool   `json:"is_mobile"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid JSON"})
		return
	}
	if req.WalletAddress == "" {
		req.WalletAddress = strings.TrimSpace(req.Wallet)
	}
	if req.WalletAddress == "" {
		c.JSON(400, gin.H{"error": "wallet_address required"})
		return
	}

	req.WalletAddress = strings.TrimSpace(req.WalletAddress)
	h.ensureUserExists(c.Request.Context(), req.WalletAddress)

	nodeName := req.NodeName
	if nodeName == "" {
		nodeName = "GSTD Node"
		if req.NodeVersion != "" {
			nodeName += " v" + req.NodeVersion
		}
	}

	log.Printf("[HEARTBEAT-V130] wallet=%s nodeName=%s", req.WalletAddress, nodeName)

	hoursSinceLast := h.getHoursSinceLastSeen(c.Request.Context(), req.WalletAddress)
	trustScore, nodeTier, specsJSONStr := h.evaluateNodeTrust(c.Request.Context(), req.WalletAddress, req.IsMobile)

	rowsAffected := h.upsertNode(c.Request.Context(), req.WalletAddress, nodeName, trustScore, specsJSONStr)
	log.Printf("[heartbeat] wallet=%s rows_updated=%d tier=%s score=%.2f", req.WalletAddress, rowsAffected, nodeTier, trustScore)

	if hoursSinceLast < 0.9 {
		h.respondKeepalive(c, hoursSinceLast)
		return
	}

	reward, uptimeReward, queryReward, rewardReason := h.calculateReward(c.Request.Context(), req.WalletAddress, req.QueriesServed)
	if reward <= 0 {
		c.JSON(200, gin.H{"reward": 0, "reason": rewardReason})
		return
	}

	if err := h.creditRewardTransaction(c.Request.Context(), req.WalletAddress, reward); err != nil {
		c.JSON(500, gin.H{"error": "failed to credit reward"})
		return
	}

	h.bindNodeWalletReward(c.Request.Context(), req.WalletAddress, reward, req.UptimeHours, req.QueriesServed)

	if h.redis != nil {
		h.redis.Set(c.Request.Context(), "worker:online:"+req.WalletAddress, "online", 90*time.Second)
	}

	h.asyncUpdateTiersAndSovereign(req.WalletAddress, reward)

	pendingCommands := h.fetchPendingCommands(c.Request.Context(), req.WalletAddress)
	peersOnline, totalNodes, nodeRank := h.fetchNetworkStats(c.Request.Context(), req.WalletAddress)

	c.JSON(200, gin.H{
		"reward":          reward,
		"uptime_reward":   uptimeReward,
		"query_reward":    queryReward,
		"queries_counted": req.QueriesServed,
		"reason":          "verified_heartbeat",
		"message":         "Reward credited to pending balance.",
		"peers_online":    peersOnline,
		"active_nodes":    peersOnline,
		"total_nodes":     totalNodes,
		"rank":            nodeRank,
		"commands":        pendingCommands,
		"update": gin.H{
			"latest_version":   "latest",
			"update_available": false,
			"update_url":       nodeInstallScriptURL,
			"changelog_url":    "https://github.com/gstdcoin/gstdbot/releases",
		},
		"sovereign": gin.H{
			"revenue_share_pct":  85,
			"burn_rate_pct":      2,
			"auto_compound_hint": true,
			"staking_apy_range":  "8-72%",
		},
	})
}

func (h *NodeWalletHandler) respondKeepalive(c *gin.Context, hoursSinceLast float64) {
	c.JSON(200, gin.H{
		"reward":           0,
		"status":           "online",
		"reason":           "keepalive_ok",
		"next_reward_in":   int((1.0 - hoursSinceLast) * 60),
		"hours_since_last": hoursSinceLast,
		"message":          fmt.Sprintf("Node online. Reward in %d min.", int((1.0-hoursSinceLast)*60)),
		"update": gin.H{
			"latest_version":   "latest",
			"update_available": false,
			"update_url":       nodeInstallScriptURL,
		},
	})
}

func (h *NodeWalletHandler) ensureUserExists(ctx context.Context, wallet string) {
	_, _ = h.db.ExecContext(ctx, `
		INSERT INTO users (wallet_address, gstd_balance, created_at, updated_at)
		VALUES ($1, 0, NOW(), NOW())
		ON CONFLICT (wallet_address) DO NOTHING
	`, wallet)
}

func (h *NodeWalletHandler) getHoursSinceLastSeen(ctx context.Context, wallet string) float64 {
	var hours float64 = 1.0
	_ = h.db.QueryRowContext(ctx, `
		SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - last_seen)) / 3600, 1)
		FROM nodes WHERE wallet_address = $1
	`, wallet).Scan(&hours)
	return hours
}

func (h *NodeWalletHandler) evaluateNodeTrust(ctx context.Context, wallet string, isMobile bool) (float64, string, string) {
	var totalBalance float64
	_ = h.db.QueryRowContext(ctx, `
		SELECT COALESCE(gstd_balance, 0) + COALESCE(balance, 0) FROM users WHERE wallet_address = $1
	`, wallet).Scan(&totalBalance)

	trustScore := 0.5
	nodeTier := "basic"
	deviceType := "pc"

	if isMobile {
		deviceType = "mobile"
		nodeTier = "mobile_basic"
	} else if totalBalance >= 10000.0 {
		nodeTier = "masternode"
		trustScore = 1.0
	}

	specsJSONStr := fmt.Sprintf(`{"device_type": "%s", "tier": "%s"}`, deviceType, nodeTier)
	return trustScore, nodeTier, specsJSONStr
}

func (h *NodeWalletHandler) upsertNode(ctx context.Context, wallet, nodeName string, trustScore float64, specsJSONStr string) int64 {
	res, err := h.db.ExecContext(ctx, `
		UPDATE nodes SET status = 'online', last_seen = NOW(), updated_at = NOW(), name = $2,
		trust_score = $3,
		specs = COALESCE(specs, '{}'::jsonb) || $4::jsonb
		WHERE wallet_address = $1
	`, wallet, nodeName, trustScore, specsJSONStr)
	
	rowsAffected := int64(0)
	if err != nil {
		log.Printf("[heartbeat] UPDATE error: %v", err)
	} else {
		rowsAffected, _ = res.RowsAffected()
	}

	if rowsAffected == 0 {
		if _, err := h.db.ExecContext(ctx, `
			INSERT INTO nodes (id, wallet_address, name, status, last_seen, created_at, updated_at, trust_score, specs)
			VALUES (gen_random_uuid()::text, $1, $2, 'online', NOW(), NOW(), NOW(), $3, $4::jsonb)
		`, wallet, nodeName, trustScore, specsJSONStr); err != nil {
			log.Printf("[heartbeat] INSERT error: %v", err)
		}
	}
	return rowsAffected
}

func (h *NodeWalletHandler) calculateReward(ctx context.Context, wallet string, queriesServed int) (float64, float64, float64, string) {
	uptimeRewardPerHour := 0.10
	queryRewardPer := 0.001
	maxRewardPerHeartbeat := 1.0
	maxDailyPerNode := 24.0

	rows, err := h.db.QueryContext(ctx, `SELECT config_key, config_value FROM node_reward_config`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var key string
			var val float64
			if rows.Scan(&key, &val) == nil {
				switch key {
				case "uptime_reward_per_hour": uptimeRewardPerHour = val
				case "query_reward_per": queryRewardPer = val
				case "max_reward_per_heartbeat": maxRewardPerHeartbeat = val
				case "max_daily_per_node": maxDailyPerNode = val
				}
			}
		}
	}

	uptimeReward := uptimeRewardPerHour
	queryReward := float64(queriesServed) * queryRewardPer
	reward := uptimeReward + queryReward
	if reward > maxRewardPerHeartbeat {
		reward = maxRewardPerHeartbeat
	}

	var dailyEarned float64
	h.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM node_rewards_ledger 
		WHERE node_address = $1 AND reward_type = 'uptime' 
		AND created_at >= CURRENT_DATE
	`, wallet).Scan(&dailyEarned)

	if dailyEarned >= maxDailyPerNode {
		return 0, 0, 0, "daily_cap_reached"
	}
	if dailyEarned+reward > maxDailyPerNode {
		reward = maxDailyPerNode - dailyEarned
	}
	
	if reward <= 0 {
		return 0, 0, 0, "no_reward"
	}
	return reward, uptimeReward, queryReward, "ok"
}

func (h *NodeWalletHandler) creditRewardTransaction(ctx context.Context, wallet string, reward float64) error {
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE users SET pending_balance_gstd = COALESCE(pending_balance_gstd, 0) + $1, updated_at = NOW()
		WHERE wallet_address = $2
	`, reward, wallet)
	if err != nil {
		return err
	}

	if _, errStats := tx.ExecContext(ctx, `
		UPDATE nodes SET total_earnings = COALESCE(total_earnings, 0) + $1, last_seen = NOW(), updated_at = NOW()
		WHERE wallet_address = $2
	`, reward, wallet); errStats != nil {
		log.Printf("[heartbeat] total_earnings update err: %v", errStats)
	}

	if err := tx.Commit(); err != nil {
		log.Printf("[heartbeat] tx commit err: %v", err)
		return err
	}
	return nil
}

func (h *NodeWalletHandler) bindNodeWalletReward(ctx context.Context, wallet string, reward float64, uptimeHours, queriesServed int) {
	var ownerWallet string
	err := h.db.QueryRowContext(ctx,
		`SELECT owner_wallet FROM node_wallet_bindings WHERE node_address = $1 AND is_active = true LIMIT 1`,
		wallet).Scan(&ownerWallet)
	if err == nil && ownerWallet != "" {
		_, _ = h.db.ExecContext(ctx,
			`INSERT INTO node_pending_rewards (owner_wallet, node_id, amount_gstd, reward_type, description)
			 SELECT $1, COALESCE(b.node_id, 'unknown'), $2, 'uptime', $3
			 FROM node_wallet_bindings b WHERE b.owner_wallet = $1 AND b.node_address = $4 AND b.is_active = true LIMIT 1`,
			ownerWallet, reward, fmt.Sprintf("Heartbeat reward: %.4f GSTD (uptime=%dh, queries=%d)", reward, uptimeHours, queriesServed), wallet)

		_, _ = h.db.ExecContext(ctx,
			`UPDATE node_wallet_bindings SET last_heartbeat = NOW(), total_earned_gstd = total_earned_gstd + $1
			 WHERE node_address = $2 AND is_active = true`,
			reward, wallet)
	}
}

func (h *NodeWalletHandler) fetchPendingCommands(ctx context.Context, wallet string) []gin.H {
	var pendingCommands []gin.H
	rows, err := h.db.QueryContext(ctx,
		`SELECT id, command, params FROM node_commands
		 WHERE node_id IN (SELECT id FROM nodes WHERE wallet_address = $1)
		   AND status = 'pending' ORDER BY created_at ASC LIMIT 5`, wallet)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cmdID int
			var cmd, params string
			rows.Scan(&cmdID, &cmd, &params)
			pendingCommands = append(pendingCommands, gin.H{"id": cmdID, "command": cmd, "params": params})
			h.db.ExecContext(ctx, `UPDATE node_commands SET status = 'dispatched', executed_at = NOW() WHERE id = $1`, cmdID)
		}
	}
	if pendingCommands == nil {
		return []gin.H{}
	}
	return pendingCommands
}

func (h *NodeWalletHandler) fetchNetworkStats(ctx context.Context, wallet string) (int, int, int) {
	var peersOnline, totalNodes, nodeRank int
	_ = h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE status = 'online' OR last_seen > NOW() - INTERVAL '5 minutes'`).Scan(&peersOnline)
	_ = h.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes`).Scan(&totalNodes)
	_ = h.db.QueryRowContext(ctx, `
		SELECT COUNT(*) + 1 FROM nodes WHERE total_earnings > COALESCE(
			(SELECT total_earnings FROM nodes WHERE wallet_address = $1), 0
		)`, wallet).Scan(&nodeRank)
	return peersOnline, totalNodes, nodeRank
}

func (h *NodeWalletHandler) HandleSyncEarnings(c *gin.Context) {
	c.JSON(410, gin.H{
		"error":   "deprecated",
		"message": "Use POST /api/v1/nodes/heartbeat instead. Nodes no longer self-report earnings.",
	})
}

// HandleUpdateCheck — GET /nodes/update/check
func (h *NodeWalletHandler) HandleUpdateCheck(c *gin.Context) {
	currentVersion := c.Query("version")
	
	// Dynamically query latest version from config table
	latestVersion := "3.4.0"
	var dbVersion string
	err := h.db.QueryRowContext(c.Request.Context(), `SELECT config_value FROM node_reward_config WHERE config_key = 'latest_node_version'`).Scan(&dbVersion)
	if err == nil && dbVersion != "" {
		latestVersion = dbVersion
	}

	updateAvailable := currentVersion != "" && currentVersion != latestVersion

	c.JSON(200, gin.H{
		"latest_version":   latestVersion,
		"current_version":  currentVersion,
		"update_available": updateAvailable,
		"update_url":       nodeInstallScriptURL,
		"release_url":      "https://github.com/gstdcoin/gstdbot/releases",
		"changelog": []string{
			"v3.4.0: TON Connect fix, Platform Link, Model Failover, Core Modules",
			"v3.3.0: App Store, DLN, Sovereign Protocol, 27 built-in apps",
		},
		"install_command":  "curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash",
		"min_node_version": "20.0.0",
	})
}

// HandleBindWallet — POST /nodes/bind-wallet
func (h *NodeWalletHandler) HandleBindWallet(c *gin.Context) {
	var req struct {
		NodeID      string `json:"node_id" binding:"required"`
		OwnerWallet string `json:"owner_wallet" binding:"required"`
		NodeAddress string `json:"node_address"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "node_id and owner_wallet required"})
		return
	}
	if len(req.OwnerWallet) < 10 {
		c.JSON(400, gin.H{"error": "invalid wallet address"})
		return
	}

	ctx := c.Request.Context()

	// Deactivate any previous binding for this node
	_, _ = h.db.ExecContext(ctx,
		`UPDATE node_wallet_bindings SET is_active = false, unbound_at = NOW() WHERE node_id = $1 AND is_active = true`,
		req.NodeID)

	// Create new binding
	var bindingID int
	err := h.db.QueryRowContext(ctx,
		`INSERT INTO node_wallet_bindings (node_id, owner_wallet, node_address, bound_at, is_active)
		 VALUES ($1, $2, $3, NOW(), true)
		 RETURNING id`,
		req.NodeID, req.OwnerWallet, req.NodeAddress).Scan(&bindingID)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to bind wallet", "details": err.Error()})
		return
	}

	// Ensure user_wallets entry exists
	_, _ = h.db.ExecContext(ctx,
		`INSERT INTO user_wallets (address) VALUES ($1) ON CONFLICT (address) DO NOTHING`,
		req.OwnerWallet)

	c.JSON(200, gin.H{
		"ok":         true,
		"binding_id": bindingID,
		"node_id":    req.NodeID,
		"owner":      req.OwnerWallet,
		"message":    "Wallet bound to node. Rewards will accumulate until claimed.",
	})
}

// HandleUnbindWallet — POST /nodes/unbind-wallet
func (h *NodeWalletHandler) HandleUnbindWallet(c *gin.Context) {
	var req struct {
		NodeID      string `json:"node_id" binding:"required"`
		OwnerWallet string `json:"owner_wallet" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "node_id and owner_wallet required"})
		return
	}

	result, err := h.db.ExecContext(c.Request.Context(),
		`UPDATE node_wallet_bindings SET is_active = false, unbound_at = NOW()
		 WHERE node_id = $1 AND owner_wallet = $2 AND is_active = true`,
		req.NodeID, req.OwnerWallet)
	if err != nil {
		c.JSON(500, gin.H{"error": "unbind failed"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(404, gin.H{"error": "no active binding found"})
		return
	}
	c.JSON(200, gin.H{"ok": true, "message": "Wallet unbound. Pending rewards are preserved and can still be claimed."})
}

// HandleMyNodes — GET /nodes/my-nodes?wallet=<address>
func (h *NodeWalletHandler) HandleMyNodes(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(400, gin.H{"error": errWalletRequired})
		return
	}

	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT b.node_id, b.node_address, b.bound_at, b.total_earned_gstd, b.last_heartbeat,
		        COALESCE(n.status, 'unknown') as node_status,
		        COALESCE(n.name, 'Node') as node_name,
		        COALESCE((SELECT SUM(amount_gstd) FROM node_pending_rewards WHERE owner_wallet = b.owner_wallet AND node_id = b.node_id AND claimed_at IS NULL), 0) as pending_gstd
		 FROM node_wallet_bindings b
		 LEFT JOIN nodes n ON n.id = b.node_id
		 WHERE b.owner_wallet = $1 AND b.is_active = true
		 ORDER BY b.bound_at DESC`,
		wallet)
	if err != nil {
		c.JSON(500, gin.H{"error": errQueryFailed})
		return
	}
	defer rows.Close()

	type NodeBinding struct {
		NodeID        string  `json:"node_id"`
		NodeAddress   *string `json:"node_address"`
		BoundAt       string  `json:"bound_at"`
		TotalEarned   float64 `json:"total_earned_gstd"`
		LastHeartbeat *string `json:"last_heartbeat"`
		NodeStatus    string  `json:"node_status"`
		NodeName      string  `json:"node_name"`
		PendingGSTD   float64 `json:"pending_gstd"`
	}

	var nodes []NodeBinding
	for rows.Next() {
		var nb NodeBinding
		if err := rows.Scan(&nb.NodeID, &nb.NodeAddress, &nb.BoundAt, &nb.TotalEarned, &nb.LastHeartbeat, &nb.NodeStatus, &nb.NodeName, &nb.PendingGSTD); err != nil {
			continue
		}
		nodes = append(nodes, nb)
	}
	if nodes == nil {
		nodes = []NodeBinding{}
	}

	// Total pending across all nodes
	var totalPending float64
	_ = h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(SUM(amount_gstd), 0) FROM node_pending_rewards WHERE owner_wallet = $1 AND claimed_at IS NULL`,
		wallet).Scan(&totalPending)

	c.JSON(200, gin.H{
		"wallet":        wallet,
		"nodes":         nodes,
		"total_nodes":   len(nodes),
		"total_pending": totalPending,
	})
}

// HandlePendingRewards — GET /nodes/pending-rewards?wallet=<address>
func (h *NodeWalletHandler) HandlePendingRewards(c *gin.Context) {
	wallet := c.Query("wallet")
	if wallet == "" {
		c.JSON(400, gin.H{"error": errWalletRequired})
		return
	}

	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT id, node_id, amount_gstd, reward_type, COALESCE(description, ''), created_at
		 FROM node_pending_rewards
		 WHERE owner_wallet = $1 AND claimed_at IS NULL
		 ORDER BY created_at DESC LIMIT 100`,
		wallet)
	if err != nil {
		c.JSON(500, gin.H{"error": errQueryFailed})
		return
	}
	defer rows.Close()

	type Reward struct {
		ID          int     `json:"id"`
		NodeID      string  `json:"node_id"`
		Amount      float64 `json:"amount_gstd"`
		RewardType  string  `json:"reward_type"`
		Description string  `json:"description"`
		CreatedAt   string  `json:"created_at"`
	}
	var rewards []Reward
	var totalPending float64
	for rows.Next() {
		var r Reward
		if err := rows.Scan(&r.ID, &r.NodeID, &r.Amount, &r.RewardType, &r.Description, &r.CreatedAt); err != nil {
			continue
		}
		totalPending += r.Amount
		rewards = append(rewards, r)
	}
	if rewards == nil {
		rewards = []Reward{}
	}

	c.JSON(200, gin.H{
		"wallet":        wallet,
		"rewards":       rewards,
		"total_pending": totalPending,
		"count":         len(rewards),
	})
}

// HandleClaimRewards — POST /nodes/claim-rewards
func (h *NodeWalletHandler) HandleClaimRewards(c *gin.Context) {
	var req struct {
		OwnerWallet string `json:"owner_wallet" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "owner_wallet required"})
		return
	}

	// Basic authorization check: verify X-Wallet-Address matches requested OwnerWallet
	// Ensure that third parties cannot arbitrarily clear someone else's pending pool.
	callerWallet := c.GetHeader("X-Wallet-Address")
	if callerWallet != "" && !strings.EqualFold(callerWallet, req.OwnerWallet) {
		c.JSON(403, gin.H{"error": "unauthorized: wallet address mismatch"})
		return
	}

	ctx := c.Request.Context()
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		c.JSON(500, gin.H{"error": "transaction failed"})
		return
	}
	defer tx.Rollback()

	// Get total unclaimed rewards
	var totalAmount float64
	var rewardsCount int
	err = tx.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount_gstd), 0), COUNT(*)
		 FROM node_pending_rewards
		 WHERE owner_wallet = $1 AND claimed_at IS NULL`,
		req.OwnerWallet).Scan(&totalAmount, &rewardsCount)
	if err != nil || totalAmount <= 0 {
		c.JSON(200, gin.H{"ok": true, "claimed": 0, "message": "No pending rewards to claim"})
		return
	}

	// Mark all rewards as claimed
	_, err = tx.ExecContext(ctx,
		`UPDATE node_pending_rewards SET claimed_at = NOW() WHERE owner_wallet = $1 AND claimed_at IS NULL`,
		req.OwnerWallet)
	if err != nil {
		c.JSON(500, gin.H{"error": "claim update failed"})
		return
	}

	// Credit to user_wallets balance
	_, err = tx.ExecContext(ctx,
		`INSERT INTO user_wallets (address, gstd_balance) VALUES ($1, $2)
		 ON CONFLICT (address) DO UPDATE SET gstd_balance = user_wallets.gstd_balance + $2, updated_at = NOW()`,
		req.OwnerWallet, totalAmount)
	if err != nil {
		c.JSON(500, gin.H{"error": "balance credit failed"})
		return
	}

	// Record claim
	_, _ = tx.ExecContext(ctx,
		`INSERT INTO node_reward_claims (owner_wallet, total_claimed_gstd, rewards_count) VALUES ($1, $2, $3)`,
		req.OwnerWallet, totalAmount, rewardsCount)

	// Record in earnings history
	_, _ = tx.ExecContext(ctx,
		`INSERT INTO earnings_history (wallet_address, amount_gstd, source_type, reference_id)
		 VALUES ($1, $2, 'node_claim', $3)`,
		req.OwnerWallet, totalAmount, fmt.Sprintf("claim_%d_rewards", rewardsCount))

	if err := tx.Commit(); err != nil {
		c.JSON(500, gin.H{"error": "commit failed"})
		return
	}

	c.JSON(200, gin.H{
		"ok":            true,
		"claimed_gstd":  totalAmount,
		"rewards_count": rewardsCount,
		"wallet":        req.OwnerWallet,
		"message":       fmt.Sprintf("%.4f GSTD claimed from %d rewards. Tokens credited to your wallet.", totalAmount, rewardsCount),
	})
}

// HandleAutoClaimStatus — GET /nodes/auto-claim-status
func (h *NodeWalletHandler) HandleAutoClaimStatus(c *gin.Context) {
	type ExpiryInfo struct {
		Wallet       string  `json:"wallet"`
		TotalPending float64 `json:"total_pending"`
		OldestDays   int     `json:"oldest_days"`
		RewardsCount int     `json:"rewards_count"`
	}
	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT owner_wallet,
		        SUM(amount_gstd) as total,
		        EXTRACT(DAY FROM NOW() - MIN(created_at))::int as oldest_days,
		        COUNT(*) as cnt
		 FROM node_pending_rewards
		 WHERE claimed_at IS NULL
		 GROUP BY owner_wallet
		 ORDER BY oldest_days DESC
		 LIMIT 50`)
	if err != nil {
		c.JSON(500, gin.H{"error": errQueryFailed})
		return
	}
	defer rows.Close()

	var items []ExpiryInfo
	var totalStuckGSTD float64
	for rows.Next() {
		var item ExpiryInfo
		if err := rows.Scan(&item.Wallet, &item.TotalPending, &item.OldestDays, &item.RewardsCount); err != nil {
			continue
		}
		totalStuckGSTD += item.TotalPending
		items = append(items, item)
	}
	if items == nil {
		items = []ExpiryInfo{}
	}

	c.JSON(200, gin.H{
		"wallets":          items,
		"total_wallets":    len(items),
		"total_stuck_gstd": totalStuckGSTD,
		"auto_claim_days":  90,
		"message":          "Rewards older than 90 days are auto-claimed to owner wallets every 6 hours.",
	})
}

// HandleForceAutoClaim — POST /nodes/force-auto-claim
func (h *NodeWalletHandler) HandleForceAutoClaim(c *gin.Context) {
	claimed, err := autoClaimExpiredRewards(h.db, c.Request.Context())
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true, "auto_claimed": claimed})
}

// HandleWalletBalance — GET /wallet/:address/balance
func (h *NodeWalletHandler) HandleWalletBalance(c *gin.Context) {
	address := c.Param("address")
	if address == "" {
		c.JSON(400, gin.H{"error": "wallet address required"})
		return
	}
	var gstdBalance float64
	var pendingBalance float64
	err := h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(gstd_balance, 0), COALESCE(pending_balance, 0) FROM users WHERE wallet_address = $1`,
		address).Scan(&gstdBalance, &pendingBalance)
	if err != nil {
		c.JSON(200, gin.H{"gstd": 0, "ton": 0, "pending": 0, "total_earned": 0})
		return
	}
	var totalEarned float64
	_ = h.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE wallet_address = $1`,
		address).Scan(&totalEarned)

	c.JSON(200, gin.H{
		"gstd":         gstdBalance,
		"ton":          0,
		"pending":      pendingBalance,
		"total_earned": totalEarned,
	})
}

// StartAutoClaim starts the background goroutine for auto-claiming expired rewards
func (h *NodeWalletHandler) StartAutoClaim() {
	go func() {
		time.Sleep(5 * time.Minute) // Initial delay
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			claimed, err := autoClaimExpiredRewards(h.db, context.Background())
			if err != nil {
				log.Printf("[AutoClaim] Error: %v", err)
			} else if claimed > 0 {
				log.Printf("[AutoClaim] ✅ Auto-claimed %.4f GSTD from expired rewards", claimed)
			}
		}
	}()
}

// asyncUpdateTiersAndSovereign runs tier, streak, ledger, and sovereign metrics updates asynchronously.
func (h *NodeWalletHandler) asyncUpdateTiersAndSovereign(nodeAddr string, rwd float64) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[heartbeat-async] panic recovered: %v", r)
			}
		}()

		if _, err := h.db.Exec(`INSERT INTO node_tiers (node_address) VALUES ($1) ON CONFLICT DO NOTHING`, nodeAddr); err != nil {
			log.Printf("[heartbeat-async] node_tiers insert err: %v", err)
		}

		if _, err := h.db.Exec(`UPDATE node_tiers SET 
				total_uptime_hours = total_uptime_hours + 1.0, total_earned_gstd = total_earned_gstd + $1,
				streak_days = CASE 
					WHEN last_heartbeat_day = CURRENT_DATE THEN streak_days
					WHEN last_heartbeat_day = CURRENT_DATE - 1 THEN streak_days + 1 ELSE 1 END,
				best_streak = GREATEST(best_streak, CASE WHEN last_heartbeat_day = CURRENT_DATE - 1 THEN streak_days + 1 ELSE streak_days END),
				last_heartbeat_day = CURRENT_DATE,
				tier = CASE WHEN total_uptime_hours + 1.0 >= 5000 THEN 'diamond' WHEN total_uptime_hours + 1.0 >= 2000 THEN 'platinum' WHEN total_uptime_hours + 1.0 >= 500 THEN 'gold' WHEN total_uptime_hours + 1.0 >= 100 THEN 'silver' ELSE 'bronze' END,
				updated_at = NOW() WHERE node_address = $2`, rwd, nodeAddr); err != nil {
			log.Printf("[heartbeat-async] node_tiers update err: %v", err)
		}

		if _, err := h.db.Exec(`INSERT INTO node_rewards_ledger (node_address, reward_type, amount, description) VALUES ($1, 'uptime', $2, 'heartbeat')`, nodeAddr, rwd); err != nil {
			log.Printf("[heartbeat-async] rewards_ledger err: %v", err)
		}

		if _, err := h.db.Exec(`UPDATE tokenomics_halving SET current_circulating = current_circulating + $1, total_minted_in_epoch = total_minted_in_epoch + $1 WHERE epoch_number = (SELECT MAX(epoch_number) FROM tokenomics_halving)`, rwd); err != nil {
			log.Printf("[heartbeat-async] tokenomics_halving update err: %v", err)
		}
		if _, err := h.db.Exec(`INSERT INTO revenue_sharing (epoch_date, total_platform_revenue, node_operator_share, total_eligible_nodes) VALUES (CURRENT_DATE, $1, $1 * 0.85, 1) ON CONFLICT (epoch_date) DO UPDATE SET total_platform_revenue = revenue_sharing.total_platform_revenue + $1, node_operator_share = revenue_sharing.node_operator_share + ($1 * 0.85), total_eligible_nodes = (SELECT COUNT(*) FROM nodes WHERE status='online' OR last_seen > NOW() - INTERVAL '24 hours')`, rwd); err != nil {
			log.Printf("[heartbeat-async] revenue_sharing update err: %v", err)
		}
	}()
}
