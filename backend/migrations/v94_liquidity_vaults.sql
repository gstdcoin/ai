-- Liquidity Vaults table for Sovereign DLN
CREATE TABLE IF NOT EXISTS liquidity_vaults (
    id SERIAL PRIMARY KEY,
    vault_id VARCHAR(100) UNIQUE NOT NULL,
    node_wallet VARCHAR(255) NOT NULL REFERENCES nodes(wallet_address) ON DELETE CASCADE,
    asset VARCHAR(20) NOT NULL,
    total_liquidity NUMERIC(20,4) DEFAULT 0,
    operator_stake NUMERIC(20,4) DEFAULT 0,
    delegator_stake NUMERIC(20,4) DEFAULT 0,
    management_fee_pct NUMERIC(5,4) DEFAULT 0,
    total_volume NUMERIC(20,4) DEFAULT 0,
    generated_yield NUMERIC(20,4) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_liquidity_vaults_node ON liquidity_vaults(node_wallet);
CREATE INDEX IF NOT EXISTS idx_liquidity_vaults_asset ON liquidity_vaults(asset);
