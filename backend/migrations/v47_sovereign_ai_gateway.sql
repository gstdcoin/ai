-- V47: Sovereign AI Gateway - API Usage Logging & Chat History
-- Supports the OpenAI-compatible gateway with Ollama routing

-- API Usage Log for analytics and billing
CREATE TABLE IF NOT EXISTS api_usage_log (
    id BIGSERIAL PRIMARY KEY,
    wallet_address VARCHAR(128) NOT NULL,
    model VARCHAR(64) NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    cost_gstd DECIMAL(18, 8) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    status VARCHAR(16) DEFAULT 'success',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast analytics queries
CREATE INDEX IF NOT EXISTS idx_api_usage_wallet ON api_usage_log(wallet_address);
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_model ON api_usage_log(model);

-- Ensure user_api_keys table exists (may already exist from v46)
CREATE TABLE IF NOT EXISTS user_api_keys (
    id BIGSERIAL PRIMARY KEY,
    user_wallet VARCHAR(128) NOT NULL,
    api_key VARCHAR(128) NOT NULL UNIQUE,
    label VARCHAR(128) DEFAULT 'Default',
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_wallet ON user_api_keys(user_wallet);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_key ON user_api_keys(api_key);
