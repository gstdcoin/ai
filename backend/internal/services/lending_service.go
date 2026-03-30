package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"time"
)

// ═══════════════════════════════════════════════════════════════
// LENDING SERVICE — Gold-Backed Credit Lines
//
// Users deposit GSTD as collateral and borrow stablecoins against
// their gold-backed holdings.
//
// Key mechanics:
//   - Collateral Ratio (CR) = collateral_usd / debt_usdt
//   - Health Factor (HF) = CR / liquidation_threshold
//   - If HF < 1.0, position is liquidatable
//   - Safety fund covers bad debt from liquidation shortfalls
// ═══════════════════════════════════════════════════════════════

// TelegramNotifier allows sending messages to users via Telegram
type TelegramNotifier interface {
	SendMessageToChat(ctx context.Context, chatID string, message string) error
}

type LendingService struct {
	db               *sql.DB
	poolMonitor      *PoolMonitorService
	telegramNotifier TelegramNotifier
	lastAlertSent    map[string]time.Time // wallet -> last alert time (prevent spam)
	hlWallet         *HighloadWalletService
	lendingMaster    string
	// Oracle tracking
	oracleLastPush      time.Time
	oracleLastGSTDPrice float64
	oracleLastGoldPrice float64
	oraclePushCount     int64
}

func (s *LendingService) SetPoolMonitor(pm *PoolMonitorService) {
	s.poolMonitor = pm
}

func (s *LendingService) SetTelegramNotifier(tn TelegramNotifier) {
	s.telegramNotifier = tn
}

func (s *LendingService) SetHighloadWallet(hl *HighloadWalletService, lendingMasterAddr string) {
	s.hlWallet = hl
	s.lendingMaster = lendingMasterAddr
}

// StartOracleKeeper continuously pushes price updates to LendingMaster
func (s *LendingService) StartOracleKeeper(ctx context.Context, interval time.Duration) {
	if s.hlWallet == nil || s.lendingMaster == "" {
		log.Println("[Lending Oracle] Highload wallet or LendingMaster not configured. Oracle keeper disabled.")
		return
	}

	log.Printf("[Lending Oracle] Keeper started. Pushing price updates every %v", interval)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Perform first update immediately
	s.pushOracleUpdate(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("[Lending Oracle] Keeper stopped.")
			return
		case <-ticker.C:
			s.pushOracleUpdate(ctx)
		}
	}
}

func (s *LendingService) pushOracleUpdate(ctx context.Context) {
	// 1. Get GSTD Price
	gstdPrice := s.getGSTDPrice(ctx)
	if gstdPrice <= 0 {
		log.Println("[Lending Oracle] Cannot push update: GSTD price is invalid")
		return
	}

	// 2. Get Gold Price
	goldPrice := s.fetchExternalGSTDPrice() * 1000000.0 // we revert the division by 1M
	if goldPrice <= 0 {
		if s.poolMonitor != nil {
			goldPrice = s.poolMonitor.GetXAUtPriceUSD()
		}
		if goldPrice <= 0 {
			goldPrice = 2800.0 // Safe fallback
		}
	}

	// 3. Send update
	_, err := s.hlWallet.SignAndSendOracleUpdate(ctx, s.lendingMaster, gstdPrice, goldPrice)
	if err != nil {
		log.Printf("[Lending Oracle] Error sending update: %v", err)
		return
	}

	// Track successful push
	s.oracleLastPush = time.Now()
	s.oracleLastGSTDPrice = gstdPrice
	s.oracleLastGoldPrice = goldPrice
	s.oraclePushCount++
	log.Printf("[Lending Oracle] ✅ Push #%d — GSTD=$%.8f Gold=$%.2f", s.oraclePushCount, gstdPrice, goldPrice)
}

// LoanOffer — legacy type preserved for backward compatibility
type LoanOffer struct {
	CollateralGSTD float64 `json:"collateral_gstd"`
	LoanAmountUSD  float64 `json:"loan_amount_usd"`
	LTV            float64 `json:"ltv_percent"`
	InterestRate   float64 `json:"interest_rate_annual"`
	GoldPrice      float64 `json:"gold_price_usd"`
}

