package models

import (
	"time"
)

type Node struct {
	ID           string    `json:"id" db:"id"`
	WalletAddress string   `json:"wallet_address" db:"wallet_address"`
	Name         string   `json:"name" db:"name"`
	Status       string   `json:"status" db:"status"` // online/offline
	CPUModel     *string  `json:"cpu_model,omitempty" db:"cpu_model"`
	RAMGB        *int     `json:"ram_gb,omitempty" db:"ram_gb"`
	LastSeen     time.Time `json:"last_seen" db:"last_seen"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

type RegisterNodeRequest struct {
	Name  string            `json:"name" binding:"required"`
	Specs map[string]interface{} `json:"specs"`
}

