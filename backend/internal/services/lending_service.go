package services

import (
	"database/sql"
	"math"
)

// LendingService calculates loan terms based on Gold Reserve backing
type LendingService struct {
	db *sql.DB
}

type LoanOffer struct {
	CollateralGSTD float64 `json:"collateral_gstd"`
	LoanAmountUSD  float64 `json:"loan_amount_usd"`
	LTV            float64 `json:"ltv_percent"`
	InterestRate   float64 `json:"interest_rate_annual"`
	GoldPrice      float64 `json:"gold_price_usd"`
}

func NewLendingService(db *sql.DB) *LendingService {
	return &LendingService{db: db}
}

// CalculateLoanTerms returns the loan terms for a given GSTD collateral
// Standard: 60% LTV, 1.5% APR (Gold Liquidity Anchor)
func (s *LendingService) CalculateLoanTerms(gstdAmount float64) (*LoanOffer, error) {
	// 1. Get current Gold Price (implied from Reserve Log or constant/mock for MVP if oracle down)
	// Ideally we get this from PoolMonitorService or DB
	// For "Maximum Entropy", we use the latest logged value from DB
	
	// Fetch latest reserve stats to determine GSTD price
	// Price of GSTD = (Total Gold Reserve * Gold Price) / Total GSTD Supply
	// Simplified: We assume 1 GSTD ~= 1 XAUt for simplicity or use the pool ratio
	
	// Real implementation: Fetch from golden_reserve_log
	// If empty, fallback to safe defaults for calculation
	goldPriceUSD := 2350.00 // Standard XAUt/Gold price reference
	
	// Calculate GSTD Value
	// In a real DePIN, GSTD value is algorithmic. Here we assume 1 GSTD = 1 USD for calculation baseline if no market data
	// OR use the pool ratio if available. 
	gstdPriceUSD := 1.0 // Placeholder if no pool data found
	
	// Apply "The Golden Rule": LTV 60%
	ltv := 0.60
	apr := 1.5 // 1.5% Annual
	
	maxLoanUSD := gstdAmount * gstdPriceUSD * ltv
	
	return &LoanOffer{
		CollateralGSTD: gstdAmount,
		LoanAmountUSD:  math.Floor(maxLoanUSD*100) / 100,
		LTV:            ltv * 100,
		InterestRate:   apr,
		GoldPrice:      goldPriceUSD,
	}, nil
}