// LendingConfig mirrors lending_config table
type LendingConfig struct {
	MinCollateralRatio   float64 `json:"min_collateral_ratio"`
	LiquidationThreshold float64 `json:"liquidation_threshold"`
	LiquidationPenalty   float64 `json:"liquidation_penalty"`
	MaxBorrowAPR         float64 `json:"max_borrow_apr"`
	MinBorrowAPR         float64 `json:"min_borrow_apr"`
	SafetyFundFeePct     float64 `json:"safety_fund_fee_pct"`
	MaxLTV               float64 `json:"max_ltv"`
	MinDepositGSTD       float64 `json:"min_deposit_gstd"`
	Enabled              bool    `json:"enabled"`
}

// VaultPosition represents a user's lending vault
type VaultPosition struct {
	ID                   int64    `json:"id"`
	WalletAddress        string   `json:"wallet_address"`
	CollateralGSTD       float64  `json:"collateral_gstd"`
	CollateralUSD        float64  `json:"collateral_usd"`
	DebtUSDT             float64  `json:"debt_usdt"`
	CollateralRatio      float64  `json:"collateral_ratio"`
	HealthFactor         float64  `json:"health_factor"`
	BorrowAPR            float64  `json:"borrow_apr"`
	AccruedInterest      float64  `json:"accrued_interest"`
	Status               string   `json:"status"`
	LiquidationThreshold float64  `json:"liquidation_threshold"`
	AutoRepay            bool     `json:"auto_repay"`
	AIRiskScore          *float64 `json:"ai_risk_score"`
	AILastAdvice         *string  `json:"ai_last_advice"`
	CreatedAt            string   `json:"created_at"`
	UpdatedAt            string   `json:"updated_at"`
	// Computed
	BorrowableUSDT   float64 `json:"borrowable_usdt"`
	WithdrawableGSTD float64 `json:"withdrawable_gstd"`
	LiquidationPrice float64 `json:"liquidation_price"`
}

// LendingTransaction mirrors lending_transactions
type LendingTransaction struct {
	ID                   int64   `json:"id"`
	VaultID              int64   `json:"vault_id"`
	TxType               string  `json:"tx_type"`
	AmountGSTD           float64 `json:"amount_gstd"`
	AmountUSDT           float64 `json:"amount_usdt"`
	GSTDPriceUSD         float64 `json:"gstd_price_usd"`
	CollateralRatioAfter float64 `json:"collateral_ratio_after"`
	CreatedAt            string  `json:"created_at"`
}

// LendingStats for dashboard
type LendingStats struct {
	TotalValueLocked  float64 `json:"total_value_locked_usd"`
	TotalBorrowed     float64 `json:"total_borrowed_usdt"`
	ActiveVaults      int     `json:"active_vaults"`
	AverageAPR        float64 `json:"average_apr"`
	SafetyFundBalance float64 `json:"safety_fund_gstd"`
	GSTDPriceUSD      float64 `json:"gstd_price_usd"`
}

// OracleStatus for health monitoring
type OracleStatus struct {
	Healthy       bool    `json:"healthy"`
	LastPush      string  `json:"last_push_time"`
	LastGSTDPrice float64 `json:"last_gstd_price"`
	LastGoldPrice float64 `json:"last_gold_price"`
	PushCount     int64   `json:"push_count"`
}

func NewLendingService(db *sql.DB) *LendingService {
	log.Println("🏦 LendingService: Gold-backed credit lines module ready")
	return &LendingService{
		db:            db,
		lastAlertSent: make(map[string]time.Time),
	}
}

// CalculateLoanTerms — legacy method preserved for backward compat
func (s *LendingService) CalculateLoanTerms(gstdAmount float64) (*LoanOffer, error) {
	goldPriceUSD := 3200.00
	gstdPriceUSD := 1.0

	if s.poolMonitor != nil {
		goldPriceUSD = s.poolMonitor.GetXAUtPriceUSD()
		price, err := s.poolMonitor.GetGSTDPriceUSD(context.Background())
		if err == nil {
			gstdPriceUSD = price
		}
	}

	ltv := 0.60
	apr := 1.5

	maxLoanUSD := gstdAmount * gstdPriceUSD * ltv

	return &LoanOffer{
		CollateralGSTD: gstdAmount,
		LoanAmountUSD:  math.Floor(maxLoanUSD*100) / 100,
		LTV:            ltv * 100,
		InterestRate:   apr,
		GoldPrice:      goldPriceUSD,
	}, nil
}

// ═══════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════

