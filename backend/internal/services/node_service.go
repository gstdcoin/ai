package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"distributed-computing-platform/internal/models"

	"github.com/google/uuid"
)

type NodeService struct {
	db *sql.DB
}

func NewNodeService(db *sql.DB) *NodeService {
	return &NodeService{db: db}
}

// RegisterNode registers a new computing node for a wallet
func (s *NodeService) RegisterNode(ctx context.Context, walletAddress string, name string, specs map[string]interface{}, country *string) (*models.Node, error) {
	if walletAddress == "" {
		return nil, errors.New("wallet_address is required")
	}
	if name == "" {
		return nil, errors.New("name is required")
	}

	// Generate unique node ID
	nodeID := uuid.New().String()

	// Extract specs
	var cpuModel *string
	var ramGB *int

	if cpu, ok := specs["cpu"].(string); ok && cpu != "" {
		cpuModel = &cpu
	}
	if ram, ok := specs["ram"]; ok {
		switch v := ram.(type) {
		case float64:
			ramInt := int(v)
			ramGB = &ramInt
		case int:
			ramGB = &v
		}
	}

	now := time.Now()
	node := &models.Node{
		ID:            nodeID,
		WalletAddress: walletAddress,
		Name:          name,
		Status:        "offline",
		CPUModel:      cpuModel,
		RAMGB:         ramGB,
		TrustScore:    1.0, // Default trust score
		Country:       country,
		LastSeen:      now,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// Set default trust_score to 1.0
	trustScore := 1.0
	if node.TrustScore > 0 {
		trustScore = node.TrustScore
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO nodes (id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, last_seen, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, node.ID, node.WalletAddress, node.Name, node.Status, node.CPUModel, node.RAMGB, trustScore, node.Country, node.LastSeen, node.CreatedAt, node.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to register node: %w", err)
	}

	return node, nil
}

// GetMyNodes retrieves all nodes owned by a wallet address
func (s *NodeService) GetMyNodes(ctx context.Context, walletAddress string) ([]*models.Node, error) {
	if walletAddress == "" {
		return nil, errors.New("wallet_address is required")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, last_seen, created_at, updated_at
		FROM nodes
		WHERE wallet_address = $1
		ORDER BY created_at DESC
	`, walletAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to query nodes: %w", err)
	}
	defer rows.Close()

		var nodes []*models.Node
	for rows.Next() {
		var node models.Node
		var country sql.NullString
		err := rows.Scan(
			&node.ID,
			&node.WalletAddress,
			&node.Name,
			&node.Status,
			&node.CPUModel,
			&node.RAMGB,
			&node.TrustScore,
			&country,
			&node.LastSeen,
			&node.CreatedAt,
			&node.UpdatedAt,
		)
		if country.Valid {
			node.Country = &country.String
		}
		if err != nil {
			continue
		}
		nodes = append(nodes, &node)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating nodes: %w", err)
	}

	return nodes, nil
}

// DecreaseTrustScore decreases trust_score for a node when validation fails
func (s *NodeService) DecreaseTrustScore(ctx context.Context, walletAddress string, penalty float64) error {
	if penalty <= 0 || penalty > 1.0 {
		penalty = 0.1 // Default penalty: 10% reduction
	}

	_, err := s.db.ExecContext(ctx, `
		UPDATE nodes 
		SET trust_score = GREATEST(0.0, trust_score - $1),
		    updated_at = NOW()
		WHERE wallet_address = $2
	`, penalty, walletAddress)
	
	return err
}

// GetNodeByWalletAddress gets a node by wallet address (for trust score updates)
func (s *NodeService) GetNodeByWalletAddress(ctx context.Context, walletAddress string) (*models.Node, error) {
	var node models.Node
	var country sql.NullString
	
	err := s.db.QueryRowContext(ctx, `
		SELECT id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, last_seen, created_at, updated_at
		FROM nodes
		WHERE wallet_address = $1
		LIMIT 1
	`, walletAddress).Scan(
		&node.ID,
		&node.WalletAddress,
		&node.Name,
		&node.Status,
		&node.CPUModel,
		&node.RAMGB,
		&node.TrustScore,
		&country,
		&node.LastSeen,
		&node.CreatedAt,
		&node.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	if country.Valid {
		node.Country = &country.String
	}
	
	return &node, nil
}

