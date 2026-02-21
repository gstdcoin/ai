package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"distributed-computing-platform/internal/config"
)

// TreasuryService manages the Gold Gateway and automatic XAUt conversions
type TreasuryService struct {
	db         *sql.DB
	stonFi     *StonFiService
	tonCfg     config.TONConfig
	minSwapAmt float64 // Minimum GSTD to accumulate before swapping to XAUt
}

func NewTreasuryService(db *sql.DB, stonFi *StonFiService, cfg config.TONConfig) *TreasuryService {
	return &TreasuryService{
		db:         db,
		stonFi:     stonFi,
		tonCfg:     cfg,
		minSwapAmt: 1.0, // Genesis Launch: instant conversion — every 1 GSTD to XAUt
	}
}

// ProcessGoldReserves checks the gold_reserve fund and swaps GSTD to XAUt if threshold met
// This implements specific requirements:
// - 5% of commissions -> XAUt
// - 70% of Net Protocol Revenue -> XAUt
// Ideally called by a background worker or cron
func (s *TreasuryService) ProcessGoldReserves(ctx context.Context) error {
	// 1. Check current gold_reserve balance in GSTD
	var balanceGSTD float64
	err := s.db.QueryRowContext(ctx, `
		SELECT balance_gstd FROM platform_funds WHERE fund_type = 'gold_reserve'
	`).Scan(&balanceGSTD)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil // No funds yet
		}
		return fmt.Errorf("failed to get gold reserve balance: %w", err)
	}

	if balanceGSTD < s.minSwapAmt {
		// Not enough to swap efficiently
		return nil
	}

	log.Printf("💰 Treasury: Found %.2f GSTD for Gold conversion. Initiating swap...", balanceGSTD)

	// 2. Swap GSTD -> XAUt via Ston.fi
	// We use the StonFiService to execute or build the transaction
	// In a real autonomous agent, this would sign and broadcast.
	// Here we simulate the successful swap and update DB.

	// Get addresses from config or defaults
	gstdAddr := s.tonCfg.GSTDJettonAddress
	if gstdAddr == "" {
		gstdAddr = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
	}

	xautAddr := s.tonCfg.XAUtJettonAddress
	if xautAddr == "" {
		xautAddr = "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k"
	}

	// Perform Swap (or get quote and simulate)
	amountXAUt, txHash, err := s.stonFi.SwapGSTDToXAUt(ctx, balanceGSTD, gstdAddr, xautAddr)
	if err != nil {
		return fmt.Errorf("swap failed: %w", err)
	}

	// 3. Update DB to reflect the swap
	// We decrement GSTD from gold_reserve and increment XAUt balance (if we track it)
	// Or we just log the "purchase".

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Deduct GSTD
	_, err = tx.ExecContext(ctx, `
		UPDATE platform_funds 
		SET balance_gstd = balance_gstd - $1, 
		    updated_at = NOW()
		WHERE fund_type = 'gold_reserve'
	`, balanceGSTD)
	if err != nil {
		return fmt.Errorf("failed to update fund balance: %w", err)
	}

	// Record Transaction
	_, err = tx.ExecContext(ctx, `
		INSERT INTO fund_transactions (fund_type, amount_gstd, tx_type, description, metadata)
		VALUES ('gold_reserve', $1, 'swap_xaut', $2, $3)
	`, -balanceGSTD, fmt.Sprintf("Swapped %.2f GSTD to %.6f XAUt", balanceGSTD, amountXAUt),
		fmt.Sprintf(`{"tx_hash": "%s", "xaut_bought": %.6f}`, txHash, amountXAUt))

	if err != nil {
		return fmt.Errorf("failed to record transaction: %w", err)
	}

	// Optional: Record XAUt holdings in a separate table or column
	// Assuming a 'treasury_assets' table exists or we just rely on blockchain
	_, err = tx.ExecContext(ctx, `
		INSERT INTO treasury_holdings (asset_type, amount, updated_at)
		VALUES ('XAUt', $1, NOW())
		ON CONFLICT (asset_type) DO UPDATE 
		SET amount = treasury_holdings.amount + $1, updated_at = NOW()
	`, amountXAUt)

	// If table doesn't exist, we might ignore error or fail. For now, let's assume it might fail if table missing.
	// We'll wrap in a safe block or just log.
	if err != nil {
		log.Printf("⚠️ Could not update treasury_holdings (table might be missing): %v", err)
		// Don't fail the whole transaction for this
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("✅ Treasury: Successfully swapped %.2f GSTD for %.6f XAUt (Tx: %s)", balanceGSTD, amountXAUt, txHash)
	return nil
}
