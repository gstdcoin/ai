-- Cocoon Confidential Compute integration
-- Tracks inference requests routed through Cocoon TEE network (TON blockchain)
-- Docs: https://cocoon.org/developers

CREATE TABLE IF NOT EXISTS cocoon_payments (
    id              SERIAL PRIMARY KEY,
    model           TEXT NOT NULL,
    tokens_used     INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    cost_ton_estimated NUMERIC(20, 8) NOT NULL DEFAULT 0,
    cost_gstd       NUMERIC(20, 8) NOT NULL DEFAULT 0,
    wallet_address  TEXT,
    tee_type        TEXT DEFAULT 'Intel TDX',
    worker_id       TEXT,
    proxy_id        TEXT,
    image_hash      TEXT,
    attestation_verified BOOLEAN DEFAULT true,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cocoon_payments_created ON cocoon_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_cocoon_payments_model ON cocoon_payments(model);
CREATE INDEX IF NOT EXISTS idx_cocoon_payments_wallet ON cocoon_payments(wallet_address);
