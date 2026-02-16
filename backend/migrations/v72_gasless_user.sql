-- Gasless User Protocol: Subsidized Onboarding, Highload Batching, Internal Swap
-- 1. Protocol Fund (5% from settlements) for gas subsidies
-- 2. Gas subsidies tracking
-- 3. TON reserve for Internal Swap

INSERT INTO platform_funds (fund_type, balance_gstd) VALUES ('protocol_fund', 0)
ON CONFLICT (fund_type) DO NOTHING;

-- Gas reserve: we track TON separately (platform holds TON for gas/swap)
-- balance_ton_nano stored as DECIMAL for simplicity (1 TON = 1e9)
ALTER TABLE platform_funds ADD COLUMN IF NOT EXISTS balance_ton_nano DECIMAL(30,0) DEFAULT 0;

CREATE TABLE IF NOT EXISTS gasless_subsidies (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(128) NOT NULL,
    ton_amount_nano BIGINT NOT NULL,
    tx_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wallet_address)
);
CREATE INDEX IF NOT EXISTS idx_gasless_subsidies_wallet ON gasless_subsidies(wallet_address);

CREATE TABLE IF NOT EXISTS internal_swaps (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(128) NOT NULL,
    gstd_amount DECIMAL(18,9) NOT NULL,
    ton_amount_nano BIGINT NOT NULL,
    tx_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_internal_swaps_wallet ON internal_swaps(wallet_address);

-- Payout batch queue for Highload (min 50 workers per tx)
CREATE TABLE IF NOT EXISTS payout_batch_queue (
    id SERIAL PRIMARY KEY,
    worker_wallet VARCHAR(128) NOT NULL,
    amount_gstd DECIMAL(18,9) NOT NULL,
    settlement_id VARCHAR(64),
    status VARCHAR(20) DEFAULT 'pending',
    batch_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_batch_status ON payout_batch_queue(status);
