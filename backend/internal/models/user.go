package models

import (
	"time"
)

type User struct {
	WalletAddress string    `json:"wallet_address" db:"wallet_address"`
	Balance       float64   `json:"balance" db:"balance"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

