-- Migration v10.0: Failed Payouts Table for Retry Mechanism

-- Create failed_payouts table
CREATE TABLE IF NOT EXISTS failed_payouts (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    payout_type VARCHAR(20) NOT NULL, -- 'worker' or 'swap'
    recipient_address VARCHAR(48),
    amount_gstd DECIMAL(18, 9) NOT NULL,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_retry_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' -- pending, retrying, succeeded, failed
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_failed_payouts_status ON failed_payouts(status, retry_count);
CREATE INDEX IF NOT EXISTS idx_failed_payouts_task_id ON failed_payouts(task_id);
CREATE INDEX IF NOT EXISTS idx_failed_payouts_created_at ON failed_payouts(created_at DESC);