func (s *LendingService) GetConfig(ctx context.Context) (*LendingConfig, error) {
	var cfg LendingConfig
	err := s.db.QueryRowContext(ctx, `
		SELECT min_collateral_ratio, liquidation_threshold, liquidation_penalty,
		       max_borrow_apr, min_borrow_apr, safety_fund_fee_pct, max_ltv,
		       min_deposit_gstd, enabled
		FROM lending_config WHERE id = 1
	`).Scan(
		&cfg.MinCollateralRatio, &cfg.LiquidationThreshold, &cfg.LiquidationPenalty,
		&cfg.MaxBorrowAPR, &cfg.MinBorrowAPR, &cfg.SafetyFundFeePct, &cfg.MaxLTV,
		&cfg.MinDepositGSTD, &cfg.Enabled,
	)
	if err != nil {
		// Return safe defaults if table doesn't exist yet
		return &LendingConfig{
			MinCollateralRatio:   1.50,
			LiquidationThreshold: 1.10,
			LiquidationPenalty:   0.05,
			MaxBorrowAPR:         0.08,
			MinBorrowAPR:         0.03,
			SafetyFundFeePct:     0.10,
			MaxLTV:               0.65,
			MinDepositGSTD:       10,
			Enabled:              true,
		}, nil
	}
	return &cfg, nil
}

func (s *LendingService) GetOracleStatus() *OracleStatus {
	// Oracle is considered healthy if the last push was within the last 2 hours
	// and we have successfully pushed at least once
	healthy := false
	var lastPushStr string
	if !s.oracleLastPush.IsZero() {
		lastPushStr = s.oracleLastPush.Format(time.RFC3339)
		if time.Since(s.oracleLastPush) < 2*time.Hour {
			healthy = true
		}
	} else {
		lastPushStr = "Never"
	}

	return &OracleStatus{
		Healthy:       healthy,
		LastPush:      lastPushStr,
		LastGSTDPrice: s.oracleLastGSTDPrice,
		LastGoldPrice: s.oracleLastGoldPrice,
		PushCount:     s.oraclePushCount,
	}
}

// ═══════════════════════════════════════════════════════════════
//  GSTD PRICE
// ═══════════════════════════════════════════════════════════════

func (s *LendingService) getGSTDPrice(ctx context.Context) float64 {
	// Priority 1: PoolMonitor (live DEX price)
	if s.poolMonitor != nil {
		price, err := s.poolMonitor.GetGSTDPriceUSD(ctx)
		if err == nil && price > 0 {
			return price
		}
	}

	// Priority 2: External API (CoinGecko gold price derivative)
	if extPrice := s.fetchExternalGSTDPrice(); extPrice > 0 {
		return extPrice
	}

	// Priority 3: Database golden_reserve
	var price float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(
			(SELECT gold_price_usd FROM golden_reserve ORDER BY last_rebalance DESC LIMIT 1),
			2800.0
		) / 1000000.0
	`).Scan(&price)
	if err != nil || price <= 0 {
		price = 0.0028
	}
	return price
}

// fetchExternalGSTDPrice queries external API for gold price and derives GSTD price.
// GSTD is backed 1:1000000 by gold (1M GSTD = 1 oz gold)
func (s *LendingService) fetchExternalGSTDPrice() float64 {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd")
	if err != nil {
		return 0
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0
	}

	var result map[string]map[string]float64
	if err := json.Unmarshal(body, &result); err != nil {
		return 0
	}

	goldPrice, ok := result["tether-gold"]["usd"]
	if !ok || goldPrice <= 0 {
		return 0
	}

	// GSTD = gold_price / 1_000_000 (1M GSTD per oz)
	gstdPrice := goldPrice / 1_000_000.0
	log.Printf("🔗 Lending Oracle: External gold=$%.2f → GSTD=$%.8f", goldPrice, gstdPrice)
	return gstdPrice
}

// ═══════════════════════════════════════════════════════════════
//  VAULT OPERATIONS
// ═══════════════════════════════════════════════════════════════

func (s *LendingService) GetOrCreateVault(ctx context.Context, wallet string) (*VaultPosition, error) {
	vault, err := s.GetVault(ctx, wallet)
	if err == nil {
		return vault, nil
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO lending_vaults (wallet_address) VALUES ($1)
		ON CONFLICT (wallet_address) DO NOTHING
	`, wallet)
	if err != nil {
		return nil, fmt.Errorf("create vault failed: %w", err)
	}
	return s.GetVault(ctx, wallet)
}

