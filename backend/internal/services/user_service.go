package services

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"distributed-computing-platform/internal/models"
)

type UserService struct {
	db *sql.DB
}

func NewUserService(db *sql.DB) *UserService {
	return &UserService{db: db}
}

// LoginOrRegister checks if a user exists, and if not, creates a new user with balance 0
// Returns (user, isNewlyCreated, error)
func (s *UserService) LoginOrRegister(ctx context.Context, walletAddress string) (*models.User, bool, error) {
	if walletAddress == "" {
		return nil, false, errors.New("wallet_address is required")
	}

	var user models.User
	var createdAt, updatedAt time.Time

	// Try to get existing user
	err := s.db.QueryRowContext(ctx, `
		SELECT wallet_address, balance, created_at, updated_at
		FROM users
		WHERE wallet_address = $1
	`, walletAddress).Scan(
		&user.WalletAddress,
		&user.Balance,
		&createdAt,
		&updatedAt,
	)

	if err == nil {
		user.CreatedAt = createdAt
		user.UpdatedAt = updatedAt
		return &user, false, nil
	}

	if err != sql.ErrNoRows {
		return nil, false, err
	}

	// User doesn't exist, create new user
	now := time.Now()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO users (wallet_address, balance, created_at, updated_at)
		VALUES ($1, 0, $2, $2)
	`, walletAddress, now)
	if err != nil {
		return nil, false, err
	}

	user = models.User{
		WalletAddress: walletAddress,
		Balance:       0,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	return &user, true, nil
}

// GetUser retrieves a user by wallet address
func (s *UserService) GetUser(ctx context.Context, walletAddress string) (*models.User, error) {
	var user models.User
	var createdAt, updatedAt time.Time

	err := s.db.QueryRowContext(ctx, `
		SELECT wallet_address, balance, created_at, updated_at
		FROM users
		WHERE wallet_address = $1
	`, walletAddress).Scan(
		&user.WalletAddress,
		&user.Balance,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		return nil, err
	}

	user.CreatedAt = createdAt
	user.UpdatedAt = updatedAt
	return &user, nil
}


// GetUserID resolves wallet address to a pseudo user ID (hash)
// Since users table uses wallet_address as primary key, we generate a stable int from it
// GetUserID removed as it relied on unstable hash generation - use wallet_address as PK
