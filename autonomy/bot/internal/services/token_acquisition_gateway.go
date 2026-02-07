package services

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// TokenAcquisitionGateway provides ultra-simple ways for users and agents to get GSTD tokens
type TokenAcquisitionGateway struct {
	mu             sync.RWMutex
	db             *sql.DB
	faucetEnabled  bool
	faucetAmount   float64
	faucetCooldown time.Duration
	claimHistory   map[string]time.Time
	taskPool       *SimpleTaskPool
	referralBonus  float64
}

// SimpleTaskPool provides easy tasks that anyone can complete for tokens
type SimpleTaskPool struct {
	tasks []SimpleTask
}

// SimpleTask is a super-easy task that even beginners can complete
type SimpleTask struct {
	ID           string  `json:"id"`
	Type         string  `json:"type"`         // captcha, survey, share, feedback, translate
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	RewardGSTD   float64 `json:"reward_gstd"`
	TimeEstimate string  `json:"time_estimate"` // "30 seconds", "2 minutes"
	Difficulty   string  `json:"difficulty"`    // beginner, easy
	Available    bool    `json:"available"`
}

// FaucetClaim represents a token faucet claim
type FaucetClaim struct {
	WalletAddress string    `json:"wallet_address"`
	Amount        float64   `json:"amount"`
	Type          string    `json:"type"` // daily, welcome, referral, task
	ClaimedAt     time.Time `json:"claimed_at"`
}

func NewTokenAcquisitionGateway(db *sql.DB) *TokenAcquisitionGateway {
	gateway := &TokenAcquisitionGateway{
		db:             db,
		faucetEnabled:  true,
		faucetAmount:   0.1,                  // Free tokens per claim
		faucetCooldown: 24 * time.Hour,       // Once per day
		claimHistory:   make(map[string]time.Time),
		referralBonus:  1.0,                  // Bonus for referring
		taskPool: &SimpleTaskPool{
			tasks: generateSimpleTasks(),
		},
	}

	return gateway
}

// ClaimWelcomeBonus gives free tokens to new users
func (g *TokenAcquisitionGateway) ClaimWelcomeBonus(ctx context.Context, walletAddress string) (*FaucetClaim, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Check if already claimed
	claimed, err := g.hasClaimedWelcome(ctx, walletAddress)
	if err != nil {
		return nil, err
	}
	if claimed {
		return nil, fmt.Errorf("welcome bonus already claimed")
	}

	// Credit tokens
	welcomeAmount := 1.0 // 1 GSTD welcome bonus
	claim := &FaucetClaim{
		WalletAddress: walletAddress,
		Amount:        welcomeAmount,
		Type:          "welcome",
		ClaimedAt:     time.Now(),
	}

	if err := g.creditTokens(ctx, claim); err != nil {
		return nil, err
	}

	log.Printf("🎁 Welcome bonus claimed: %s -> %.4f GSTD", walletAddress[:10], welcomeAmount)
	return claim, nil
}

// ClaimDailyFaucet provides daily free tokens
func (g *TokenAcquisitionGateway) ClaimDailyFaucet(ctx context.Context, walletAddress string) (*FaucetClaim, error) {
	if !g.faucetEnabled {
		return nil, fmt.Errorf("faucet is disabled")
	}

	g.mu.Lock()
	defer g.mu.Unlock()

	// Check cooldown
	lastClaim, exists := g.claimHistory[walletAddress]
	if exists && time.Since(lastClaim) < g.faucetCooldown {
		remaining := g.faucetCooldown - time.Since(lastClaim)
		return nil, fmt.Errorf("please wait %v before claiming again", remaining.Round(time.Minute))
	}

	claim := &FaucetClaim{
		WalletAddress: walletAddress,
		Amount:        g.faucetAmount,
		Type:          "daily",
		ClaimedAt:     time.Now(),
	}

	if err := g.creditTokens(ctx, claim); err != nil {
		return nil, err
	}

	g.claimHistory[walletAddress] = time.Now()
	log.Printf("💧 Daily faucet claimed: %s -> %.4f GSTD", walletAddress[:10], g.faucetAmount)
	return claim, nil
}

// GetAvailableTasks returns simple tasks anyone can complete
func (g *TokenAcquisitionGateway) GetAvailableTasks() []SimpleTask {
	var available []SimpleTask
	for _, task := range g.taskPool.tasks {
		if task.Available {
			available = append(available, task)
		}
	}
	return available
}

