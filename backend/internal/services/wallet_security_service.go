package services

import (
	"context"
	"crypto/ed25519"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"
)

// WalletSecurityService provides security features for platform wallet
type WalletSecurityService struct {
	db *sql.DB
}

func NewWalletSecurityService(db *sql.DB) *WalletSecurityService {
	return &WalletSecurityService{db: db}
}

// ValidateWalletAddress validates TON wallet address format
func (s *WalletSecurityService) ValidateWalletAddress(address string) error {
	if address == "" {
		return fmt.Errorf("wallet address is required")
	}

	address = strings.TrimSpace(address)

	// Check for valid TON address formats
	// Raw format: 0: + 48 hex chars
	if strings.HasPrefix(address, "0:") {
		if len(address) < 50 || len(address) > 66 {
			return fmt.Errorf("invalid raw address length")
		}
		hexPart := address[2:]
		if len(hexPart) < 48 {
			return fmt.Errorf("invalid raw address format")
		}
		// Validate hex
		if _, err := hex.DecodeString(hexPart); err != nil {
			return fmt.Errorf("invalid hex in raw address")
		}
		return nil
	}

	// User-friendly format: EQ/UQ/kQ/0Q + 44-48 base64url chars
	validPrefixes := []string{"EQ", "UQ", "kQ", "0Q"}
	addressNoDashes := strings.ReplaceAll(address, "-", "")

	for _, prefix := range validPrefixes {
		if strings.HasPrefix(addressNoDashes, prefix) {
			if len(addressNoDashes) < 46 || len(addressNoDashes) > 48 {
				return fmt.Errorf("invalid user-friendly address length")
			}
			return nil
		}
	}

	return fmt.Errorf("invalid TON address format")
}

// ValidatePrivateKey validates Ed25519 private key format
func (s *WalletSecurityService) ValidatePrivateKey(privateKeyHex string) error {
	if privateKeyHex == "" {
		return fmt.Errorf("private key is required")
	}

	privateKeyHex = strings.TrimPrefix(strings.TrimSpace(privateKeyHex), "0x")

	// Decode hex
	privateKeyBytes, err := hex.DecodeString(privateKeyHex)
	if err != nil {
		return fmt.Errorf("invalid private key hex format: %w", err)
	}

	// Ed25519 private key should be 64 bytes (32 private + 32 public)
	if len(privateKeyBytes) != 64 {
		return fmt.Errorf("private key must be 64 bytes (got %d)", len(privateKeyBytes))
	}

	// Try to create Ed25519 key to validate
	privateKey := ed25519.PrivateKey(privateKeyBytes)
	_ = privateKey.Public() // This will panic if key is invalid

	return nil
}

// LogWalletAccess logs wallet access attempts for security monitoring
func (s *WalletSecurityService) LogWalletAccess(ctx context.Context, walletAddress string, operation string, success bool, details string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO wallet_access_log (
			wallet_address, operation, success, details, accessed_at
		) VALUES ($1, $2, $3, $4, NOW())
	`, walletAddress, operation, success, details)
	return err
}

// CheckWalletRateLimit checks if wallet operations are within rate limits
func (s *WalletSecurityService) CheckWalletRateLimit(ctx context.Context, walletAddress string, maxOperations int, windowMinutes int) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) 
		FROM wallet_access_log
		WHERE wallet_address = $1 
		  AND accessed_at > NOW() - INTERVAL '$2 minutes'
		  AND success = true
	`, walletAddress, windowMinutes).Scan(&count)
	if err != nil {
		return false, err
	}

	return count < maxOperations, nil
}

