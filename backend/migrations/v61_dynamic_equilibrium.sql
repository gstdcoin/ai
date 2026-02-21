-- Dynamic Equilibrium + Sovereign Backbone
-- Anti-Price Barrier: Base inference fee adjusted by GSTD/XAUt
-- Shard Distribution: Geographic placement
-- Shard Integrity: Replica tracking

-- 1. Inference fee config (24h-adjusted)
CREATE TABLE IF NOT EXISTS inference_fee_config (
    id SERIAL PRIMARY KEY,
    base_fee_gstd DECIMAL(18,9) NOT NULL DEFAULT 0.01,
    gstd_price_usd_at_set DECIMAL(18,6),
    target_usd_per_micro DECIMAL(18,6) DEFAULT 0.01,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO inference_fee_config (base_fee_gstd, target_usd_per_micro)
SELECT 0.01, 0.01 WHERE NOT EXISTS (SELECT 1 FROM inference_fee_config LIMIT 1);

-- 2. Shard placement by continent (for geographic distribution)
ALTER TABLE model_storage ADD COLUMN IF NOT EXISTS continent VARCHAR(2);
ALTER TABLE model_storage ADD COLUMN IF NOT EXISTS region VARCHAR(32);

CREATE TABLE IF NOT EXISTS model_shard_replicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id VARCHAR(128) NOT NULL,
    shard_index INT NOT NULL,
    node_wallet VARCHAR(100) NOT NULL,
    continent VARCHAR(2),
    h3_index VARCHAR(16),
    is_available BOOLEAN DEFAULT true,
    last_check_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(model_id, shard_index, node_wallet)
);
CREATE INDEX IF NOT EXISTS idx_shard_replicas_model ON model_shard_replicas(model_id);
CREATE INDEX IF NOT EXISTS idx_shard_replicas_continent ON model_shard_replicas(continent);

-- 3. Shard reward boost (when availability < 80%)
CREATE TABLE IF NOT EXISTS shard_reward_boosts (
    model_id VARCHAR(128) NOT NULL,
    shard_index INT NOT NULL,
    boost_multiplier DECIMAL(5,2) DEFAULT 1.0,
    availability_pct DECIMAL(5,2),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (model_id, shard_index)
);