func (s *LendingService) GetVault(ctx context.Context, wallet string) (*VaultPosition, error) {
	var v VaultPosition
	var aiScore sql.NullFloat64
	var aiAdvice sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, wallet_address, collateral_gstd, collateral_usd, debt_usdt,
		       collateral_ratio, health_factor, borrow_apr, accrued_interest,
		       status, liquidation_threshold, auto_repay, ai_risk_score, ai_last_advice,
		       created_at::text, updated_at::text
		FROM lending_vaults WHERE wallet_address = $1
	`, wallet).Scan(
		&v.ID, &v.WalletAddress, &v.CollateralGSTD, &v.CollateralUSD, &v.DebtUSDT,
		&v.CollateralRatio, &v.HealthFactor, &v.BorrowAPR, &v.AccruedInterest,
		&v.Status, &v.LiquidationThreshold, &v.AutoRepay, &aiScore, &aiAdvice,
		&v.CreatedAt, &v.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("vault not found: %w", err)
	}
	if aiScore.Valid {
		v.AIRiskScore = &aiScore.Float64
	}
	if aiAdvice.Valid {
		v.AILastAdvice = &aiAdvice.String
	}

	price := s.getGSTDPrice(ctx)
	cfg, _ := s.GetConfig(ctx)
	if cfg != nil && price > 0 {
		maxBorrowable := v.CollateralGSTD * price / cfg.MinCollateralRatio
		v.BorrowableUSDT = math.Max(0, maxBorrowable-v.DebtUSDT)
		if v.DebtUSDT > 0 {
			minCollateralUSD := v.DebtUSDT * cfg.MinCollateralRatio
			excessUSD := math.Max(0, v.CollateralUSD-minCollateralUSD)
			v.WithdrawableGSTD = excessUSD / price
		} else {
			v.WithdrawableGSTD = v.CollateralGSTD
		}
		if v.CollateralGSTD > 0 && v.DebtUSDT > 0 {
			v.LiquidationPrice = (v.DebtUSDT * v.LiquidationThreshold) / v.CollateralGSTD
		}
	}
	return &v, nil
}

func (s *LendingService) DepositCollateral(ctx context.Context, wallet string, amountGSTD float64) (*VaultPosition, error) {
	cfg, err := s.GetConfig(ctx)
	if err != nil || !cfg.Enabled {
		return nil, fmt.Errorf("lending is disabled")
	}
	if amountGSTD < cfg.MinDepositGSTD {
		return nil, fmt.Errorf("minimum deposit is %.2f GSTD", cfg.MinDepositGSTD)
	}

	var balance float64
	s.db.QueryRowContext(ctx, `SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`, wallet).Scan(&balance)
	if balance < amountGSTD {
		return nil, fmt.Errorf("insufficient GSTD balance (have %.2f, need %.2f)", balance, amountGSTD)
	}

	price := s.getGSTDPrice(ctx)
	v, err := s.GetOrCreateVault(ctx, wallet)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = gstd_balance - $1 WHERE wallet_address = $2`, amountGSTD, wallet); err != nil {
		return nil, fmt.Errorf("deduct balance failed: %w", err)
	}

	newCollateral := v.CollateralGSTD + amountGSTD
	newCollateralUSD := newCollateral * price
	cr, hf := computeHealth(newCollateralUSD, v.DebtUSDT, v.LiquidationThreshold)

	if _, err = tx.ExecContext(ctx, `
		UPDATE lending_vaults SET collateral_gstd=$1, collateral_usd=$2, collateral_ratio=$3, health_factor=$4, updated_at=NOW() WHERE id=$5
	`, newCollateral, newCollateralUSD, cr, hf, v.ID); err != nil {
		return nil, err
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO lending_transactions (vault_id, wallet_address, tx_type, amount_gstd, gstd_price_usd, collateral_ratio_after)
		VALUES ($1, $2, 'deposit', $3, $4, $5)
	`, v.ID, wallet, amountGSTD, price, cr); err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	log.Printf("🏦 Lending: %s deposited %.2f GSTD (CR: %.0f%%)", truncWallet(wallet), amountGSTD, cr*100)
	return s.GetVault(ctx, wallet)
}

func (s *LendingService) Borrow(ctx context.Context, wallet string, amountUSDT float64) (*VaultPosition, error) {
	cfg, err := s.GetConfig(ctx)
	if err != nil || !cfg.Enabled {
		return nil, fmt.Errorf("lending is disabled")
	}
	if amountUSDT <= 0 {
		return nil, fmt.Errorf("invalid borrow amount")
	}

	price := s.getGSTDPrice(ctx)
	v, err := s.GetVault(ctx, wallet)
	if err != nil {
		return nil, fmt.Errorf("vault not found — deposit collateral first")
	}
	if v.Status != "active" {
		return nil, fmt.Errorf("vault is %s", v.Status)
	}

	newDebt := v.DebtUSDT + amountUSDT
	newCR, newHF := computeHealth(v.CollateralUSD, newDebt, v.LiquidationThreshold)
	if newCR < cfg.MinCollateralRatio {
		return nil, fmt.Errorf("exceeds max LTV — CR would be %.0f%% (min: %.0f%%)", newCR*100, cfg.MinCollateralRatio*100)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		UPDATE lending_vaults SET debt_usdt=$1, collateral_ratio=$2, health_factor=$3, borrow_apr=$4, updated_at=NOW() WHERE id=$5
	`, newDebt, newCR, newHF, cfg.MinBorrowAPR, v.ID); err != nil {
		return nil, err
	}

	borrowedGSTD := amountUSDT / price
	if _, err = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = gstd_balance + $1 WHERE wallet_address = $2`, borrowedGSTD, wallet); err != nil {
		return nil, err
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO lending_transactions (vault_id, wallet_address, tx_type, amount_usdt, amount_gstd, gstd_price_usd, collateral_ratio_after)
		VALUES ($1, $2, 'borrow', $3, $4, $5, $6)
	`, v.ID, wallet, amountUSDT, borrowedGSTD, price, newCR); err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	log.Printf("🏦 Lending: %s borrowed $%.2f (CR: %.0f%%, HF: %.2f)", truncWallet(wallet), amountUSDT, newCR*100, newHF)
	return s.GetVault(ctx, wallet)
}

