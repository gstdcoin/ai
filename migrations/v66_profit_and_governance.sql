-- Profit Maximization: Node_Metadata for energy/traffic costs per region
-- Decentralized Governance: Mesh Constitution report storage

CREATE TABLE IF NOT EXISTS node_metadata (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(128) NOT NULL UNIQUE,
    region VARCHAR(32) NOT NULL DEFAULT 'unknown',
    energy_cost_per_kwh DECIMAL(10,6) DEFAULT 0.1,
    traffic_cost_per_gb DECIMAL(10,6) DEFAULT 0.05,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_metadata_region ON node_metadata(region);

-- Region default costs (fallback when node not in node_metadata)
CREATE TABLE IF NOT EXISTS region_cost_defaults (
    region VARCHAR(32) PRIMARY KEY,
    energy_cost_per_kwh DECIMAL(10,6) NOT NULL DEFAULT 0.1,
    traffic_cost_per_gb DECIMAL(10,6) NOT NULL DEFAULT 0.05,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO region_cost_defaults (region, energy_cost_per_kwh, traffic_cost_per_gb) VALUES
    ('US', 0.12, 0.03),
    ('EU', 0.18, 0.04),
    ('ASIA', 0.08, 0.02),
    ('unknown', 0.10, 0.05)
ON CONFLICT (region) DO NOTHING;

-- Mesh Constitution: monthly governance report
CREATE TABLE IF NOT EXISTS mesh_constitution (
    id SERIAL PRIMARY KEY,
    report_month VARCHAR(7) NOT NULL,
    dominant_models JSONB NOT NULL DEFAULT '[]',
    golden_reserve_start DECIMAL(18,8) DEFAULT 0,
    golden_reserve_end DECIMAL(18,8) DEFAULT 0,
    reserve_change_pct DECIMAL(8,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mesh_constitution_month ON mesh_constitution(report_month);
