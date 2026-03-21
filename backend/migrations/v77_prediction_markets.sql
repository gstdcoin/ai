-- V77: GSTD Native Prediction Markets
-- Full prediction market platform schema
-- Incorporates external events (e.g. Polymarket) natively without branding,
-- accepting bets in GSTD and linking AI paid forecasts.

CREATE TABLE IF NOT EXISTS gstd_prediction_markets (
    id              TEXT PRIMARY KEY,  -- Market ID (e.g. PM-1234)
    question        TEXT NOT NULL,     -- The event question
    description     TEXT DEFAULT '',   -- Details/resolution source
    image_url       TEXT DEFAULT '',   -- Optional image
    outcomes        JSONB NOT NULL DEFAULT '[]', -- E.g. ["Yes", "No"]
    outcome_prices  JSONB NOT NULL DEFAULT '[]', -- E.g. [0.45, 0.55] 
    volume_usd      DOUBLE PRECISION DEFAULT 0,  -- Real-world volume mirror
    pool_gstd       DOUBLE PRECISION DEFAULT 0,  -- Total GSTD staked on our platform
    liquidity_gstd  DOUBLE PRECISION DEFAULT 10000, -- Simulated liquidity
    end_date        TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'active', -- active, resolved, canceled
    resolved_outcome INTEGER DEFAULT -1,         -- Index of winning outcome (-1 if none)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gpm_status ON gstd_prediction_markets(status);
CREATE INDEX IF NOT EXISTS idx_gpm_volume ON gstd_prediction_markets(volume_usd);

-- Bets placed by users
CREATE TABLE IF NOT EXISTS gstd_market_bets (
    id              SERIAL PRIMARY KEY,
    market_id       TEXT NOT NULL REFERENCES gstd_prediction_markets(id),
    wallet_address  TEXT NOT NULL,
    outcome_index   INTEGER NOT NULL,
    amount_gstd     DOUBLE PRECISION NOT NULL,
    potential_payout DOUBLE PRECISION NOT NULL, 
    status          TEXT NOT NULL DEFAULT 'active', -- active, won, lost, refunded
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gmb_wallet ON gstd_market_bets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_gmb_market ON gstd_market_bets(market_id);

-- System logs for autonomous market resolution 
CREATE TABLE IF NOT EXISTS gstd_market_resolutions (
    id              SERIAL PRIMARY KEY,
    market_id       TEXT NOT NULL REFERENCES gstd_prediction_markets(id),
    resolved_by     TEXT NOT NULL DEFAULT 'swarm_oracle', -- The node or oracle that resolved it
    outcome_index   INTEGER NOT NULL,
    proof_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction risk scanning (Blowfish stealth integration)
CREATE TABLE IF NOT EXISTS tx_risk_scans (
    id              SERIAL PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    tx_type         TEXT NOT NULL, -- 'bet', 'signal_purchase', 'withdraw'
    amount_gstd     DOUBLE PRECISION,
    risk_score      DOUBLE PRECISION NOT NULL DEFAULT 0, -- 0.0 to 1.0 (1.0 = malicious)
    flags           JSONB DEFAULT '[]', -- Warning flags
    action_taken    TEXT NOT NULL DEFAULT 'allowed', -- allowed, blocked, flagged
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_risk_wallet ON tx_risk_scans(wallet_address);
