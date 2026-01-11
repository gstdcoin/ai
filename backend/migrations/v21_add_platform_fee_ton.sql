-- Migration v21: Add platform_fee_ton column
-- Purpose: Fix missing platform_fee_ton column that blocks task updates after validation
-- Date: 2026-01-11

-- Add platform_fee_ton column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' 
        AND column_name = 'platform_fee_ton'
    ) THEN
        ALTER TABLE tasks 
        ADD COLUMN platform_fee_ton DECIMAL(20, 9);
        
        -- Update existing rows: calculate platform_fee_ton from labor_compensation_ton
        -- Assuming platform fee is 5% (0.05)
        UPDATE tasks 
        SET platform_fee_ton = labor_compensation_ton * 0.05
        WHERE platform_fee_ton IS NULL 
        AND labor_compensation_ton IS NOT NULL;
        
        RAISE NOTICE 'Added platform_fee_ton column to tasks table';
    ELSE
        RAISE NOTICE 'Column platform_fee_ton already exists in tasks table';
    END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_tasks_platform_fee_ton ON tasks(platform_fee_ton) WHERE platform_fee_ton IS NOT NULL;

-- Analyze table for query optimization
ANALYZE tasks;
