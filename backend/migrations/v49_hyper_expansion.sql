-- Hyper-Expansion: Viral Economy, Oracle, Leaderboard, Milestones

-- 1. Milestone Awards (NFT badges, achievement system)
CREATE TABLE IF NOT EXISTS milestone_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(100) NOT NULL,
    milestone_type VARCHAR(50) NOT NULL,  -- tasks_1000, uptime_100_days, first_referral, etc.
    badge_name VARCHAR(100),
    badge_icon VARCHAR(20),
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(wallet_address, milestone_type)
);
CREATE INDEX IF NOT EXISTS idx_milestone_wallet ON milestone_awards(wallet_address);
CREATE INDEX IF NOT EXISTS idx_milestone_type ON milestone_awards(milestone_type);

-- 2. Global Knowledge Layer (Auto-Fine-Tuning: merged LoRA from 10+ agents)
CREATE TABLE IF NOT EXISTS global_knowledge_layer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic TEXT NOT NULL UNIQUE,
    merged_content TEXT NOT NULL,
    source_agent_ids TEXT[],
    merge_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_global_knowledge_topic ON global_knowledge_layer(topic);

-- 3. Brain Query Payments (Hive Intelligence API revenue -> Gold Pool)
CREATE TABLE IF NOT EXISTS brain_query_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(100) NOT NULL,
    query_topic TEXT,
    amount_gstd NUMERIC(20,9) NOT NULL,
    gold_pool_credited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brain_payments_wallet ON brain_query_payments(wallet_address);

-- 4. Oracle Requests (external smart contracts querying Leviathan)
CREATE TABLE IF NOT EXISTS oracle_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(64) UNIQUE NOT NULL,
    chain VARCHAR(50),           -- ton, ethereum, etc.
    contract_address VARCHAR(100),
    query_type VARCHAR(50),
    query_params JSONB,
    response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oracle_request_id ON oracle_requests(request_id);

-- 5. Multi-Token Payment Intents (USDT/TON -> GSTD conversion)
CREATE TABLE IF NOT EXISTS multi_token_payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id VARCHAR(64) UNIQUE NOT NULL,
    source_token VARCHAR(20) NOT NULL,  -- USDT, TON
    source_amount NUMERIC(30,9) NOT NULL,
    target_gstd NUMERIC(20,9) NOT NULL,
    wallet_address VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    stonfi_tx_hash VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_multi_token_intent ON multi_token_payment_intents(intent_id);
