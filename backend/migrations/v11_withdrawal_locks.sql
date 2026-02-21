-- Migration v11.0: Withdrawal Locks Table for Security

-- Create withdrawal_locks table
CREATE TABLE IF NOT EXISTS withdrawal_locks (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    worker_wallet VARCHAR(48) NOT NULL,
    amount_gstd DECIMAL(18, 9) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_approval', -- pending_approval, approved, rejected
    approved_by VARCHAR(48),
    approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_withdrawal_locks_status ON withdrawal_locks(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_locks_worker ON withdrawal_locks(worker_wallet);
CREATE INDEX IF NOT EXISTS idx_withdrawal_locks_created ON withdrawal_locks(created_at DESC);

