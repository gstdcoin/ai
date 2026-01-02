-- Migration v7.0: Nodes Table for Computing Node Registration

-- Create nodes table if it doesn't exist
CREATE TABLE IF NOT EXISTS nodes (
    id VARCHAR(255) PRIMARY KEY, -- UUID/String node_id
    wallet_address VARCHAR(48) NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'offline', -- online/offline
    cpu_model VARCHAR(255),
    ram_gb INTEGER,
    last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_nodes_wallet_address ON nodes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes(last_seen DESC);

