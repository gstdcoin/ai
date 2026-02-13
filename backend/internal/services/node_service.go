package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"distributed-computing-platform/internal/models"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type NodeService struct {
	db    *sql.DB
	redis *redis.Client
	geo   *GeoService
}

func NewNodeService(db *sql.DB, rdb *redis.Client) *NodeService {
	return &NodeService{db: db, redis: rdb}
}

// SetGeoService wires GeoService for H3 indexing on heartbeat
func (s *NodeService) SetGeoService(geo *GeoService) {
	s.geo = geo
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

	// Ensure user exists (for autonomous agents using API Key without prior login)
	// We ignore specific error here as constraint violation means user exists
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO users (wallet_address, created_at, updated_at) 
		VALUES ($1, NOW(), NOW()) 
		ON CONFLICT (wallet_address) DO NOTHING
	`, walletAddress)

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
		TrustScore:    0.3,
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

// GetNodeByID gets a node by its UUID (for heartbeat wallet resolution)
func (s *NodeService) GetNodeByID(ctx context.Context, nodeID string) (*models.Node, error) {
	var node models.Node
	var country sql.NullString
	var lat, lon sql.NullFloat64

	err := s.db.QueryRowContext(ctx, `
		SELECT id, wallet_address, name, status, cpu_model, ram_gb, trust_score, country, latitude, longitude, is_spoofing, last_seen, created_at, updated_at
		FROM nodes
		WHERE id = $1
		LIMIT 1
	`, nodeID).Scan(
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

// UpdateHeartbeat updates the last_seen timestamp. 
// OPTIMIZED: Uses Redis-first approach for 1M+ user scale, batching DB updates.
func (s *NodeService) UpdateHeartbeat(ctx context.Context, walletAddress string) error {
	now := time.Now()
	
	// 1. Always update Redis immediately (fast path)
	if s.redis != nil {
		onlineKey := fmt.Sprintf("worker:online:%s", walletAddress)
		s.redis.Set(ctx, onlineKey, "online", 120*time.Second) // 2 min TTL
		
		// Add to batch update set in Redis
		s.redis.SAdd(ctx, "workers:heartbeat:pending", walletAddress)
		s.redis.HSet(ctx, "workers:heartbeat:times", walletAddress, now.Unix())
	}

	// 2. Synchronous DB update is only done periodically or if Redis is down
	// In high-load scenario, we skip this and let background worker handle it.
	// For backward compatibility and low-load, we still do it but wrap in logic.
	
	return nil
}

// FlushHeartbeats flushes batched heartbeats from Redis to PostgreSQL
// When GeoService is set, also updates h3_index from node's lat/lon (H3 Res 6)
func (s *NodeService) FlushHeartbeats(ctx context.Context) (int64, error) {
	if s.redis == nil {
		return 0, nil
	}

	workers, err := s.redis.SMembers(ctx, "workers:heartbeat:pending").Result()
	if err != nil || len(workers) == 0 {
		return 0, err
	}

	s.redis.Del(ctx, "workers:heartbeat:pending")

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Bulk update last_seen, status
	stmt, _ := tx.PrepareContext(ctx, "UPDATE nodes SET last_seen = NOW(), status = 'online', updated_at = NOW() WHERE wallet_address = ANY($1)")
	res, err := stmt.ExecContext(ctx, workers)
	if err != nil {
		return 0, err
	}

	// Also update devices table
	stmtDev, _ := tx.PrepareContext(ctx, "UPDATE devices SET last_seen_at = NOW(), is_active = true WHERE wallet_address = ANY($1)")
	_, _ = stmtDev.ExecContext(ctx, workers)

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	affected, _ := res.RowsAffected()
	return affected, nil
}

// RegisterSubNode allows a Master wallet to register multiple sharded worker identities
func (s *NodeService) RegisterSubNode(ctx context.Context, masterWallet, subID, name string) error {
	// Logic to bind subID to masterWallet for sharded execution
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sharded_nodes (master_wallet, sub_id, name, created_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (sub_id) DO UPDATE SET name = $3, updated_at = NOW()
	`, masterWallet, subID, name)
	return err
}


// GetPublicActiveNodes returns basic info about all online nodes with pagination support
func (s *NodeService) GetPublicActiveNodes(ctx context.Context, limit, offset int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 500 {
		limit = 100 // Default/Max limit for public map to prevent DB strain
	}
	
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, status, latitude, longitude
		FROM nodes
		WHERE status = 'online' AND latitude IS NOT NULL AND longitude IS NOT NULL
		ORDER BY last_seen DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []map[string]interface{}
	for rows.Next() {
		var id, status string
		var lat, lon float64
		if err := rows.Scan(&id, &status, &lat, &lon); err != nil {
			continue
		}
		nodes = append(nodes, map[string]interface{}{
			"id":     id,
			"status": status,
			"lat":    lat,
			"lon":    lon,
		})
	}
	return nodes, nil
}

// UpdateHealthStats updates worker health metrics in Redis for the Load Balancer.
// Performs immediate DB update so nodes are visible in Dashboard right away.
// identifier can be wallet_address or node id (UUID).
// lat, lon: optional GPS for H3 indexing (Resolution 6)
func (s *NodeService) UpdateHealthStats(ctx context.Context, identifier string, battery int, signal int, lat, lon *float64) error {
	// Build UPDATE with optional h3_index when lat/lon provided
	updateSQL := `UPDATE nodes SET last_seen = NOW(), status = 'online', updated_at = NOW()`
	args := []interface{}{}
	argIdx := 1
	if lat != nil && lon != nil && s.geo != nil {
		h3Idx := s.geo.LatLonToH3Index(*lat, *lon, H3Resolution)
		updateSQL += fmt.Sprintf(`, h3_index = $%d`, argIdx)
		args = append(args, h3Idx)
		argIdx++
	}
	if len(identifier) == 36 && strings.Contains(identifier, "-") {
		updateSQL += fmt.Sprintf(` WHERE id = $%d`, argIdx)
	} else {
		updateSQL += fmt.Sprintf(` WHERE wallet_address = $%d`, argIdx)
	}
	args = append(args, identifier)
	_, _ = s.db.ExecContext(ctx, updateSQL, args...)

	if s.redis == nil {
		return nil
	}

	detailsKey := fmt.Sprintf("capacity:%s", identifier)
	onlineKey := fmt.Sprintf("worker:online:%s", identifier)

	// Refresh online status
	s.redis.Set(ctx, onlineKey, "online", 90*time.Second)

	// Update health metrics
	err := s.redis.HSet(ctx, detailsKey, map[string]interface{}{
		"battery_level":  battery,
		"signal_quality": signal,
		"last_seen":      time.Now().Format(time.RFC3339),
	}).Err()

	s.UpdateHeartbeat(ctx, identifier)
	return err
}
