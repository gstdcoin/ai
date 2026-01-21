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

// RegisterNode registers or updates a computing node for a wallet
func (s *NodeService) RegisterNode(ctx context.Context, walletAddress string, name string, specs map[string]interface{}, country *string, lat, lon *float64, isSpoofing bool) (*models.Node, error) {
	if walletAddress == "" {
		return nil, errors.New("wallet_address is required")
	}
	if name == "" {
		return nil, errors.New("name is required")
	}

	// Try to find existing node for this wallet
	existing, err := s.GetNodeByWalletAddress(ctx, walletAddress)
	isUpdate := err == nil && existing != nil

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
	status := "online"
	if isSpoofing {
		status = "suspended"
	}

	var nodeID string
	if isUpdate {
		nodeID = existing.ID
	} else {
		nodeID = uuid.New().String()
	}

	node := &models.Node{
		ID:            nodeID,
		WalletAddress: walletAddress,
		Name:          name,
		Status:        status,
		CPUModel:      cpuModel,
		RAMGB:         ramGB,
		TrustScore:    1.0,
		Country:       country,
		Latitude:      lat,
		Longitude:     lon,
		IsSpoofing:    isSpoofing,
		LastSeen:      now,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if isUpdate {
		node.CreatedAt = existing.CreatedAt
		node.TrustScore = existing.TrustScore
		
		_, err = s.db.ExecContext(ctx, `
			UPDATE nodes 
			SET name = $1, status = $2, cpu_model = $3, ram_gb = $4, country = $5, 
			    latitude = $6, longitude = $7, is_spoofing = $8, last_seen = $9, updated_at = $10
			WHERE wallet_address = $11
		`, node.Name, node.Status, node.CPUModel, node.RAMGB, node.Country, 
		   node.Latitude, node.Longitude, node.IsSpoofing, node.LastSeen, node.UpdatedAt, walletAddress)
	} else {
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO nodes (id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, latitude, longitude, is_spoofing, last_seen, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		`, node.ID, node.WalletAddress, node.Name, node.Status, node.CPUModel, node.RAMGB, node.TrustScore, node.Country, 
		   node.Latitude, node.Longitude, node.IsSpoofing, node.LastSeen, node.CreatedAt, node.UpdatedAt)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to register/update node: %w", err)
	}

	return node, nil
}

// GetMyNodes retrieves all nodes owned by a wallet address
func (s *NodeService) GetMyNodes(ctx context.Context, walletAddress string) ([]*models.Node, error) {
	if walletAddress == "" {
		return nil, errors.New("wallet_address is required")
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, latitude, longitude, is_spoofing, last_seen, created_at, updated_at
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
		var lat, lon sql.NullFloat64
		err := rows.Scan(
			&node.ID,
			&node.WalletAddress,
			&node.Name,
			&node.Status,
			&node.CPUModel,
			&node.RAMGB,
			&node.TrustScore,
			&country,
			&lat,
			&lon,
			&node.IsSpoofing,
			&node.LastSeen,
			&node.CreatedAt,
			&node.UpdatedAt,
		)
		if country.Valid {
			node.Country = &country.String
		}
		if lat.Valid {
			node.Latitude = &lat.Float64
		}
		if lon.Valid {
			node.Longitude = &lon.Float64
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
	var lat, lon sql.NullFloat64
	
	err := s.db.QueryRowContext(ctx, `
		SELECT id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, latitude, longitude, is_spoofing, last_seen, created_at, updated_at
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
		&lat,
		&lon,
		&node.IsSpoofing,
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
	if lat.Valid {
		node.Latitude = &lat.Float64
	}
	if lon.Valid {
		node.Longitude = &lon.Float64
	}
	
	return &node, nil
}

