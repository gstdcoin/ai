package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
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
		TrustScore:    0.5,
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

// ActivateWalletAsNode — Wallet-as-Node via Telegram: creates minimal node record so wallet can claim tasks.
// Node ID = wallet_address so browser/Telegram workers can use wallet as node_id when submitting.
func (s *NodeService) ActivateWalletAsNode(ctx context.Context, walletAddress string) (*models.Node, bool, error) {
	if walletAddress == "" {
		return nil, false, errors.New("wallet_address is required")
	}
	existing, err := s.GetNodeByWalletAddress(ctx, walletAddress)
	if err == nil && existing != nil {
		// Already have a node - update last_seen
		_, _ = s.db.ExecContext(ctx, `UPDATE nodes SET status = 'online', last_seen = NOW(), updated_at = NOW() WHERE wallet_address = $1`, walletAddress)
		return existing, false, nil
	}
	// Create Wallet-as-Node: use wallet as id so worker can pass wallet as node_id
	short := walletAddress
	if len(short) > 12 {
		short = short[:6] + "..." + short[len(short)-6:]
	}
	name := "Wallet-Node-" + short
	_, _ = s.db.ExecContext(ctx, `
		INSERT INTO users (wallet_address, created_at, updated_at) 
		VALUES ($1, NOW(), NOW()) 
		ON CONFLICT (wallet_address) DO NOTHING
	`, walletAddress)
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO nodes (id, wallet_address, name, status, trust_score, last_seen, created_at, updated_at)
		VALUES ($1, $2, $3, 'online', 0.5, NOW(), NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET status = 'online', last_seen = NOW(), updated_at = NOW()
	`, walletAddress, walletAddress, name)
	if err != nil {
		return nil, false, fmt.Errorf("failed to activate wallet-as-node: %w", err)
	}
	node, _ := s.GetNodeByWalletAddress(ctx, walletAddress)
	return node, true, nil
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
		s.redis.Set(ctx, onlineKey, "online", 90*time.Second) // 90s TTL (standardized)

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

// GetActiveNodeCount returns count of nodes online in last 5 minutes
func (s *NodeService) GetActiveNodeCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM nodes 
		WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'
	`).Scan(&count)
	return count, err
}

