-- Universal Mesh Protocol: compute_contributions for XAUt share calculation
-- Each node (PC, server, phone) receives XAUt proportional to compute contribution

CREATE TABLE IF NOT EXISTS compute_contributions (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(128) NOT NULL,
    wallet_address VARCHAR(128),
    platform VARCHAR(16) NOT NULL,
    compute_units DECIMAL(18,6) NOT NULL,
    task_id VARCHAR(64),
    model VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compute_contributions_wallet ON compute_contributions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_compute_contributions_platform ON compute_contributions(platform);
CREATE INDEX IF NOT EXISTS idx_compute_contributions_created ON compute_contributions(created_at);
