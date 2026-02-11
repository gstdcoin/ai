-- Migration v12.0: Processed Payments Table for Replay Attack Prevention
-- Create processed_payments table to track all processed transaction hashes
CREATE TABLE IF NOT EXISTS processed_payments (
    id SERIAL PRIMARY KEY,
    tx_hash VARCHAR(64) NOT NULL UNIQUE,
    task_id VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add unique index on tx_hash (redundant but explicit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_payments_tx_hash ON processed_payments(tx_hash);

-- Add index for task lookups
CREATE INDEX IF NOT EXISTS idx_processed_payments_task_id ON processed_payments(task_id);

-- Add index for time-based queries
CREATE INDEX IF NOT EXISTS idx_processed_payments_processed_at ON processed_payments(processed_at DESC);