func (s *LendingService) Repay(ctx context.Context, wallet string, amountUSDT float64) (*VaultPosition, error) {
	v, err := s.GetVault(ctx, wallet)
	if err != nil {
		return nil, err
	}
	if v.DebtUSDT <= 0 {
		return nil, fmt.Errorf("no debt to repay")
	}

	price := s.getGSTDPrice(ctx)
	repayGSTD := amountUSDT / price

	var balance float64
	s.db.QueryRowContext(ctx, `SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`, wallet).Scan(&balance)
	if balance < repayGSTD {
		return nil, fmt.Errorf("insufficient balance to repay")
	}

	actualRepay := math.Min(amountUSDT, v.DebtUSDT+v.AccruedInterest)
	newDebt := math.Max(0, v.DebtUSDT-actualRepay)
	newCR, newHF := computeHealth(v.CollateralUSD, newDebt, v.LiquidationThreshold)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = gstd_balance - $1 WHERE wallet_address = $2`, repayGSTD, wallet); err != nil {
		return nil, err
	}

	if _, err = tx.ExecContext(ctx, `
		UPDATE lending_vaults SET debt_usdt=$1, accrued_interest=GREATEST(0, accrued_interest - $2),
		collateral_ratio=$3, health_factor=$4, updated_at=NOW() WHERE id=$5
	`, newDebt, actualRepay, newCR, newHF, v.ID); err != nil {
		return nil, err
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO lending_transactions (vault_id, wallet_address, tx_type, amount_usdt, amount_gstd, gstd_price_usd, collateral_ratio_after)
		VALUES ($1, $2, 'repay', $3, $4, $5, $6)
	`, v.ID, wallet, actualRepay, repayGSTD, price, newCR); err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	log.Printf("🏦 Lending: %s repaid $%.2f (remaining: $%.2f)", truncWallet(wallet), actualRepay, newDebt)
	return s.GetVault(ctx, wallet)
}

