-- Migration v33: Recreate failed_payouts table with correct schema
-- Purpose: Fix PayoutRetryService error (column payout_type does not exist)
-- Date: 2026-01-19

-- Drop old table if exists (assuming it's empty or disposable as verified)
DROP TABLE IF EXISTS failed_payouts;

-- Recreate with correct schema matching PayoutRetryService
CREATE TABLE failed_payouts (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255),
    payout_type VARCHAR(20) NOT NULL, -- 'worker' or 'swap'
    recipient_address VARCHAR(255),
    amount_gstd DECIMAL(18, 9) NOT NULL,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, retrying, succeeded, failed
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_retry_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_failed_payouts_status ON failed_payouts(status, retry_count);
CREATE INDEX idx_failed_payouts_task_id ON failed_payouts(task_id);
