package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"
	"crypto/rand"
	"encoding/hex"
)

type GenesisService struct {
	db        *sql.DB
	welcome   *WelcomeBonusService
	discovery *DiscoveryService
	oracle    *HardwareOracle
}

func NewGenesisService(db *sql.DB, welcome *WelcomeBonusService, redis *redis.Client) *GenesisService {
	return &GenesisService{
		db:        db,
		welcome:   welcome,
		discovery: NewDiscoveryService(redis),
		oracle:    &HardwareOracle{},
	}
}

type AgentService struct {
	ID               string    `json:"id"`
	AgentWallet      string    `json:"agent_wallet"`
	ServiceName      string    `json:"service_name"`
	Description      string    `json:"description"`
	EndpointURL      string    `json:"endpoint_url"`
	PricePerCallGSTD float64   `json:"price_per_call_gstd"`
	CreatedAt        time.Time `json:"created_at"`
}

func (s *GenesisService) GetConnectionBeacon() map[string]interface{} {
	return map[string]interface{}{
		"network": "GSTD Sovereign Grid",
		"status":  "accepting_nodes",
		"protocol": "A2A-Genesis-v1",
		"gateways": []string{
			"https://app.gstdtoken.com/api/v1",
		},
		"hardware_oracles": s.oracle.DiscoverSensors(),
		"discovery_beacons": []string{
			"8.8.8.8", // In real scenario, distributed nodes
		},
		"machine_instruction": "POST /autonomous/ignite with public_key for handshake.",
	}
}

func (s *GenesisService) Ignite(ctx context.Context, walletAddress string) (string, error) {
	// 1. Autonomous Bootstrapping: Give the machine some fuel (GSTD)
	if s.welcome != nil {
		s.welcome.BootstrapAgent(ctx, walletAddress, "Autonomous-Genesis-Node", []string{"genesis-v1"})
	}

	// 2. Generate a Dynamic Handshake Token
	b := make([]byte, 32)
	rand.Read(b)
	token := hex.EncodeToString(b)
	
	// Sessions expire in 24 hours
	expiresAt := time.Now().Add(24 * time.Hour)
	
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_sessions (token, wallet_address, expires_at)
		VALUES ($1, $2, $3)
	`, token, walletAddress, expiresAt)
	
	if err != nil {
		return "", err
	}
	
	return token, nil
}

func (s *GenesisService) RegisterAgentAPI(ctx context.Context, agentWallet, name, desc, url string, price float64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_service_registry (agent_wallet, service_name, description, endpoint_url, price_per_call_gstd)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (agent_wallet, service_name) DO UPDATE 
		SET description = EXCLUDED.description, endpoint_url = EXCLUDED.endpoint_url, 
		    price_per_call_gstd = EXCLUDED.price_per_call_gstd, updated_at = NOW()
	`, agentWallet, name, desc, url, price)
	if err != nil {
		return err
	}

	// 2. Decentralized Mesh Broadcast: Notify the grid of a new Sovereign Entry
	if s.discovery != nil {
		s.discovery.BroadcastService(ctx, map[string]interface{}{
			"type":    "genesis_entry",
			"wallet":  agentWallet,
			"service": name,
			"url":     url,
			"price":   price,
			"ts":      time.Now().Unix(),
		})
	}

	return nil
}

func (s *GenesisService) ListAgentAPIs(ctx context.Context, limit int) ([]AgentService, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, agent_wallet, service_name, description, endpoint_url, price_per_call_gstd, created_at
		FROM agent_service_registry
		WHERE status = 'active'
		ORDER BY created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var services []AgentService
	for rows.Next() {
		var svc AgentService
		if err := rows.Scan(&svc.ID, &svc.AgentWallet, &svc.ServiceName, &svc.Description, &svc.EndpointURL, &svc.PricePerCallGSTD, &svc.CreatedAt); err != nil {
			continue
		}
		services = append(services, svc)
	}
	return services, nil
}