func (s *LendingService) Withdraw(ctx context.Context, wallet string, amountGSTD float64) (*VaultPosition, error) {
	cfg, _ := s.GetConfig(ctx)
	v, err := s.GetVault(ctx, wallet)
	if err != nil {
		return nil, err
	}
	if amountGSTD > v.WithdrawableGSTD {
		return nil, fmt.Errorf("max withdrawable is %.4f GSTD", v.WithdrawableGSTD)
	}

	price := s.getGSTDPrice(ctx)
	newCollateral := v.CollateralGSTD - amountGSTD
	newCollateralUSD := newCollateral * price
	newCR, newHF := computeHealth(newCollateralUSD, v.DebtUSDT, v.LiquidationThreshold)

	if v.DebtUSDT > 0 && cfg != nil && newCR < cfg.MinCollateralRatio {
		return nil, fmt.Errorf("withdrawal would drop CR below minimum")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = gstd_balance + $1 WHERE wallet_address = $2`, amountGSTD, wallet); err != nil {
		return nil, err
	}

	if _, err = tx.ExecContext(ctx, `
		UPDATE lending_vaults SET collateral_gstd=$1, collateral_usd=$2, collateral_ratio=$3, health_factor=$4, updated_at=NOW() WHERE id=$5
	`, newCollateral, newCollateralUSD, newCR, newHF, v.ID); err != nil {
		return nil, err
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO lending_transactions (vault_id, wallet_address, tx_type, amount_gstd, gstd_price_usd, collateral_ratio_after)
		VALUES ($1, $2, 'withdraw', $3, $4, $5)
	`, v.ID, wallet, amountGSTD, price, newCR); err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	log.Printf("🏦 Lending: %s withdrew %.2f GSTD collateral", truncWallet(wallet), amountGSTD)
	return s.GetVault(ctx, wallet)
}

// ═══════════════════════════════════════════════════════════════
//  HEALTH CHECK & LIQUIDATION ENGINE
// ═══════════════════════════════════════════════════════════════

func (s *LendingService) AccrueInterest(ctx context.Context) {
	price := s.getGSTDPrice(ctx)
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, collateral_gstd, debt_usdt, borrow_apr, liquidation_threshold, last_interest_at
		FROM lending_vaults WHERE status = 'active' AND debt_usdt > 0
	`)
	if err != nil {
		log.Printf("⚠️ Lending: interest accrual query failed: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var collGSTD, debt, apr, liqThreshold float64
		var lastInterest time.Time
		if err := rows.Scan(&id, &collGSTD, &debt, &apr, &liqThreshold, &lastInterest); err != nil {
			continue
		}
		hours := time.Since(lastInterest).Hours()
		if hours < 1 {
			continue
		}
		interest := debt * apr * (hours / 8760)
		newDebt := debt + interest
		collUSD := collGSTD * price
		cr, hf := computeHealth(collUSD, newDebt, liqThreshold)

		s.db.ExecContext(ctx, `
			UPDATE lending_vaults SET debt_usdt=$1, accrued_interest=accrued_interest+$2,
			collateral_usd=$3, collateral_ratio=$4, health_factor=$5,
			last_interest_at=NOW(), updated_at=NOW() WHERE id=$6
		`, newDebt, interest, collUSD, cr, hf, id)
	}
}

func (s *LendingService) CheckLiquidations(ctx context.Context) int {
	cfg, err := s.GetConfig(ctx)
	if err != nil {
		return 0
	}
	price := s.getGSTDPrice(ctx)

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, wallet_address, collateral_gstd, debt_usdt, liquidation_threshold
		FROM lending_vaults WHERE status = 'active' AND health_factor < 1.0 AND debt_usdt > 0
	`)
	if err != nil {
		return 0
	}
	defer rows.Close()

	liquidated := 0
	for rows.Next() {
		var id int64
		var wallet string
		var collGSTD, debt, liqThreshold float64
		if err := rows.Scan(&id, &wallet, &collGSTD, &debt, &liqThreshold); err != nil {
			continue
		}

		_ = liqThreshold // used in context of this loop
		penalty := cfg.LiquidationPenalty
		collateralNeeded := debt / price * (1 + penalty)
		seized := math.Min(collateralNeeded, collGSTD)
		liquidatorReward := seized * 0.02
		safetyShare := seized * penalty
		remaining := collGSTD - seized

		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			continue
		}

		_, err = tx.ExecContext(ctx, `
			UPDATE lending_vaults SET collateral_gstd=$1, collateral_usd=$2,
			debt_usdt=0, status='liquidated', health_factor=0, collateral_ratio=0, updated_at=NOW() WHERE id=$3
		`, remaining, remaining*price, id)
		if err != nil {
			tx.Rollback()
			continue
		}

		if remaining > 0 {
			tx.ExecContext(ctx, `UPDATE users SET gstd_balance=gstd_balance+$1 WHERE wallet_address=$2`, remaining, wallet)
		}

		tx.ExecContext(ctx, `
			INSERT INTO lending_liquidations (vault_id, wallet_address, collateral_seized_gstd,
			debt_covered_usdt, liquidation_penalty_pct, gstd_price_at_liquidation,
			liquidator_reward_gstd, safety_fund_share_gstd)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, id, wallet, seized, debt, penalty, price, liquidatorReward, safetyShare)

		tx.ExecContext(ctx, `
			UPDATE lending_safety_fund SET balance_gstd=balance_gstd+$1, total_deposits=total_deposits+$1, updated_at=NOW() WHERE id=1
		`, safetyShare)

		tx.ExecContext(ctx, `
			INSERT INTO lending_transactions (vault_id, wallet_address, tx_type, amount_gstd, amount_usdt, gstd_price_usd, collateral_ratio_after)
			VALUES ($1, $2, 'liquidation', $3, $4, $5, 0)
		`, id, wallet, seized, debt, price)

		if err = tx.Commit(); err != nil {
			continue
		}
		liquidated++
		log.Printf("🚨 Lending: LIQUIDATED vault %d (%s) — seized %.2f GSTD, covered $%.2f debt", id, truncWallet(wallet), seized, debt)
	}
	return liquidated
}

// GetTransactions returns lending tx history
func (s *LendingService) GetTransactions(ctx context.Context, wallet string, limit int) ([]LendingTransaction, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, vault_id, tx_type, amount_gstd, amount_usdt, gstd_price_usd, collateral_ratio_after, created_at::text
		FROM lending_transactions WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT $2
	`, wallet, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []LendingTransaction
	for rows.Next() {
		var t LendingTransaction
		if err := rows.Scan(&t.ID, &t.VaultID, &t.TxType, &t.AmountGSTD, &t.AmountUSDT, &t.GSTDPriceUSD, &t.CollateralRatioAfter, &t.CreatedAt); err != nil {
			continue
		}
		txs = append(txs, t)
	}
	return txs, nil
}

