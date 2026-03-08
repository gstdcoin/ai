CREATE TABLE IF NOT EXISTS public.task_contributions (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    contributor_wallet VARCHAR(128) NOT NULL,
    amount_gstd NUMERIC(18,9) NOT NULL,
    tx_hash VARCHAR(64),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_contributions_task_id ON public.task_contributions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_contributions_contributor ON public.task_contributions(contributor_wallet);

-- Update tasks table to ensure total_reward_pool is used and initialized
-- We want to make sure it includes the budget + any contributions.
-- Since this is a new feature, initially total_reward_pool should likely equate to budget_gstd or reward_gstd
-- But let's just make sure the column exists.
-- It already exists based on schema.sql, but let's be safe.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='total_reward_pool') THEN
        ALTER TABLE public.tasks ADD COLUMN total_reward_pool NUMERIC(18,9) DEFAULT 0;
    END IF;
END $$;