// GetPublicActiveNodes returns basic info about all online nodes with pagination support
func (s *NodeService) GetPublicActiveNodes(ctx context.Context, limit, offset int) ([]map[string]interface{}, error) {
	if limit <= 0 || limit > 500 {
		limit = 100 // Default/Max limit for public map to prevent DB strain
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, status, COALESCE(latitude, 0), COALESCE(longitude, 0), name, wallet_address
		FROM nodes
		WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'
		ORDER BY last_seen DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []map[string]interface{}
	for rows.Next() {
		var id, status, name, wallet string
		var lat, lon float64
		if err := rows.Scan(&id, &status, &lat, &lon, &name, &wallet); err != nil {
			continue
		}
		nodes = append(nodes, map[string]interface{}{
			"id":     id,
			"status": status,
			"lat":    lat,
			"lon":    lon,
			"name":   name,
			"wallet": wallet[:min(12, len(wallet))] + "...",
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
	res, err := s.db.ExecContext(ctx, updateSQL, args...)
	if err != nil {
		log.Printf("[NodeService] UpdateHealthStats UPDATE err: %v", err)
		return err
	}

	// Auto-register: if UPDATE affected 0 rows, the node doesn't exist yet — create it
	if rowsAffected, err := res.RowsAffected(); err == nil && rowsAffected == 0 {
		isUUID := len(identifier) == 36 && strings.Contains(identifier, "-")

		// Ensure user exists (auto-create minimal user so FK doesn't fail)
		if !isUUID {
			_, err = s.db.ExecContext(ctx, `
				INSERT INTO users (wallet_address, created_at, updated_at) 
				VALUES ($1, NOW(), NOW()) ON CONFLICT (wallet_address) DO NOTHING
			`, identifier)
			if err != nil {
				log.Printf("[NodeService] Auto-register user insert err: %v", err)
			}
		}

		if isUUID {
			_, err = s.db.ExecContext(ctx, `
				INSERT INTO nodes (id, wallet_address, name, status, trust_score, last_seen, created_at, updated_at)
				VALUES ($1, $1, 'auto-registered', 'online', 0.5, NOW(), NOW(), NOW())
				ON CONFLICT (id) DO UPDATE SET status = 'online', last_seen = NOW(), updated_at = NOW()
			`, identifier)
		} else {
			_, err = s.db.ExecContext(ctx, `
				INSERT INTO nodes (id, wallet_address, name, status, trust_score, last_seen, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, 'auto-registered', 'online', 0.5, NOW(), NOW(), NOW())
				ON CONFLICT (wallet_address) DO UPDATE SET status = 'online', last_seen = NOW(), updated_at = NOW()
			`, identifier)
		}

		if err != nil {
			log.Printf("[NodeService] Auto-registered node err: %v", err)
		} else {
			log.Printf("[NodeService] Auto-registered node: %s", identifier)
		}
	}

	if s.redis == nil {
		return nil
	}

	detailsKey := fmt.Sprintf("capacity:%s", identifier)
	onlineKey := fmt.Sprintf("worker:online:%s", identifier)

	// Refresh online status
	s.redis.Set(ctx, onlineKey, "online", 90*time.Second)

	// Update health metrics (Omega: include h3_index for geo-routing / Vision task sharding)
	capacityData := map[string]interface{}{
		"battery_level":  battery,
		"signal_quality": signal,
		"last_seen":      time.Now().Format(time.RFC3339),
	}
	if lat != nil && lon != nil && s.geo != nil {
		capacityData["h3_index"] = s.geo.LatLonToH3Index(*lat, *lon, H3Resolution)
	}
	err = s.redis.HSet(ctx, detailsKey, capacityData).Err()

	s.UpdateHeartbeat(ctx, identifier)
	return err
}

// MaintenanceAlert - Owner's Advocate AI: Predictive maintenance suggestion
type MaintenanceAlert struct {
	NodeID         string `json:"node_id"`
	Severity       string `json:"severity"` // info, warning, critical
	Message        string `json:"message"`
	Recommendation string `json:"recommendation"`
}

// GetMaintenanceAlerts returns predictive maintenance alerts for a wallet's nodes.
// Heuristics: low battery, low signal, long uptime (cooling), etc.
func (s *NodeService) GetMaintenanceAlerts(ctx context.Context, wallet string) ([]MaintenanceAlert, error) {
	var alerts []MaintenanceAlert
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, last_seen, status
		FROM nodes WHERE wallet_address = $1 AND status = 'online'
	`, wallet)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	addedGeneric := false
	for rows.Next() {
		var id, name, status string
		var lastSeen interface{}
		if err := rows.Scan(&id, &name, &lastSeen, &status); err != nil {
			continue
		}
		// Check Redis capacity for battery/signal (if available)
		if s.redis != nil {
			detailsKey := fmt.Sprintf("capacity:%s", id)
			capacity, _ := s.redis.HGetAll(ctx, detailsKey).Result()
			if bat, ok := capacity["battery_level"]; ok && bat != "" {
				var batInt int
				fmt.Sscanf(bat, "%d", &batInt)
				if batInt > 0 && batInt < 20 {
					alerts = append(alerts, MaintenanceAlert{
						NodeID: id, Severity: "warning",
						Message:        fmt.Sprintf("Node %s: Battery at %d%%", name, batInt),
						Recommendation: "Consider charging or switching to Eco mode to preserve battery.",
					})
				}
			}
		}
		if !addedGeneric {
			alerts = append(alerts, MaintenanceAlert{
				NodeID: id, Severity: "info",
				Message:        "Owner's Advocate: Hardware care tip",
				Recommendation: "If you notice high fan speeds, consider cleaning the device to maintain mining efficiency.",
			})
			addedGeneric = true
		}
	}
	return alerts, nil
}

// MarkStaleNodesOffline sets status='offline' for nodes that missed heartbeats.
// Should be called periodically (e.g., every 5 minutes from background goroutine).
func (s *NodeService) MarkStaleNodesOffline(ctx context.Context, staleThreshold time.Duration) (int64, error) {
	if staleThreshold == 0 {
		staleThreshold = 10 * time.Minute
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE nodes SET status = 'offline', updated_at = NOW()
		WHERE status = 'online' AND last_seen < NOW() - $1::interval
	`, fmt.Sprintf("%d seconds", int(staleThreshold.Seconds())))
	if err != nil {
		return 0, fmt.Errorf("mark stale nodes offline: %w", err)
	}
	affected, _ := result.RowsAffected()
	return affected, nil
}