// GetStats returns global lending statistics
func (s *LendingService) GetStats(ctx context.Context) (*LendingStats, error) {
	stats := &LendingStats{GSTDPriceUSD: s.getGSTDPrice(ctx)}
	s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(collateral_usd),0) FROM lending_vaults WHERE status='active'`).Scan(&stats.TotalValueLocked)
	s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(debt_usdt),0) FROM lending_vaults WHERE status='active'`).Scan(&stats.TotalBorrowed)
	s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM lending_vaults WHERE status='active' AND collateral_gstd > 0`).Scan(&stats.ActiveVaults)
	s.db.QueryRowContext(ctx, `SELECT COALESCE(AVG(borrow_apr),0) FROM lending_vaults WHERE status='active' AND debt_usdt > 0`).Scan(&stats.AverageAPR)
	s.db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd,0) FROM lending_safety_fund WHERE id=1`).Scan(&stats.SafetyFundBalance)
	return stats, nil
}

// AIRiskCheck performs AI analysis for a vault
func (s *LendingService) AIRiskCheck(ctx context.Context, wallet string, ai *CompoundAI) {
	if ai == nil {
		return
	}
	v, err := s.GetVault(ctx, wallet)
	if err != nil {
		return
	}
	vaultJSON, _ := json.Marshal(v)
	prompt := fmt.Sprintf(`You are a DeFi Risk Analyst for GSTD gold-backed lending.
Analyze this vault and provide risk_score (0-1) and brief advice.
Vault: %s
Respond JSON: {"risk_score": 0.35, "advice": "..."}`, string(vaultJSON))

	response, err := ai.Ask(ctx, "GSTD Risk Analyst", prompt)
	if err != nil {
		return
	}
	var result struct {
		RiskScore float64 `json:"risk_score"`
		Advice    string  `json:"advice"`
	}
	if err := json.Unmarshal([]byte(response), &result); err != nil {
		return
	}
	s.db.ExecContext(ctx, `UPDATE lending_vaults SET ai_risk_score=$1, ai_last_advice=$2 WHERE wallet_address=$3`, result.RiskScore, result.Advice, wallet)
}

// ═══════════════════════════════════════════════════════════════
//  USER ALERTS — Telegram notifications for at-risk vaults
// ═══════════════════════════════════════════════════════════════

// RiskyVault represents a vault near liquidation
type RiskyVault struct {
	WalletAddress  string  `json:"wallet_address"`
	CollateralGSTD float64 `json:"collateral_gstd"`
	DebtUSDT       float64 `json:"debt_usdt"`
	HealthFactor   float64 `json:"health_factor"`
	RiskLevel      string  `json:"risk_level"` // critical, warning, watch
}

