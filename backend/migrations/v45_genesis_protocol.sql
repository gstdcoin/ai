-- Genesis Machine Economy Migration
-- Allows agents to register their own API endpoints and price them in GSTD

CREATE TABLE IF NOT EXISTS agent_service_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_wallet TEXT NOT NULL,
    service_name TEXT NOT NULL,
    description TEXT,
    endpoint_url TEXT NOT NULL,
    price_per_call_gstd NUMERIC(20, 8) DEFAULT 0.1,
    trust_requirement NUMERIC(3, 2) DEFAULT 0.0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agent_wallet, service_name)
);

CREATE INDEX idx_agent_service_wallet ON agent_service_registry(agent_wallet);
CREATE INDEX idx_agent_service_name ON agent_service_registry(service_name);

-- Dynamic Handshakes (Sovereign Access Tokens)
CREATE TABLE IF NOT EXISTS agent_sessions (
    token TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_wallet ON agent_sessions(wallet_address);
