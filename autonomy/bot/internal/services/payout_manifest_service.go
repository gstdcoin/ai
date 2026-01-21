package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// WorkerReward represents reward details for a specific worker in the manifest
type WorkerReward struct {
	WorkerID string  `json:"worker_id"`
	Wallet   string  `json:"wallet"`
	Amount   float64 `json:"amount"` // Amount in GSTD
}

// PayoutManifest represents a batch of rewards to be authorized by Admin
type PayoutManifest struct {
	Timestamp    int64          `json:"timestamp"`
	Workers      []WorkerReward `json:"workers"`
	TotalAmount  float64        `json:"total_amount"`
	ManifestHash string         `json:"manifest_hash,omitempty"`
}

// PayoutManifestService handles generation and hashing of payout manifests
type PayoutManifestService struct {
	db *sql.DB
}

// NewPayoutManifestService creates a new manifest service
func NewPayoutManifestService(db *sql.DB) *PayoutManifestService {
	return &PayoutManifestService{db: db}
}

// GenerateManifest collects all pending rewards and creates a signed manifest
func (s *PayoutManifestService) GenerateManifest(ctx context.Context) (*PayoutManifest, error) {
	// Query pending completed tasks that haven't been processed for payout
	// We group by assigned_device (worker ID) and join with nodes to get wallet address
	rows, err := s.db.QueryContext(ctx, `
		SELECT n.id, n.wallet_address, SUM(t.reward_gstd)
		FROM tasks t
		JOIN nodes n ON t.assigned_device = n.id
		WHERE t.status = 'completed' 
		  AND t.executor_payout_status = 'pending'
		  AND t.reward_gstd > 0
		GROUP BY n.id, n.wallet_address
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query pending rewards: %w", err)
	}
	defer rows.Close()

	var workers []WorkerReward
	var total float64
	for rows.Next() {
		var w WorkerReward
		if err := rows.Scan(&w.WorkerID, &w.Wallet, &w.Amount); err != nil {
			log.Printf("⚠️  Error scanning reward row: %v", err)
			continue
		}
		workers = append(workers, w)
		total += w.Amount
	}

	if len(workers) == 0 {
		return nil, fmt.Errorf("no pending rewards found for manifest")
	}

	manifest := &PayoutManifest{
		Timestamp:   time.Now().Unix(),
		Workers:     workers,
		TotalAmount: total,
	}

	// Generate Hash for protection and blockchain verification
	hash, err := s.CalculateHash(manifest)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate manifest hash: %w", err)
	}
	manifest.ManifestHash = hash

	return manifest, nil
}

// CalculateHash generates a SHA256 hash of the manifest data (excluding the hash itself)
func (s *PayoutManifestService) CalculateHash(manifest *PayoutManifest) (string, error) {
	// We create a temporary structure to ensure consistent JSON ordering if needed, 
	// though Go's json.Marshal is generally consistent for simple structs.
	type ManifestData struct {
		Timestamp   int64          `json:"timestamp"`
		Workers     []WorkerReward `json:"workers"`
		TotalAmount float64        `json:"total_amount"`
	}
	
	data := ManifestData{
		Timestamp:   manifest.Timestamp,
		Workers:     manifest.Workers,
		TotalAmount: manifest.TotalAmount,
	}
	
	jsonData, err := json.Marshal(data)
	if err != nil {
		return "", err
	}
	
	hash := sha256.Sum256(jsonData)
	return "0x" + hex.EncodeToString(hash[:]), nil
}

// MarkAsProcessed updates the status of tasks included in a manifest
// In a real scenario, this would be called after the Admin confirms the transaction on-chain
func (s *PayoutManifestService) MarkAsProcessed(ctx context.Context, workerIDs []string, txHash string) error {
	// This is a simplified version; in production we'd track which tasks belong to which manifest
	_, err := s.db.ExecContext(ctx, `
		UPDATE tasks
		SET executor_payout_status = 'confirmed',
		    executor_payout_tx_hash = $1,
		    updated_at = NOW()
		WHERE assigned_device = ANY($2)
		  AND status = 'completed'
		  AND executor_payout_status = 'pending'
	`, txHash, workerIDs)
	
	return err
}
