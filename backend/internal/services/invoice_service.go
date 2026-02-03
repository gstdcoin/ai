package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

type InvoiceStatus string

const (
	InvoiceUnpaid    InvoiceStatus = "unpaid"
	InvoicePaid      InvoiceStatus = "paid"
	InvoiceCancelled InvoiceStatus = "cancelled"
	InvoiceExpired   InvoiceStatus = "expired"
)

type Invoice struct {
	ID             string                 `json:"id"`
	IssuerAddress  string                 `json:"issuer_address"`
	PayerAddress   string                 `json:"payer_address"`
	AmountGSTD     float64                `json:"amount_gstd"`
	Description    string                 `json:"description"`
	TaskID         string                 `json:"task_id,omitempty"`
	Status         InvoiceStatus          `json:"status"`
	PaymentTxHash  string                 `json:"payment_tx_hash,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	ExpiresAt      time.Time              `json:"expires_at"`
	Metadata       map[string]interface{} `json:"metadata"`
}

type InvoiceService struct {
	db *sql.DB
}

func NewInvoiceService(db *sql.DB) *InvoiceService {
	return &InvoiceService{db: db}
}

func (s *InvoiceService) CreateInvoice(ctx context.Context, issuer, payer string, amount float64, desc string, taskID string, expiresHours int) (*Invoice, error) {
	if amount <= 0 {
		return nil, fmt.Errorf("amount must be greater than zero")
	}

	id := uuid.New().String()
	expiresAt := time.Now().Add(time.Duration(expiresHours) * time.Hour)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO invoices (id, issuer_address, payer_address, amount_gstd, description, task_id, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, id, issuer, payer, amount, desc, taskID, expiresAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create invoice: %w", err)
	}

	return &Invoice{
		ID:            id,
		IssuerAddress: issuer,
		PayerAddress:  payer,
		AmountGSTD:    amount,
		Description:   desc,
		TaskID:        taskID,
		Status:        InvoiceUnpaid,
		CreatedAt:     time.Now(),
		ExpiresAt:     expiresAt,
		Metadata:      make(map[string]interface{}),
	}, nil
}

func (s *InvoiceService) GetInvoice(ctx context.Context, id string) (*Invoice, error) {
	var inv Invoice
	var metadataJSON []byte

	err := s.db.QueryRowContext(ctx, `
		SELECT id, issuer_address, payer_address, amount_gstd, description, task_id, status, payment_tx_hash, created_at, expires_at, metadata
		FROM invoices WHERE id = $1
	`, id).Scan(
		&inv.ID, &inv.IssuerAddress, &inv.PayerAddress, &inv.AmountGSTD, &inv.Description, &inv.TaskID,
		&inv.Status, &inv.PaymentTxHash, &inv.CreatedAt, &inv.ExpiresAt, &metadataJSON,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("invoice not found")
		}
		return nil, err
	}

	// Simple check for expiration on fetch
	if inv.Status == InvoiceUnpaid && time.Now().After(inv.ExpiresAt) {
		inv.Status = InvoiceExpired
		_, _ = s.db.ExecContext(ctx, "UPDATE invoices SET status = 'expired' WHERE id = $1", id)
	}

	return &inv, nil
}

func (s *InvoiceService) MarkPaid(ctx context.Context, id string, txHash string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE invoices 
		SET status = 'paid', payment_tx_hash = $1, updated_at = NOW() 
		WHERE id = $2 AND status = 'unpaid'
	`, txHash, id)

	if err != nil {
		return err
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("invoice cannot be marked as paid (maybe not found or already paid/expired)")
	}

	return nil
}

func (s *InvoiceService) GetInvoicesForPayer(ctx context.Context, payer string) ([]*Invoice, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, issuer_address, payer_address, amount_gstd, description, task_id, status, payment_tx_hash, created_at, expires_at
		FROM invoices WHERE payer_address = $1 ORDER BY created_at DESC
	`, payer)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invoices []*Invoice
	for rows.Next() {
		var inv Invoice
		err := rows.Scan(
			&inv.ID, &inv.IssuerAddress, &inv.PayerAddress, &inv.AmountGSTD, &inv.Description, &inv.TaskID,
			&inv.Status, &inv.PaymentTxHash, &inv.CreatedAt, &inv.ExpiresAt,
		)
		if err != nil {
			return nil, err
		}
		invoices = append(invoices, &inv)
	}
	return invoices, nil
}
