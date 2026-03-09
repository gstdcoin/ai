package multichain

import (
	"context"
	"fmt"
)

// XRPLService manages institutional payment gateway
// Purpose: Cross-border payments, CBDC compatibility, Large-scale settlements
// Status: ROADMAP — not yet implemented. All methods return ErrNotImplemented.
type XRPLService interface {
	SubmitPayment(ctx context.Context, fromAddr, secret, toAddr, amount, memo string) (string, error)
	CreateEscrow(ctx context.Context, fromAddr, secret, toAddr, amount string, finishAfter int64) (string, error)
	GetTrustLine(ctx context.Context, account, issuer string) (float64, error)
}

var ErrXRPLNotImplemented = fmt.Errorf("XRPL bridge not implemented (roadmap feature)")

// XRPLServiceImpl is a stub — returns errors instead of mock data.
type XRPLServiceImpl struct {
	WebSocketURL string
}

func NewXRPLService(url string) *XRPLServiceImpl {
	if url == "" {
		url = "wss://s1.ripple.com"
	}
	return &XRPLServiceImpl{WebSocketURL: url}
}

func (s *XRPLServiceImpl) SubmitPayment(ctx context.Context, fromAddr, secret, toAddr, amount, memo string) (string, error) {
	return "", ErrXRPLNotImplemented
}

func (s *XRPLServiceImpl) CreateEscrow(ctx context.Context, fromAddr, secret, toAddr, amount string, finishAfter int64) (string, error) {
	return "", ErrXRPLNotImplemented
}

func (s *XRPLServiceImpl) GetTrustLine(ctx context.Context, account, issuer string) (float64, error) {
	return 0, ErrXRPLNotImplemented
}
