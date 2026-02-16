-- SettlementService: proxy inference payment distribution (85% workers, 10% Treasury, 5% protocol)

CREATE TABLE IF NOT EXISTS settlement_ledger (
    id SERIAL PRIMARY KEY,
    settlement_id VARCHAR(64) UNIQUE NOT NULL,
    inference_id VARCHAR(64),
    amount_gstd DECIMAL(18,9) NOT NULL,
    worker_wallet VARCHAR(128),
    node_id VARCHAR(128),
    worker_amount DECIMAL(18,9) NOT NULL,
    treasury_amount DECIMAL(18,9) NOT NULL,
    protocol_amount DECIMAL(18,9) NOT NULL,
    model_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlement_ledger_wallet ON settlement_ledger(worker_wallet);
CREATE INDEX IF NOT EXISTS idx_settlement_ledger_created ON settlement_ledger(created_at DESC);
