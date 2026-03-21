-- ═══════════════════════════════════════════════════════════════
-- V76: Signal Marketplace V2 — External Data + Swarm Compute Rewards
-- 
-- New tables:
--  1. external_market_data — cached external API data
--  2. signal_compute_rewards — node rewards for compute contribution
--  3. signal_revenue_splits — tracks revenue distribution
--
-- Modifications:
--  - prediction_signals: add data_sources, compute_node_id columns
--  - signal_purchases: add revenue_split columns
-- ═══════════════════════════════════════════════════════════════

-- 1. External market data cache (upsert-friendly)
CREATE TABLE IF NOT EXISTS external_market_data (
    id              SERIAL PRIMARY KEY,
    source          TEXT NOT NULL,
    category        TEXT NOT NULL,
    data_json       JSONB NOT NULL DEFAULT '{}',
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source, category)
);
CREATE INDEX IF NOT EXISTS idx_external_market_data_cat ON external_market_data(category);

-- 2. Swarm compute rewards for signal processing
CREATE TABLE IF NOT EXISTS signal_compute_rewards (
    id              SERIAL PRIMARY KEY,
    signal_id       TEXT NOT NULL,
    node_id         TEXT NOT NULL,
    reward_gstd     DOUBLE PRECISION NOT NULL DEFAULT 0,
    compute_ms      INTEGER NOT NULL DEFAULT 0,          -- milliseconds of compute used
    status          TEXT NOT NULL DEFAULT 'pending',       -- pending, distributed, failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    distributed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_signal_compute_rewards_node ON signal_compute_rewards(node_id);
CREATE INDEX IF NOT EXISTS idx_signal_compute_rewards_signal ON signal_compute_rewards(signal_id);

-- 3. Signal revenue splits tracking
CREATE TABLE IF NOT EXISTS signal_revenue_splits (
    id              SERIAL PRIMARY KEY,
    signal_id       TEXT NOT NULL,
    purchase_id     INTEGER,
    total_gstd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    gold_reserve    DOUBLE PRECISION NOT NULL DEFAULT 0,  -- 50%
    compute_reward  DOUBLE PRECISION NOT NULL DEFAULT 0,  -- 20%
    platform_fee    DOUBLE PRECISION NOT NULL DEFAULT 0,  -- 30%
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signal_revenue_signal ON signal_revenue_splits(signal_id);

-- 4. Add data_sources + compute fields to prediction_signals (if not exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'prediction_signals' AND column_name = 'data_sources') THEN
        ALTER TABLE prediction_signals ADD COLUMN data_sources TEXT[] DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'prediction_signals' AND column_name = 'compute_node_id') THEN
        ALTER TABLE prediction_signals ADD COLUMN compute_node_id TEXT DEFAULT '';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'prediction_signals' AND column_name = 'external_data_used') THEN
        ALTER TABLE prediction_signals ADD COLUMN external_data_used BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 5. Ensure prediction_signals table exists (if not from previous migration)
CREATE TABLE IF NOT EXISTS prediction_signals (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL,
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL DEFAULT '',
    full_report     TEXT DEFAULT '',
    confidence      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    impact          TEXT NOT NULL DEFAULT 'medium',
    time_horizon    TEXT NOT NULL DEFAULT '7d',
    price_gstd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_premium      BOOLEAN NOT NULL DEFAULT false,
    agent_name      TEXT NOT NULL DEFAULT 'MiroFish-Alpha',
    agent_score     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    accuracy        DOUBLE PRECISION NOT NULL DEFAULT 0,
    buyers          INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    status          TEXT NOT NULL DEFAULT 'active',
    data_sources    TEXT[] DEFAULT '{}',
    compute_node_id TEXT DEFAULT '',
    external_data_used BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_prediction_signals_status ON prediction_signals(status);
CREATE INDEX IF NOT EXISTS idx_prediction_signals_category ON prediction_signals(category);
CREATE INDEX IF NOT EXISTS idx_prediction_signals_agent ON prediction_signals(agent_name);

-- 6. Ensure signal_purchases table exists
CREATE TABLE IF NOT EXISTS signal_purchases (
    id              SERIAL PRIMARY KEY,
    signal_id       TEXT NOT NULL,
    buyer_wallet    TEXT NOT NULL,
    price_gstd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    purchased_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signal_purchases_wallet ON signal_purchases(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_signal_purchases_signal ON signal_purchases(signal_id);
