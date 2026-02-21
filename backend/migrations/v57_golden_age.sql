-- Golden Age Protocol: Payout Waves from settlement_ledger

ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS payout_wave_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS settlement_payout_waves (
    id SERIAL PRIMARY KEY,
    wave_id VARCHAR(64) UNIQUE NOT NULL,
    total_gstd DECIMAL(18,9) NOT NULL,
    worker_count INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
