-- Infrastructure Supremacy: Decentralized Model Hub
-- IPFS + GSTD Storage Layer for distributed LLM weights

CREATE TABLE IF NOT EXISTS model_storage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id VARCHAR(128) NOT NULL UNIQUE,
    model_name VARCHAR(255) NOT NULL,
    ipfs_cid VARCHAR(128),
    storage_layer VARCHAR(32) DEFAULT 'ipfs',
    size_bytes BIGINT DEFAULT 0,
    shard_count INT DEFAULT 1,
    provider_wallet VARCHAR(100),
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_storage_model_id ON model_storage(model_id);
CREATE INDEX IF NOT EXISTS idx_model_storage_provider ON model_storage(provider_wallet);
CREATE INDEX IF NOT EXISTS idx_model_storage_status ON model_storage(status);

COMMENT ON TABLE model_storage IS 'Decentralized Model Hub: IPFS + GSTD Storage Layer for LLM weights';
