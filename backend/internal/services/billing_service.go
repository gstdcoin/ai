package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"time"
)

// BillingService provides wallet balance and earnings for Financial API
type BillingService struct {
	db         *sql.DB
	settlement *SettlementService
	poolMon    *PoolMonitorService
	escrow     *EscrowService
}

// WalletBalance holds earnings in GSTD and XAUt equivalent
type WalletBalance struct {
	WalletAddress  string  `json:"wallet_address"`
	EarnedGSTD     float64 `json:"earned_gstd"`
	XAUtEquivalent float64 `json:"xaut_equivalent"`
	XAUtPriceUSD   float64 `json:"xaut_price_usd"`
}

// NewBillingService creates the billing service
func NewBillingService(db *sql.DB, settlement *SettlementService, poolMon *PoolMonitorService, escrow *EscrowService) *BillingService {
	return &BillingService{
		db:         db,
		settlement: settlement,
		poolMon:    poolMon,
		escrow:     escrow,
	}
}

// GetWalletBalance returns earned GSTD and XAUt equivalent for a wallet
func (s *BillingService) GetWalletBalance(ctx context.Context, wallet string) (*WalletBalance, error) {
	earned := 0.0

	// From settlement_ledger (proxy inference)
	if s.settlement != nil {
		e, _ := s.settlement.GetWalletEarnings(ctx, wallet)
		earned += e
	}

	// From transaction_history (worker_payout)
	if s.db != nil {
		var txEarned float64
		_ = s.db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(amount_gstd), 0) FROM transaction_history
			WHERE to_wallet = $1 AND tx_type = 'worker_payout'
		`, wallet).Scan(&txEarned)
		earned += txEarned
	}

	xautPrice := 2350.0
	if s.poolMon != nil {
		xautPrice = s.poolMon.GetXAUtPriceUSD()
	}

	// Real GSTD price from pool; equivalent = earned_gstd * gstd_usd / xaut_usd
	var gstdPriceUSD float64
	if s.poolMon != nil {
		if p, err := s.poolMon.GetGSTDPriceUSD(context.Background()); err == nil && p > 0 {
			gstdPriceUSD = p
		}
	}
	xautEquivalent := 0.0
	if xautPrice > 0 && gstdPriceUSD > 0 {
		xautEquivalent = (earned * gstdPriceUSD) / xautPrice
	}

	return &WalletBalance{
		WalletAddress:  wallet,
		EarnedGSTD:     earned,
		XAUtEquivalent: xautEquivalent,
		XAUtPriceUSD:   xautPrice,
	}, nil
}

// GetWalletTransactions returns recent Escrow 2.0 transactions for Golden Gateway
func (s *BillingService) GetWalletTransactions(ctx context.Context, wallet string, limit int) ([]TransactionRecord, error) {
	if s.escrow == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 30
	}
	return s.escrow.GetTransactionHistory(ctx, wallet, limit)
}

// 5% goes to Protocol Fund, rest is burned or treasury (For now, just logs and deducts)
func (s *BillingService) ProcessSkillPurchase(ctx context.Context, wallet string, skillName string, price float64) error {
	if price <= 0 {
		return nil
	}

	// 1. Check virtual balance (earned_gstd)
	balance, err := s.GetWalletBalance(ctx, wallet)
	if err != nil {
		return err
	}
	if balance.EarnedGSTD < price {
		return errors.New("insufficient earned balance to purchase skill")
	}

	// 2. Log Transaction
	txID := fmt.Sprintf("skill-%s-%d", skillName, time.Now().Unix())
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO transaction_history (transaction_id, from_wallet, to_wallet, amount_gstd, tx_type, details)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, txID, wallet, "protocol", price, "skill_purchase", skillName)
	if err != nil {
		return err
	}

	// 3. Monetization: Divert 5% to Protocol Fund
	protocolFee := price * 0.05
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('protocol_fund', $1)
		ON CONFLICT (fund_type) DO UPDATE SET balance_gstd = platform_funds.balance_gstd + EXCLUDED.balance_gstd
	`, protocolFee)

	log.Printf("[Billing] Skill Purchase: %s bought %s for %.2f GSTD. (Fee: %.2f)", wallet, skillName, price, protocolFee)
	return nil
}
