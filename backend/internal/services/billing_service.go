package services

import (
	"context"
	"database/sql"
)

// BillingService provides wallet balance and earnings for Financial API
type BillingService struct {
	db        *sql.DB
	settlement *SettlementService
	poolMon   *PoolMonitorService
	escrow    *EscrowService
}

// WalletBalance holds earnings in GSTD and XAUt equivalent
type WalletBalance struct {
	WalletAddress string  `json:"wallet_address"`
	EarnedGSTD    float64 `json:"earned_gstd"`
	XAUtEquivalent float64 `json:"xaut_equivalent"`
	XAUtPriceUSD  float64 `json:"xaut_price_usd"`
}

// NewBillingService creates the billing service
func NewBillingService(db *sql.DB, settlement *SettlementService, poolMon *PoolMonitorService, escrow *EscrowService) *BillingService {
	return &BillingService{
		db:        db,
		settlement: settlement,
		poolMon:   poolMon,
		escrow:    escrow,
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
