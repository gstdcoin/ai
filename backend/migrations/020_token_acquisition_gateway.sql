-- Token Acquisition Gateway Tables
-- Enables ultra-simple token acquisition for users and agents

-- Faucet Claims - tracks all free token distributions
CREATE TABLE IF NOT EXISTS faucet_claims (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(68) NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    type VARCHAR(30) NOT NULL, -- welcome, daily, task, referral, agent_bootstrap
    claimed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_faucet_claims_wallet ON faucet_claims(wallet_address);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_type ON faucet_claims(type);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_claimed_at ON faucet_claims(claimed_at);

-- Unique constraint for welcome bonus (one per wallet)
CREATE UNIQUE INDEX IF NOT EXISTS idx_faucet_welcome_unique 
ON faucet_claims(wallet_address) 
WHERE type = 'welcome';

-- Simple Tasks completed by users
CREATE TABLE IF NOT EXISTS simple_tasks_completed (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(68) NOT NULL,
    task_id VARCHAR(50) NOT NULL,
    task_type VARCHAR(30) NOT NULL,
    reward_amount DECIMAL(18, 8) NOT NULL,
    response JSONB,
    completed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simple_tasks_wallet ON simple_tasks_completed(wallet_address);

-- Onboarding Progress tracking
CREATE TABLE IF NOT EXISTS onboarding_progress (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL UNIQUE,
    user_type VARCHAR(30) NOT NULL DEFAULT 'human',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    current_step INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    steps_data JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_completed ON onboarding_progress(completed);

-- Translation Cache
CREATE TABLE IF NOT EXISTS translation_cache (
    id SERIAL PRIMARY KEY,
    source_hash VARCHAR(64) NOT NULL,
    source_lang VARCHAR(10) NOT NULL,
    target_lang VARCHAR(10) NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    context VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(source_hash, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_hash ON translation_cache(source_hash, target_lang);

-- Agent bootstraps (track which agents have been bootstrapped)
CREATE TABLE IF NOT EXISTS agent_bootstraps (
    id SERIAL PRIMARY KEY,
    agent_wallet VARCHAR(68) NOT NULL UNIQUE,
    agent_name VARCHAR(200) NOT NULL,
    capabilities TEXT[],
    bootstrap_amount DECIMAL(18, 8) NOT NULL,
    bootstrapped_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_bootstraps_wallet ON agent_bootstraps(agent_wallet);

-- Platform Evolution Improvements (tracked by AI)
CREATE TABLE IF NOT EXISTS platform_improvements (
    id SERIAL PRIMARY KEY,
    improvement_id VARCHAR(32) NOT NULL UNIQUE,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    impact VARCHAR(10) NOT NULL, -- low, medium, high
    risk VARCHAR(10) NOT NULL,   -- none, low, medium
    implementation TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'proposed',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_improvements_status ON platform_improvements(status);
CREATE INDEX IF NOT EXISTS idx_improvements_type ON platform_improvements(type);

-- Daily Summary View
CREATE OR REPLACE VIEW daily_token_distribution AS
SELECT 
    DATE(claimed_at) as date,
    type,
    COUNT(*) as claim_count,
    SUM(amount) as total_distributed,
    COUNT(DISTINCT wallet_address) as unique_wallets
FROM faucet_claims
WHERE claimed_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(claimed_at), type
ORDER BY date DESC, type;

-- Insert initial simple tasks
INSERT INTO simple_tasks_completed (wallet_address, task_id, task_type, reward_amount, response)
SELECT 'SYSTEM', 'init', 'system', 0, '{"message": "Table initialized"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM simple_tasks_completed LIMIT 1);

COMMENT ON TABLE faucet_claims IS 'Tracks all free token distributions to users and agents';
COMMENT ON TABLE onboarding_progress IS 'Tracks user onboarding flow progress';
COMMENT ON TABLE agent_bootstraps IS 'Records AI agent initial token distributions';
COMMENT ON TABLE platform_improvements IS 'AI-proposed platform improvements';
