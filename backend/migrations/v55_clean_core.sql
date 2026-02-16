-- Clean Core Protocol: Proof-of-Storage, endpoint_url for decentralized inference

CREATE TABLE IF NOT EXISTS proof_of_storage (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(128) NOT NULL,
    wallet_address VARCHAR(128),
    model_id VARCHAR(64) NOT NULL,
    block_ids JSONB NOT NULL,
    proof_hash VARCHAR(128) NOT NULL,
    verified_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proof_of_storage_node ON proof_of_storage(node_id);
CREATE INDEX IF NOT EXISTS idx_proof_of_storage_verified ON proof_of_storage(verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_proof_of_storage_model ON proof_of_storage(model_id);

-- endpoint_url for nodes to receive proxied inference requests
ALTER TABLE pipeline_nodes ADD COLUMN IF NOT EXISTS endpoint_url VARCHAR(256);
