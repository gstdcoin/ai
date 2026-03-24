-- ═══════════════════════════════════════════════════════════════
-- v97: MAINNET B2B — NaaS Economy & Sovereign Fund
-- Asset-Backed Economy: every transaction funds the Sovereign Fund
-- ═══════════════════════════════════════════════════════════════

-- B2B API clients (developers/companies buying RPC + AI access)
CREATE TABLE IF NOT EXISTS b2b_clients (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    email TEXT,
    wallet_address TEXT NOT NULL,
    api_key_hash TEXT NOT NULL UNIQUE,
    balance_usd DECIMAL(18,6) DEFAULT 0,
    balance_gstd DECIMAL(18,6) DEFAULT 0,
    balance_stars INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'starter' CHECK (tier IN ('starter','pro','enterprise')),
    rate_limit_rps INTEGER DEFAULT 100,
    total_requests BIGINT DEFAULT 0,
    total_spent_usd DECIMAL(18,6) DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_b2b_clients_wallet ON b2b_clients(wallet_address);
CREATE INDEX IF NOT EXISTS idx_b2b_clients_status ON b2b_clients(status);

-- RPC request log (billing + analytics)
CREATE TABLE IF NOT EXISTS rpc_requests (
    id BIGSERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES b2b_clients(id),
    node_id TEXT NOT NULL,
    chain TEXT NOT NULL,
    method TEXT,
    request_type TEXT DEFAULT 'read' CHECK (request_type IN ('read','write','archive','ai')),
    latency_ms INTEGER,
    cost_usd DECIMAL(12,8),
    status_code INTEGER DEFAULT 200,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rpc_req_client ON rpc_requests(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rpc_req_node ON rpc_requests(node_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rpc_req_chain ON rpc_requests(chain, created_at);

-- Node uptime tracker (Age Multiplier engine)
CREATE TABLE IF NOT EXISTS node_uptime_tracker (
    node_id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    tier TEXT DEFAULT 'light' CHECK (tier IN ('light','standard','archive')),
    current_multiplier DECIMAL(3,1) DEFAULT 1.0,
    uptime_streak_hours INTEGER DEFAULT 0,
    total_uptime_hours INTEGER DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    last_disconnect TIMESTAMPTZ,
    weekly_uptime_pct DECIMAL(5,2) DEFAULT 0,
    containers_running INTEGER DEFAULT 0,
    rpc_requests_served BIGINT DEFAULT 0,
    epoch_earnings_usd DECIMAL(18,6) DEFAULT 0,
    hardware_profile JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uptime_wallet ON node_uptime_tracker(wallet_address);
CREATE INDEX IF NOT EXISTS idx_uptime_multiplier ON node_uptime_tracker(current_multiplier DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_tier ON node_uptime_tracker(tier);

-- Sovereign Fund (epoch-based treasury tracking)
CREATE TABLE IF NOT EXISTS sovereign_fund (
    id SERIAL PRIMARY KEY,
    epoch INTEGER NOT NULL UNIQUE,
    total_revenue_usd DECIMAL(18,6) DEFAULT 0,
    backing_usd DECIMAL(18,6) DEFAULT 0,
    treasury_usd DECIMAL(18,6) DEFAULT 0,
    yield_pool_usd DECIMAL(18,6) DEFAULT 0,
    floor_price_usd DECIMAL(18,8) DEFAULT 0,
    circulating_supply DECIMAL(18,6) DEFAULT 0,
    backing_assets JSONB DEFAULT '{"ton":0,"usdt":0,"paxg":0}',
    yield_distributed BOOLEAN DEFAULT FALSE,
    eligible_nodes INTEGER DEFAULT 0,
    epoch_start TIMESTAMPTZ,
    epoch_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sovereign Fund cumulative totals (single-row)
CREATE TABLE IF NOT EXISTS sovereign_fund_totals (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    total_backing_usd DECIMAL(18,6) DEFAULT 0,
    total_treasury_usd DECIMAL(18,6) DEFAULT 0,
    total_yield_distributed_usd DECIMAL(18,6) DEFAULT 0,
    total_revenue_all_time_usd DECIMAL(18,6) DEFAULT 0,
    current_floor_price_usd DECIMAL(18,8) DEFAULT 0,
    current_epoch INTEGER DEFAULT 1,
    fund_contract_address TEXT DEFAULT '',
    backing_vault_address TEXT DEFAULT '',
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO sovereign_fund_totals (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Initialize epoch 1
INSERT INTO sovereign_fund (epoch, epoch_start, epoch_end, circulating_supply)
SELECT 1, NOW(), NOW() + INTERVAL '30 days',
       COALESCE((SELECT SUM(balance) FROM users WHERE balance > 0), 0)
WHERE NOT EXISTS (SELECT 1 FROM sovereign_fund WHERE epoch = 1);

-- Verified Providers (Proof-of-Liquidity staking)
CREATE TABLE IF NOT EXISTS verified_providers (
    id SERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL UNIQUE,
    lp_token_amount DECIMAL(18,6) DEFAULT 0,
    pol_tx_hash TEXT,
    node_id TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','verified','expired','revoked')),
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verified_status ON verified_providers(status);

-- Revenue transactions (every income event)
CREATE TABLE IF NOT EXISTS revenue_events (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('rpc','ai','bridge','marketplace','staking_fee','other')),
    amount_usd DECIMAL(18,6) NOT NULL,
    amount_raw DECIMAL(18,6),
    currency TEXT DEFAULT 'USD',
    backing_portion DECIMAL(18,6),
    treasury_portion DECIMAL(18,6),
    yield_portion DECIMAL(18,6),
    epoch INTEGER,
    tx_hash TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_epoch ON revenue_events(epoch, created_at);
CREATE INDEX IF NOT EXISTS idx_revenue_source ON revenue_events(source, created_at);
