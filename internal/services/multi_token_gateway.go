package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

// MultiTokenGateway prepares logic for USDT/TON -> GSTD conversion via Ston.fi (Buy-Pressure)
// Concept: External payment in USDT or TON is converted to GSTD for worker payouts.
type MultiTokenGateway struct {
	db     *sql.DB
	stonFi *StonFiService
}

// NewMultiTokenGateway creates the gateway service
func NewMultiTokenGateway(db *sql.DB, stonFi *StonFiService) *MultiTokenGateway {
	return &MultiTokenGateway{db: db, stonFi: stonFi}
}

// CreatePaymentIntent creates an intent for USDT/TON -> GSTD conversion
// Caller pays in source token; system converts via Ston.fi and credits GSTD for task payment
func (s *MultiTokenGateway) CreatePaymentIntent(ctx context.Context, sourceToken string, sourceAmount float64, walletAddress string) (string, float64, error) {
	if sourceToken != "USDT" && sourceToken != "TON" {
		return "", 0, fmt.Errorf("unsupported source token: %s (use USDT or TON)", sourceToken)
	}
	// Placeholder: In production, query Ston.fi for GSTD rate and create swap intent
	// targetGSTD := sourceAmount * rateFromStonFi
	targetGSTD := sourceAmount * 1.0 // Placeholder rate
	intentID := fmt.Sprintf("mt_%d", len(fmt.Sprintf("%s%f", walletAddress, sourceAmount)))

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO multi_token_payment_intents (intent_id, source_token, source_amount, target_gstd, wallet_address, status)
		VALUES ($1, $2, $3, $4, $5, 'pending')
	`, intentID, sourceToken, sourceAmount, targetGSTD, walletAddress)
	if err != nil {
		return "", 0, err
	}
	log.Printf("Multi-Token Gateway: Intent %s created (%s %.4f -> %.4f GSTD)", intentID, sourceToken, sourceAmount, targetGSTD)
	return intentID, targetGSTD, nil
}
