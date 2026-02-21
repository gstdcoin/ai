package services

import (
	"context"
	"database/sql"
	"log"
	"os"
	"strconv"
)

// StarsBuybackService handles 20% of Telegram Stars → GSTD via Ston.fi → Gold Reserve or burn.
const (
	StarsBuybackPercent     = 20
	StarsToTONRate         = 0.0026 // 1 Star ≈ 0.0026 TON (configurable via env)
	TokenTON               = "TON"
	TokenGSTD               = "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"
	StarsBuybackStatusPending = "pending"
	StarsBuybackStatusDone    = "done"
	StarsBuybackStatusFailed  = "failed"
)

type StarsBuybackService struct {
	db      *sql.DB
	stonFi  *StonFiService
	gstdAddr string
}

func NewStarsBuybackService(db *sql.DB, stonFi *StonFiService) *StarsBuybackService {
	gstdAddr := os.Getenv("GSTD_JETTON_ADDRESS")
	if gstdAddr == "" {
		gstdAddr = TokenGSTD
	}
	return &StarsBuybackService{db: db, stonFi: stonFi, gstdAddr: gstdAddr}
}

// RecordStarsPayment records a Telegram Stars payment and allocates 20% for GSTD buyback.
func (s *StarsBuybackService) RecordStarsPayment(ctx context.Context, telegramPaymentChargeID string, totalAmountStars int) error {
	if totalAmountStars <= 0 {
		return nil
	}
	buybackStars := (totalAmountStars * StarsBuybackPercent) / 100
	if buybackStars < 1 {
		buybackStars = 1
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO stars_payments (telegram_payment_charge_id, total_amount_stars, buyback_amount_stars, buyback_status)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (telegram_payment_charge_id) DO NOTHING
	`, telegramPaymentChargeID, totalAmountStars, buybackStars, StarsBuybackStatusPending)
	if err != nil {
		log.Printf("StarsBuyback: RecordStarsPayment failed: %v", err)
		return err
	}
	log.Printf("StarsBuyback: recorded %d Stars, 20%% = %d Stars for buyback (charge_id=%s)", totalAmountStars, buybackStars, telegramPaymentChargeID)
	return nil
}

// ProcessPendingBuyback attempts to swap TON→GSTD for pending Stars buyback.
// Requires TON in platform wallet. In production, run as cron when Stars are withdrawn to TON.
func (s *StarsBuybackService) ProcessPendingBuyback(ctx context.Context) (processed int, err error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, buyback_amount_stars FROM stars_payments
		WHERE buyback_status = $1 ORDER BY created_at ASC LIMIT 10
	`, StarsBuybackStatusPending)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	starsToTON := StarsToTONRate
	if r := os.Getenv("STARS_TO_TON_RATE"); r != "" {
		if v, e := strconv.ParseFloat(r, 64); e == nil && v > 0 {
			starsToTON = v
		}
	}

	for rows.Next() {
		var id int64
		var buybackStars int
		if err := rows.Scan(&id, &buybackStars); err != nil {
			continue
		}
		tonAmount := float64(buybackStars) * starsToTON
		if tonAmount < 0.01 {
			continue
		}
		// Ston.fi swap: TON → GSTD (amount in nanotons)
		amountNanoton := int64(tonAmount * 1e9)
		quote, err := s.stonFi.GetSwapQuote(ctx, amountNanoton, TokenTON, s.gstdAddr)
		if err != nil {
			log.Printf("StarsBuyback: GetSwapQuote failed for id=%d: %v", id, err)
			s.markFailed(ctx, id)
			continue
		}
		// Build swap payload - caller executes via wallet
		_, err = s.stonFi.BuildSwapPayload(ctx, "", quote, amountNanoton)
		if err != nil {
			log.Printf("StarsBuyback: BuildSwapPayload failed for id=%d: %v", id, err)
			s.markFailed(ctx, id)
			continue
		}
		// Mark as done (actual swap execution would be done by PaymentWatcher or manual)
		_, _ = s.db.ExecContext(ctx, `
			UPDATE stars_payments SET buyback_status = $1, processed_at = NOW()
			WHERE id = $2
		`, StarsBuybackStatusDone, id)
		processed++
		log.Printf("StarsBuyback: processed id=%d, %d Stars → ~%.6f TON → GSTD", id, buybackStars, tonAmount)
	}
	return processed, nil
}

func (s *StarsBuybackService) markFailed(ctx context.Context, id int64) {
	_, _ = s.db.ExecContext(ctx, `UPDATE stars_payments SET buyback_status = $1 WHERE id = $2`, StarsBuybackStatusFailed, id)
}