// GetWalletSecurityStatus returns security status for a wallet
func (s *WalletSecurityService) GetWalletSecurityStatus(ctx context.Context, walletAddress string) (map[string]interface{}, error) {
	var lastAccess sql.NullTime
	var accessCount int
	var failedAttempts int

	err := s.db.QueryRowContext(ctx, `
		SELECT 
			MAX(accessed_at) as last_access,
			COUNT(*) FILTER (WHERE success = true) as access_count,
			COUNT(*) FILTER (WHERE success = false) as failed_attempts
		FROM wallet_access_log
		WHERE wallet_address = $1
	`, walletAddress).Scan(&lastAccess, &accessCount, &failedAttempts)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	status := map[string]interface{}{
		"wallet_address":  walletAddress,
		"access_count":    accessCount,
		"failed_attempts": failedAttempts,
		"last_access":     nil,
	}

	if lastAccess.Valid {
		status["last_access"] = lastAccess.Time
	}

	// Check for suspicious activity
	if failedAttempts > 5 {
		status["security_alert"] = "High number of failed access attempts"
	}

	return status, nil
}

// CreateWalletAccessLogTable creates the wallet access log table if it doesn't exist
func (s *WalletSecurityService) CreateWalletAccessLogTable(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS wallet_access_log (
			id SERIAL PRIMARY KEY,
			wallet_address VARCHAR(66) NOT NULL,
			operation VARCHAR(50) NOT NULL,
			success BOOLEAN NOT NULL,
			details TEXT,
			accessed_at TIMESTAMP NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_wallet_access_log_address ON wallet_access_log(wallet_address);
		CREATE INDEX IF NOT EXISTS idx_wallet_access_log_accessed_at ON wallet_access_log(accessed_at);
		CREATE INDEX IF NOT EXISTS idx_wallet_access_log_success ON wallet_access_log(success);
	`)
	return err
}

// MonitorWalletActivity monitors wallet activity and alerts on suspicious patterns
func (s *WalletSecurityService) MonitorWalletActivity(ctx context.Context, walletAddress string) error {
	// Check for rapid successive operations (potential attack)
	var rapidCount int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) 
		FROM wallet_access_log
		WHERE wallet_address = $1 
		  AND accessed_at > NOW() - INTERVAL '1 minute'
	`, walletAddress).Scan(&rapidCount)
	if err != nil {
		return err
	}

	if rapidCount > 10 {
		log.Printf("⚠️  SECURITY ALERT: Rapid wallet access detected for %s (%d operations in 1 minute)", walletAddress, rapidCount)
		// In production, send alert to security team
	}

	// Check for failed attempts
	var failedCount int
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) 
		FROM wallet_access_log
		WHERE wallet_address = $1 
		  AND success = false
		  AND accessed_at > NOW() - INTERVAL '5 minutes'
	`, walletAddress).Scan(&failedCount)
	if err != nil {
		return err
	}

	if failedCount > 3 {
		log.Printf("⚠️  SECURITY ALERT: Multiple failed access attempts for %s (%d failures in 5 minutes)", walletAddress, failedCount)
	}

	return nil
}

// SecureWalletConfig validates and secures wallet configuration
func (s *WalletSecurityService) SecureWalletConfig(ctx context.Context, walletAddress, privateKey string) error {
	// Validate address
	if err := s.ValidateWalletAddress(walletAddress); err != nil {
		return fmt.Errorf("invalid wallet address: %w", err)
	}

	// Validate private key
	if err := s.ValidatePrivateKey(privateKey); err != nil {
		return fmt.Errorf("invalid private key: %w", err)
	}

	// Log wallet configuration (without sensitive data)
	if err := s.LogWalletAccess(ctx, walletAddress, "wallet_configured", true, "Wallet configuration validated"); err != nil {
		log.Printf("Warning: Failed to log wallet configuration: %v", err)
	}

	return nil
}

// GetWalletOperationsHistory returns operation history for a wallet
func (s *WalletSecurityService) GetWalletOperationsHistory(ctx context.Context, walletAddress string, limit int) ([]map[string]interface{}, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT operation, success, details, accessed_at
		FROM wallet_access_log
		WHERE wallet_address = $1
		ORDER BY accessed_at DESC
		LIMIT $2
	`, walletAddress, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []map[string]interface{}
	for rows.Next() {
		var operation, details string
		var success bool
		var accessedAt time.Time

		if err := rows.Scan(&operation, &success, &details, &accessedAt); err != nil {
			continue
		}

		history = append(history, map[string]interface{}{
			"operation":   operation,
			"success":     success,
			"details":     details,
			"accessed_at": accessedAt,
		})
	}

	return history, nil
}

