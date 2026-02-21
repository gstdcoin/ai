-- User API Keys for External Integration (SDK, agents, etc.)
CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet TEXT NOT NULL REFERENCES users(wallet_address) ON DELETE CASCADE,
    api_key TEXT UNIQUE NOT NULL,
    label TEXT DEFAULT 'Default Key',
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_api_keys_wallet ON user_api_keys(user_wallet);
CREATE INDEX idx_user_api_keys_key ON user_api_keys(api_key);
