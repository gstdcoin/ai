-- v93: On-chain GSTD Settlement Queue
-- Tracks real Jetton transfers that correspond to DB fee deductions

CREATE TABLE IF NOT EXISTS onchain_settlements (
    id              BIGSERIAL PRIMARY KEY,
    wallet_address  VARCHAR(128) NOT NULL,       -- User who paid
    amount_gstd     DECIMAL(18,8) NOT NULL,      -- Amount to settle on-chain
    model_id        VARCHAR(64),                  -- Model used
    tx_type         VARCHAR(32) DEFAULT 'inference', -- inference, task, skill
    status          VARCHAR(16) DEFAULT 'pending',   -- pending, batched, sent, confirmed, failed
    batch_id        BIGINT,                       -- FK to settlement batch
    onchain_tx_hash VARCHAR(128),                 -- TON blockchain tx hash
    error_message   TEXT,                         -- Error if failed
    created_at      TIMESTAMP DEFAULT NOW(),
    settled_at      TIMESTAMP                     -- When on-chain tx confirmed
);

CREATE INDEX IF NOT EXISTS idx_onchain_settlements_status ON onchain_settlements(status);
CREATE INDEX IF NOT EXISTS idx_onchain_settlements_batch ON onchain_settlements(batch_id);
CREATE INDEX IF NOT EXISTS idx_onchain_settlements_wallet ON onchain_settlements(wallet_address);
CREATE INDEX IF NOT EXISTS idx_onchain_settlements_created ON onchain_settlements(created_at DESC);

-- Batch tracking: aggregated transfers sent together
CREATE TABLE IF NOT EXISTS onchain_settlement_batches (
    id              BIGSERIAL PRIMARY KEY,
    total_amount    DECIMAL(18,8) NOT NULL,       -- Sum of all settlements in batch
    item_count      INT NOT NULL,                  -- Number of settlements
    destination     VARCHAR(128) NOT NULL,         -- Treasury/burn address
    tx_hash         VARCHAR(128),                  -- On-chain tx hash
    status          VARCHAR(16) DEFAULT 'pending', -- pending, sent, confirmed, failed
    gas_fee_ton     DECIMAL(18,8),                 -- Gas cost in TON
    error_message   TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    confirmed_at    TIMESTAMP
);

-- Summary view for dashboards
CREATE TABLE IF NOT EXISTS onchain_settlement_stats (
    id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    total_settled_gstd      DECIMAL(18,8) DEFAULT 0,
    total_pending_gstd      DECIMAL(18,8) DEFAULT 0,
    total_batches_sent      BIGINT DEFAULT 0,
    total_batches_confirmed BIGINT DEFAULT 0,
    total_gas_spent_ton     DECIMAL(18,8) DEFAULT 0,
    last_settlement_at      TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT NOW()
);
INSERT INTO onchain_settlement_stats (id) VALUES (1) ON CONFLICT DO NOTHING;
