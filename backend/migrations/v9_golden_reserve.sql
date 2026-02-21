-- Migration v9.0: Golden Reserve Log Table

-- Create golden reserve log table
CREATE TABLE IF NOT EXISTS golden_reserve_log (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    gstd_amount DECIMAL(18, 9) NOT NULL,
    xaut_amount DECIMAL(18, 9),
    treasury_wallet VARCHAR(48) NOT NULL,
    swap_tx_hash VARCHAR(64),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_golden_reserve_task_id ON golden_reserve_log(task_id);
CREATE INDEX IF NOT EXISTS idx_golden_reserve_timestamp ON golden_reserve_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_golden_reserve_treasury ON golden_reserve_log(treasury_wallet);

