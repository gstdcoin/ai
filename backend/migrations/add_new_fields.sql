-- Migration: Add new fields for enhanced functionality

-- Add fields to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS assigned_device VARCHAR(255),
ADD COLUMN IF NOT EXISTS result_data TEXT,
ADD COLUMN IF NOT EXISTS result_nonce VARCHAR(255),
ADD COLUMN IF NOT EXISTS result_proof VARCHAR(255),
ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS result_submitted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS platform_fee_ton DECIMAL(18, 9),
ADD COLUMN IF NOT EXISTS executor_reward_ton DECIMAL(18, 9),
ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(20) DEFAULT 'none', -- none, awaiting, locked, distributed, refunded
ADD COLUMN IF NOT EXISTS total_reward_pool DECIMAL(18, 9);

-- Remove UNIQUE constraint from devices.wallet_address to allow multiple devices per wallet
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_wallet_address_key;

-- Add index for assigned_device
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_device ON tasks(assigned_device);

-- Add index for timeout checking
CREATE INDEX IF NOT EXISTS idx_tasks_timeout ON tasks(status, timeout_at) WHERE status = 'assigned';
CREATE INDEX IF NOT EXISTS idx_tasks_escrow ON tasks(escrow_status);