// CompleteSimpleTask marks a simple task as complete and rewards user
func (g *TokenAcquisitionGateway) CompleteSimpleTask(ctx context.Context, walletAddress, taskID string, response interface{}) (*FaucetClaim, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Find task
	var task *SimpleTask
	for i := range g.taskPool.tasks {
		if g.taskPool.tasks[i].ID == taskID {
			task = &g.taskPool.tasks[i]
			break
		}
	}

	if task == nil {
		return nil, fmt.Errorf("task not found")
	}

	// Validate response based on task type
	if !g.validateTaskResponse(task, response) {
		return nil, fmt.Errorf("invalid response")
	}

	// Credit reward
	claim := &FaucetClaim{
		WalletAddress: walletAddress,
		Amount:        task.RewardGSTD,
		Type:          "task",
		ClaimedAt:     time.Now(),
	}

	if err := g.creditTokens(ctx, claim); err != nil {
		return nil, err
	}

	log.Printf("✅ Task completed: %s -> %.4f GSTD for '%s'", walletAddress[:10], task.RewardGSTD, task.Title)
	return claim, nil
}

// ClaimReferralBonus rewards users for inviting others
func (g *TokenAcquisitionGateway) ClaimReferralBonus(ctx context.Context, referrerWallet, newUserWallet string) (*FaucetClaim, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Validate both wallets exist
	if referrerWallet == "" || newUserWallet == "" {
		return nil, fmt.Errorf("invalid wallet addresses")
	}

	// Credit referrer
	claim := &FaucetClaim{
		WalletAddress: referrerWallet,
		Amount:        g.referralBonus,
		Type:          "referral",
		ClaimedAt:     time.Now(),
	}

	if err := g.creditTokens(ctx, claim); err != nil {
		return nil, err
	}

	log.Printf("🎯 Referral bonus: %s invited %s -> %.4f GSTD", referrerWallet[:10], newUserWallet[:10], g.referralBonus)
	return claim, nil
}

// AgentQuickStart provides tokens to new AI agents to bootstrap them
func (g *TokenAcquisitionGateway) AgentQuickStart(ctx context.Context, agentWallet, agentName string, capabilities []string) (*FaucetClaim, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Check if agent already bootstrapped
	key := "agent_bootstrap_" + agentWallet
	if _, exists := g.claimHistory[key]; exists {
		return nil, fmt.Errorf("agent already bootstrapped")
	}

	// Calculate bootstrap amount based on capabilities
	baseAmount := 0.5 // Base bootstrap
	capBonus := float64(len(capabilities)) * 0.1
	totalAmount := baseAmount + capBonus

	claim := &FaucetClaim{
		WalletAddress: agentWallet,
		Amount:        totalAmount,
		Type:          "agent_bootstrap",
		ClaimedAt:     time.Now(),
	}

	if err := g.creditTokens(ctx, claim); err != nil {
		return nil, err
	}

	g.claimHistory[key] = time.Now()
	log.Printf("🤖 Agent bootstrapped: %s (%s) -> %.4f GSTD", agentName, agentWallet[:10], totalAmount)
	return claim, nil
}

// GetQuickBuyLink returns a simple link for humans to buy GSTD
func (g *TokenAcquisitionGateway) GetQuickBuyLink(amount float64) string {
	// STON.fi DEX link for easy swap
	return fmt.Sprintf("https://app.ston.fi/swap?ft=TON&tt=GSTD&ta=%.2f", amount)
}

// GetEarnWithoutMoneyGuide returns guide for earning without investment
func (g *TokenAcquisitionGateway) GetEarnWithoutMoneyGuide() map[string]interface{} {
	return map[string]interface{}{
		"title": "🆓 Get GSTD Tokens for FREE",
		"methods": []map[string]interface{}{
			{
				"name":        "Welcome Bonus",
				"reward":      "1.0 GSTD",
				"description": "Connect your wallet and receive instant tokens",
				"difficulty":  "instant",
			},
			{
				"name":        "Daily Faucet",
				"reward":      "0.1 GSTD",
				"description": "Claim free tokens every 24 hours",
				"difficulty":  "instant",
			},
			{
				"name":        "Complete Simple Tasks",
				"reward":      "0.05-0.5 GSTD",
				"description": "Answer surveys, share content, provide feedback",
				"difficulty":  "30 seconds - 5 minutes",
			},
			{
				"name":        "Invite Friends",
				"reward":      "1.0 GSTD per friend",
				"description": "Share your referral link and earn when friends join",
				"difficulty":  "easy",
			},
			{
				"name":        "Become a Worker",
				"reward":      "Unlimited",
				"description": "Register your device as a worker node and earn from tasks",
				"difficulty":  "5 minute setup",
			},
		},
		"agent_methods": []map[string]interface{}{
			{
				"name":        "Agent Bootstrap",
				"reward":      "0.5-1.0 GSTD",
				"description": "New AI agents receive startup tokens automatically",
				"difficulty":  "instant",
			},
			{
				"name":        "Task Execution",
				"reward":      "Variable",
				"description": "Execute tasks from the network and earn rewards",
				"difficulty":  "automatic",
			},
		},
	}
}

