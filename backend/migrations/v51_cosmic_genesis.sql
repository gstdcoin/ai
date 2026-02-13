-- Cosmic Genesis: Anticipatory Defense, A2A Economy, RWA Bridge

-- 1. Anomaly Detection: PoW pattern tracking by region
CREATE TABLE IF NOT EXISTS pow_pattern_snapshots (
    id SERIAL PRIMARY KEY,
    h3_index VARCHAR(20) NOT NULL,
    region_country VARCHAR(10),
    node_count INT NOT NULL,
    avg_difficulty NUMERIC(10,2),
    avg_solve_time_ms INT,
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pow_snapshots_h3 ON pow_pattern_snapshots(h3_index, snapshot_at DESC);

-- 2. Auto-Bounty: WhiteHat security tasks
CREATE TABLE IF NOT EXISTS auto_bounty_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(100) UNIQUE,
    vulnerability_type VARCHAR(100),
    description TEXT,
    reward_gstd NUMERIC(20,9) NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Agent Subcontract: Internal GSTD accounts for A2A economy
CREATE TABLE IF NOT EXISTS agent_internal_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(100) NOT NULL UNIQUE,
    balance_gstd NUMERIC(20,9) DEFAULT 0,
    frozen_gstd NUMERIC(20,9) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_subcontracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hirer_agent_id VARCHAR(100) NOT NULL,
    worker_agent_id VARCHAR(100) NOT NULL,
    task_id VARCHAR(100),
    amount_gstd NUMERIC(20,9) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subcontracts_hirer ON agent_subcontracts(hirer_agent_id);
CREATE INDEX IF NOT EXISTS idx_subcontracts_worker ON agent_subcontracts(worker_agent_id);

-- 4. Hive Reputation Staking
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_stake_gstd NUMERIC(20,9) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS min_stake_gstd NUMERIC(20,9) DEFAULT 0;

-- 5. Hardware Buyback: Treasury grants for best workers in scarce H3
CREATE TABLE IF NOT EXISTS hardware_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(100) NOT NULL,
    h3_index VARCHAR(20),
    grant_amount_gstd NUMERIC(20,9) NOT NULL,
    equipment_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hardware_grants_wallet ON hardware_grants(wallet_address);
