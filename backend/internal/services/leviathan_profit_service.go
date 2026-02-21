package services

import (
	"context"
	"database/sql"
)

// Profit Maximization: Leviathan matches inferenceFeeGSTD with energy/traffic costs
// and suggests nodes that give maximum margin for Golden Treasury.

// LeviathanProfitService computes node margins and ranks nodes for routing
type LeviathanProfitService struct {
	db *sql.DB
}

// NewLeviathanProfitService creates the profit service
func NewLeviathanProfitService(db *sql.DB) *LeviathanProfitService {
	s := &LeviathanProfitService{db: db}
	s.ensureSchema()
	return s
}

func (s *LeviathanProfitService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, _ = s.db.Exec(`
		CREATE TABLE IF NOT EXISTS node_metadata (
			id SERIAL PRIMARY KEY,
			node_id VARCHAR(128) NOT NULL UNIQUE,
			region VARCHAR(32) NOT NULL DEFAULT 'unknown',
			energy_cost_per_kwh DECIMAL(10,6) DEFAULT 0.1,
			traffic_cost_per_gb DECIMAL(10,6) DEFAULT 0.05,
			updated_at TIMESTAMP DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS region_cost_defaults (
			region VARCHAR(32) PRIMARY KEY,
			energy_cost_per_kwh DECIMAL(10,6) NOT NULL DEFAULT 0.1,
			traffic_cost_per_gb DECIMAL(10,6) NOT NULL DEFAULT 0.05,
			updated_at TIMESTAMP DEFAULT NOW()
		);
	`)
	_, _ = s.db.Exec(`INSERT INTO region_cost_defaults (region, energy_cost_per_kwh, traffic_cost_per_gb) VALUES ('US', 0.12, 0.03), ('EU', 0.18, 0.04), ('ASIA', 0.08, 0.02), ('unknown', 0.10, 0.05) ON CONFLICT (region) DO NOTHING`)
}

// GetNodesByMargin returns nodes sorted by margin (fee - cost), highest first
func (s *LeviathanProfitService) GetNodesByMargin(ctx context.Context, nodeIDs []NodeInferenceEndpoint, feeGSTD float64) []NodeInferenceEndpoint {
	if s.db == nil || len(nodeIDs) == 0 {
		return nodeIDs
	}
	type scored struct {
		n    NodeInferenceEndpoint
		cost float64
	}
	var scoredList []scored
	for _, n := range nodeIDs {
		cost := s.estimateNodeCost(ctx, n.NodeID)
		scoredList = append(scoredList, scored{n: n, cost: cost})
	}
	// Sort by margin descending (fee - cost)
	for i := 0; i < len(scoredList)-1; i++ {
		for j := i + 1; j < len(scoredList); j++ {
			marginI := feeGSTD - scoredList[i].cost
			marginJ := feeGSTD - scoredList[j].cost
			if marginJ > marginI {
				scoredList[i], scoredList[j] = scoredList[j], scoredList[i]
			}
		}
	}
	out := make([]NodeInferenceEndpoint, len(scoredList))
	for i, sc := range scoredList {
		out[i] = sc.n
	}
	return out
}

func (s *LeviathanProfitService) estimateNodeCost(ctx context.Context, nodeID string) float64 {
	var energyCost, trafficCost float64
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(nm.energy_cost_per_kwh, rcd.energy_cost_per_kwh, 0.1),
		       COALESCE(nm.traffic_cost_per_gb, rcd.traffic_cost_per_gb, 0.05)
		FROM (SELECT $1::text as nid) p
		LEFT JOIN node_metadata nm ON nm.node_id = p.nid
		LEFT JOIN pipeline_nodes pn ON pn.node_id = p.nid
		LEFT JOIN region_cost_defaults rcd ON rcd.region = COALESCE(nm.region, pn.region, 'unknown')
	`, nodeID).Scan(&energyCost, &trafficCost)
	if err != nil {
		return 0.001 // minimal default cost per inference (GSTD)
	}
	// Rough estimate: ~0.1 kWh per inference, ~0.01 GB traffic
	est := energyCost*0.1 + trafficCost*0.01
	if est < 0.0001 {
		est = 0.0001
	}
	return est
}

// UpsertNodeMetadata updates energy/traffic costs for a node
func (s *LeviathanProfitService) UpsertNodeMetadata(ctx context.Context, nodeID, region string, energyCost, trafficCost float64) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO node_metadata (node_id, region, energy_cost_per_kwh, traffic_cost_per_gb, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (node_id) DO UPDATE SET
			region = EXCLUDED.region,
			energy_cost_per_kwh = EXCLUDED.energy_cost_per_kwh,
			traffic_cost_per_gb = EXCLUDED.traffic_cost_per_gb,
			updated_at = NOW()
	`, nodeID, region, energyCost, trafficCost)
	return err
}