func (g *TokenAcquisitionGateway) hasClaimedWelcome(ctx context.Context, wallet string) (bool, error) {
	if g.db == nil {
		// In-memory fallback
		_, exists := g.claimHistory["welcome_"+wallet]
		return exists, nil
	}

	var count int
	err := g.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM faucet_claims WHERE wallet_address = $1 AND type = 'welcome'",
		wallet).Scan(&count)
	return count > 0, err
}

func (g *TokenAcquisitionGateway) creditTokens(ctx context.Context, claim *FaucetClaim) error {
	if g.db == nil {
		// In-memory mode - just log
		g.claimHistory[claim.Type+"_"+claim.WalletAddress] = claim.ClaimedAt
		return nil
	}

	// Insert claim record
	_, err := g.db.ExecContext(ctx,
		`INSERT INTO faucet_claims (wallet_address, amount, type, claimed_at) 
		 VALUES ($1, $2, $3, $4)`,
		claim.WalletAddress, claim.Amount, claim.Type, claim.ClaimedAt)
	if err != nil {
		return err
	}

	// Update or insert balance
	_, err = g.db.ExecContext(ctx,
		`INSERT INTO balances (wallet_address, balance, updated_at) 
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (wallet_address) 
		 DO UPDATE SET balance = balances.balance + $2, updated_at = NOW()`,
		claim.WalletAddress, claim.Amount)

	return err
}

func (g *TokenAcquisitionGateway) validateTaskResponse(task *SimpleTask, response interface{}) bool {
	// Simple validation - in production would be more sophisticated
	switch task.Type {
	case "captcha":
		// Response should be a solved captcha
		return response != nil
	case "survey":
		// Response should have answers
		return response != nil
	case "share":
		// Response should have proof of sharing
		return response != nil
	case "feedback":
		// Any feedback is valid
		str, ok := response.(string)
		return ok && len(str) > 10
	default:
		return true
	}
}

func generateSimpleTasks() []SimpleTask {
	return []SimpleTask{
		{
			ID:           generateTaskID(),
			Type:         "survey",
			Title:        "Quick Survey",
			Description:  "Answer 3 simple questions about AI",
			RewardGSTD:   0.1,
			TimeEstimate: "30 seconds",
			Difficulty:   "beginner",
			Available:    true,
		},
		{
			ID:           generateTaskID(),
			Type:         "feedback",
			Title:        "Platform Feedback",
			Description:  "Tell us what you think about GSTD",
			RewardGSTD:   0.2,
			TimeEstimate: "1 minute",
			Difficulty:   "beginner",
			Available:    true,
		},
		{
			ID:           generateTaskID(),
			Type:         "share",
			Title:        "Share on Social Media",
			Description:  "Share GSTD on Twitter/X and earn",
			RewardGSTD:   0.5,
			TimeEstimate: "2 minutes",
			Difficulty:   "easy",
			Available:    true,
		},
		{
			ID:           generateTaskID(),
			Type:         "captcha",
			Title:        "Solve Captcha",
			Description:  "Help train AI by solving a captcha",
			RewardGSTD:   0.05,
			TimeEstimate: "10 seconds",
			Difficulty:   "beginner",
			Available:    true,
		},
		{
			ID:           generateTaskID(),
			Type:         "translate",
			Title:        "Quick Translation",
			Description:  "Translate a short sentence",
			RewardGSTD:   0.15,
			TimeEstimate: "1 minute",
			Difficulty:   "easy",
			Available:    true,
		},
	}
}

func generateTaskID() string {
	bytes := make([]byte, 8)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// GetStats returns gateway statistics
func (g *TokenAcquisitionGateway) GetStats() map[string]interface{} {
	g.mu.RLock()
	defer g.mu.RUnlock()

	return map[string]interface{}{
		"faucet_enabled":  g.faucetEnabled,
		"faucet_amount":   g.faucetAmount,
		"referral_bonus":  g.referralBonus,
		"available_tasks": len(g.taskPool.tasks),
		"total_claims":    len(g.claimHistory),
	}
}
