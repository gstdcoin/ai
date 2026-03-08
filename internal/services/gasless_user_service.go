package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
)

// Gasless User Protocol:
// 1. Subsidized Onboarding: First 5000 users get gas for wallet linking from Protocol_Fund (5%)
// 2. Highload Batching: Payouts batched (min 50 workers per tx) — documented for Highload V2/V3
// 3. Internal Swap: User gives GSTD → we send TON for gas

const (
	gaslessSubsidyLimit    = 5000
	gaslessSubsidyTonNano  = 50_000_000 // 0.05 TON
	internalSwapMinGSTD    = 0.1
	internalSwapTonPerGSTD = 0.02 // ~0.02 TON per 1 GSTD (adjust by market)
	payoutBatchMinWorkers  = 50
)

// GaslessUserService implements the Gasless User protocol
type GaslessUserService struct {
	db        *sql.DB
	tonWallet *TONWalletService
	mu        sync.RWMutex
}

// NewGaslessUserService creates the service
func NewGaslessUserService(db *sql.DB) *GaslessUserService {
	return &GaslessUserService{db: db}
}

// SetTONWallet wires TON wallet for sending (optional; uses PlatformWalletAddress + PrivateKey)
func (s *GaslessUserService) SetTONWallet(w *TONWalletService) {
	s.tonWallet = w
}

// TrySubsidizeOnboarding sends 0.05 TON to new user for gas if < 5000 subsidized and protocol_fund has balance
func (s *GaslessUserService) TrySubsidizeOnboarding(ctx context.Context, walletAddress string) (sent bool, err error) {
	if s.db == nil || walletAddress == "" {
		return false, nil
	}

	// 1. Check if already subsidized
	var exists int
	if s.db.QueryRowContext(ctx, `SELECT 1 FROM gasless_subsidies WHERE wallet_address = $1`, walletAddress).Scan(&exists) == nil {
		return false, nil
	}

	// 2. Count subsidized users
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM gasless_subsidies`).Scan(&count); err != nil {
		return false, err
	}
	if count >= gaslessSubsidyLimit {
		return false, nil
	}

	// 3. Check protocol_fund has GSTD (we convert notionally — protocol fund pays for gas)
	var protocolBalance float64
	if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd, 0) FROM platform_funds WHERE fund_type = 'protocol_fund'`).Scan(&protocolBalance); err != nil {
		return false, err
	}
	if protocolBalance < 0.01 {
		return false, nil
	}

	// 4. Send TON (requires platform wallet with TON)
	if s.tonWallet == nil {
		log.Printf("[Gasless] Subsidy skipped for %s: TON wallet not configured", walletAddress[:16])
		return false, nil
	}

	txHash, err := s.tonWallet.SendTON(ctx, walletAddress, gaslessSubsidyTonNano, "GSTD Gasless Onboarding")
	if err != nil {
		log.Printf("[Gasless] Subsidy failed for %s: %v", walletAddress[:16], err)
		return false, err
	}

	// 5. Record subsidy
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO gasless_subsidies (wallet_address, ton_amount_nano, tx_hash) VALUES ($1, $2, $3)
		ON CONFLICT (wallet_address) DO NOTHING
	`, walletAddress, gaslessSubsidyTonNano, txHash)
	if err != nil {
		return true, err // sent but record failed
	}

	// 6. Deduct from protocol_fund (notional — we spent TON, protocol fund is GSTD; track separately)
	_, _ = s.db.ExecContext(ctx, `
		UPDATE platform_funds SET balance_gstd = balance_gstd - 0.01 WHERE fund_type = 'protocol_fund' AND balance_gstd >= 0.01
	`)

	log.Printf("[Gasless] Subsidized onboarding: 0.05 TON to %s (tx: %s)", walletAddress[:16], txHash)
	return true, nil
}

// InternalSwap allows user to exchange GSTD for TON (for gas)
func (s *GaslessUserService) InternalSwap(ctx context.Context, walletAddress string, gstdAmount float64) (tonNano int64, txHash string, err error) {
	if s.db == nil || gstdAmount < internalSwapMinGSTD {
		return 0, "", fmt.Errorf("minimum %.2f GSTD required", internalSwapMinGSTD)
	}

	// 1. Deduct GSTD from user (balance + gstd_balance)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, "", err
	}
	defer tx.Rollback()

	var bal, gstd float64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(balance, 0), COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1 FOR UPDATE`, walletAddress).Scan(&bal, &gstd); err != nil {
		return 0, "", fmt.Errorf("user not found")
	}
	if bal+gstd < gstdAmount {
		return 0, "", fmt.Errorf("insufficient GSTD balance (have %.4f)", bal+gstd)
	}
	if bal >= gstdAmount {
		_, _ = tx.ExecContext(ctx, `UPDATE users SET balance = balance - $1 WHERE wallet_address = $2`, gstdAmount, walletAddress)
	} else {
		remainder := gstdAmount - bal
		_, _ = tx.ExecContext(ctx, `UPDATE users SET balance = 0, gstd_balance = GREATEST(0, COALESCE(gstd_balance, 0) - $1) WHERE wallet_address = $2`, remainder, walletAddress)
	}
	if err := tx.Commit(); err != nil {
		return 0, "", err
	}

	// 2. Calculate TON to send
	tonNano = int64(gstdAmount * internalSwapTonPerGSTD * 1e9)
	if tonNano < 10_000_000 {
		tonNano = 10_000_000 // min 0.01 TON
	}

	// 3. Send TON from platform reserve
	if s.tonWallet == nil {
		// Refund: restore to balance (simplified - we deducted from balance or gstd_balance)
		s.db.ExecContext(ctx, `UPDATE users SET balance = COALESCE(balance, 0) + $1 WHERE wallet_address = $2`, gstdAmount, walletAddress)
		return 0, "", fmt.Errorf("internal swap temporarily unavailable")
	}

	txHash, err = s.tonWallet.SendTON(ctx, walletAddress, tonNano, "GSTD→TON Gas Swap")
	if err != nil {
		// Refund on failure
		s.db.ExecContext(ctx, `UPDATE users SET balance = COALESCE(balance, 0) + $1 WHERE wallet_address = $2`, gstdAmount, walletAddress)
		return 0, "", err
	}

	// 4. Record swap
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO internal_swaps (wallet_address, gstd_amount, ton_amount_nano, tx_hash) VALUES ($1, $2, $3, $4)
	`, walletAddress, gstdAmount, tonNano, txHash)

	// 5. Credit protocol_fund with GSTD (we received GSTD, user got TON)
	_, _ = s.db.ExecContext(ctx, `
		UPDATE platform_funds SET balance_gstd = balance_gstd + $1 WHERE fund_type = 'protocol_fund'
	`, gstdAmount)

	log.Printf("[Gasless] Internal Swap: %s gave %.4f GSTD, received %.6f TON (tx: %s)", walletAddress[:16], gstdAmount, float64(tonNano)/1e9, txHash)
	return tonNano, txHash, nil
}

// GetSubsidyCount returns number of users who received gas subsidy
func (s *GaslessUserService) GetSubsidyCount(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM gasless_subsidies`).Scan(&n)
	return n, err
}
