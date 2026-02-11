-- Add executor payout tracking fields to tasks table
-- This tracks the transaction hash and status of worker payouts

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS executor_payout_tx_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS executor_payout_status VARCHAR(20) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_payout_status ON tasks(executor_payout_status);

COMMENT ON COLUMN tasks.executor_payout_tx_hash IS 'Transaction hash of the GSTD transfer to executor';
COMMENT ON COLUMN tasks.executor_payout_status IS 'Status of executor payout: pending, confirmed, failed';

