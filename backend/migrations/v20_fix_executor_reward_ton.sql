-- Migration v20: Fix executor_reward_ton column
-- Purpose: Ensure executor_reward_ton column exists in tasks table
-- Date: 2026-01-11

-- Add executor_reward_ton column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'executor_reward_ton'
    ) THEN
        ALTER TABLE tasks 
        ADD COLUMN executor_reward_ton DECIMAL(20, 9);
        
        -- Update existing rows: calculate executor_reward_ton from labor_compensation_ton
        -- Assuming platform fee is 5% (0.05)
        UPDATE tasks 
        SET executor_reward_ton = labor_compensation_ton * 0.95
        WHERE executor_reward_ton IS NULL 
        AND labor_compensation_ton IS NOT NULL;
        
        RAISE NOTICE 'Added executor_reward_ton column to tasks table';
    ELSE
        RAISE NOTICE 'Column executor_reward_ton already exists in tasks table';
    END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_tasks_executor_reward_ton ON tasks(executor_reward_ton) WHERE executor_reward_ton IS NOT NULL;

-- Analyze table for query optimization
ANALYZE tasks;
