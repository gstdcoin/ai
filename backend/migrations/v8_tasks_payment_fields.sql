-- Migration v8.0: Add Payment Fields to Tasks Table

-- Add new columns for payment system
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS creator_wallet VARCHAR(48),
ADD COLUMN IF NOT EXISTS budget_gstd DECIMAL(18, 9),
ADD COLUMN IF NOT EXISTS reward_gstd DECIMAL(18, 9),
ADD COLUMN IF NOT EXISTS deposit_id VARCHAR(64), -- transaction hash
ADD COLUMN IF NOT EXISTS payload JSONB,
ADD COLUMN IF NOT EXISTS payment_memo VARCHAR(255); -- Memo/Invoice for payment matching

-- Update existing tasks to set creator_wallet from requester_address if null
UPDATE tasks SET creator_wallet = requester_address WHERE creator_wallet IS NULL;

-- Add index for payment_memo lookups
CREATE INDEX IF NOT EXISTS idx_tasks_payment_memo ON tasks(payment_memo) WHERE payment_memo IS NOT NULL;

-- Add index for deposit_id lookups
CREATE INDEX IF NOT EXISTS idx_tasks_deposit_id ON tasks(deposit_id) WHERE deposit_id IS NOT NULL;

-- Add index for status filtering (including new statuses)
CREATE INDEX IF NOT EXISTS idx_tasks_status_creator ON tasks(status, creator_wallet);