// GetRiskyVaults returns vaults with HF below given threshold
func (s *LendingService) GetRiskyVaults(ctx context.Context, hfThreshold float64) ([]RiskyVault, error) {
	if hfThreshold <= 0 {
		hfThreshold = 1.5
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT wallet_address, collateral_gstd, debt_usdt, health_factor
		FROM lending_vaults
		WHERE status = 'active' AND debt_usdt > 0 AND health_factor < $1
		ORDER BY health_factor ASC LIMIT 50
	`, hfThreshold)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []RiskyVault
	for rows.Next() {
		var v RiskyVault
		if err := rows.Scan(&v.WalletAddress, &v.CollateralGSTD, &v.DebtUSDT, &v.HealthFactor); err != nil {
			continue
		}
		switch {
		case v.HealthFactor < 1.0:
			v.RiskLevel = "critical"
		case v.HealthFactor < 1.2:
			v.RiskLevel = "warning"
		default:
			v.RiskLevel = "watch"
		}
		vaults = append(vaults, v)
	}
	return vaults, nil
}

// NotifyAtRiskUsers sends Telegram alerts to users with HF < 1.2
// Called from PlatformOperator's maintenance loop
func (s *LendingService) NotifyAtRiskUsers(ctx context.Context) int {
	if s.telegramNotifier == nil {
		return 0
	}

	risky, err := s.GetRiskyVaults(ctx, 1.2)
	if err != nil || len(risky) == 0 {
		return 0
	}

	notified := 0
	for _, v := range risky {
		if s.notifyRiskyVault(ctx, v) {
			notified++
		}
	}
	return notified
}

// notifyRiskyVault sends a single alert for one risky vault. Returns true if sent.
func (s *LendingService) notifyRiskyVault(ctx context.Context, v RiskyVault) bool {
	// Anti-spam: max 1 alert per user per 6 hours
	if lastSent, ok := s.lastAlertSent[v.WalletAddress]; ok && time.Since(lastSent) < 6*time.Hour {
		return false
	}

	// Find user's telegram_id
	chatID := s.resolveUserTelegramID(ctx, v.WalletAddress)
	if chatID == "" {
		return false
	}

	msg := s.composeLendingAlert(v)
	if err := s.telegramNotifier.SendMessageToChat(ctx, chatID, msg); err != nil {
		log.Printf("⚠️ Lending Alert: failed to notify %s: %v", truncWallet(v.WalletAddress), err)
		return false
	}

	s.lastAlertSent[v.WalletAddress] = time.Now()
	log.Printf("📩 Lending Alert sent to %s (HF=%.2f)", truncWallet(v.WalletAddress), v.HealthFactor)
	return true
}

func (s *LendingService) resolveUserTelegramID(ctx context.Context, wallet string) string {
	var telegramID sql.NullString
	s.db.QueryRowContext(ctx, `SELECT telegram_id FROM users WHERE wallet_address = $1`, wallet).Scan(&telegramID)
	if !telegramID.Valid {
		return ""
	}
	return telegramID.String
}

func (s *LendingService) composeLendingAlert(v RiskyVault) string {
	emoji, urgency := "⚠️", "Warning — Add collateral soon"
	if v.HealthFactor < 1.0 {
		emoji = "🚨"
		urgency = "CRITICAL — Liquidation imminent!"
	}
	return fmt.Sprintf("%s <b>GSTD Lending Alert</b>\n\n"+
		"Your vault Health Factor: <b>%.2f</b>\n"+
		"Status: %s\n\n"+
		"Collateral: <b>%.2f GSTD</b>\n"+
		"Debt: <b>$%.2f</b>\n\n"+
		"💡 <i>Deposit more GSTD or repay part of your debt to avoid liquidation.</i>\n"+
		"🔗 <a href=\"https://app.gstdtoken.com\">Open Dashboard →</a>",
		emoji, v.HealthFactor, urgency, v.CollateralGSTD, v.DebtUSDT)
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

func computeHealth(collateralUSD, debtUSDT, liqThreshold float64) (cr float64, hf float64) {
	if debtUSDT <= 0 {
		return 999, 999
	}
	cr = collateralUSD / debtUSDT
	hf = cr / liqThreshold
	return cr, hf
}

func truncWallet(w string) string {
	if len(w) > 12 {
		return w[:12]
	}
	return w
}
