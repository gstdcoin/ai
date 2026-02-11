-- Migration v19: Add Payment Flow Columns
-- Purpose: Add columns required for payment flow (creator_wallet, budget_gstd, reward_gstd, payment_memo, deposit_id, payload)
-- Date: 2026-01-11

-- Add creator_wallet if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='creator_wallet') THEN
        ALTER TABLE tasks ADD COLUMN creator_wallet VARCHAR(48);
        CREATE INDEX IF NOT EXISTS idx_tasks_creator_wallet ON tasks(creator_wallet) WHERE creator_wallet IS NOT NULL;
        COMMENT ON COLUMN tasks.creator_wallet IS 'Wallet address of the task creator (for payment flow)';
    END IF;
END $$;

-- Add budget_gstd if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='budget_gstd') THEN
        ALTER TABLE tasks ADD COLUMN budget_gstd DECIMAL(18, 9);
        CREATE INDEX IF NOT EXISTS idx_tasks_budget_gstd ON tasks(budget_gstd DESC) WHERE budget_gstd IS NOT NULL;
        COMMENT ON COLUMN tasks.budget_gstd IS 'Total budget in GSTD tokens for the task';
    END IF;
END $$;

-- Add reward_gstd if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='reward_gstd') THEN
        ALTER TABLE tasks ADD COLUMN reward_gstd DECIMAL(18, 9);
        COMMENT ON COLUMN tasks.reward_gstd IS 'Reward amount in GSTD for the worker (95% of budget)';
    END IF;
END $$;

-- Add payment_memo if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='payment_memo') THEN
        ALTER TABLE tasks ADD COLUMN payment_memo VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_tasks_payment_memo ON tasks(payment_memo) WHERE payment_memo IS NOT NULL;
        COMMENT ON COLUMN tasks.payment_memo IS 'Unique payment memo for task payment (format: TASK-{task_id})';
    END IF;
END $$;

-- Add deposit_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='deposit_id') THEN
        ALTER TABLE tasks ADD COLUMN deposit_id VARCHAR(255);
        COMMENT ON COLUMN tasks.deposit_id IS 'Transaction hash of the payment deposit';
    END IF;
END $$;

-- Add payload if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='payload') THEN
        ALTER TABLE tasks ADD COLUMN payload TEXT;
        COMMENT ON COLUMN tasks.payload IS 'Task payload data (JSON string)';
    END IF;
END $$;

-- Analyze table for query optimization
ANALYZE tasks;
