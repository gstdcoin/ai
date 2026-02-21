-- Migration v16: Shift to GSTD Economy
-- Renames columns to explicitly denote GSTD currency and removes ambiguity.



-- 1. Tasks Table
-- Rename labor_compensation_ton -> labor_compensation_gstd
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='labor_compensation_ton') THEN
        ALTER TABLE tasks RENAME COLUMN labor_compensation_ton TO labor_compensation_gstd;
    END IF;
    -- If column didn't exist but we need it, ensure it exists (handling previous schema inconsistencies)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='labor_compensation_gstd') THEN
        ALTER TABLE tasks ADD COLUMN labor_compensation_gstd DECIMAL(20, 9) DEFAULT 0;
    END IF;
END $$;

-- 2. Payout Transactions
-- Rename executor_reward_ton -> executor_reward_gstd
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_transactions' AND column_name='executor_reward_ton') THEN
        ALTER TABLE payout_transactions RENAME COLUMN executor_reward_ton TO executor_reward_gstd;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_transactions' AND column_name='platform_fee_ton') THEN
        ALTER TABLE payout_transactions RENAME COLUMN platform_fee_ton TO platform_fee_gstd;
    END IF;

    -- Ensure GSTD columns exist if rename didn't happen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_transactions' AND column_name='executor_reward_gstd') THEN
        ALTER TABLE payout_transactions ADD COLUMN executor_reward_gstd DECIMAL(20, 9) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_transactions' AND column_name='platform_fee_gstd') THEN
        ALTER TABLE payout_transactions ADD COLUMN platform_fee_gstd DECIMAL(20, 9) DEFAULT 0;
    END IF;
END $$;

-- 3. Payout Intents
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_intents' AND column_name='executor_reward_ton') THEN
        ALTER TABLE payout_intents RENAME COLUMN executor_reward_ton TO executor_reward_gstd;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_intents' AND column_name='platform_fee_ton') THEN
        ALTER TABLE payout_intents RENAME COLUMN platform_fee_ton TO platform_fee_gstd;
    END IF;

    -- Ensure GSTD columns exist if rename didn't happen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_intents' AND column_name='executor_reward_gstd') THEN
        ALTER TABLE payout_intents ADD COLUMN executor_reward_gstd DECIMAL(20, 9) NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payout_intents' AND column_name='platform_fee_gstd') THEN
        ALTER TABLE payout_intents ADD COLUMN platform_fee_gstd DECIMAL(20, 9) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 4. Update Views or Comments (Optional maintenance)
COMMENT ON COLUMN tasks.labor_compensation_gstd IS 'Reward amount in GSTD tokens';
COMMENT ON COLUMN payout_transactions.executor_reward_gstd IS 'Amount paid to executor in GSTD';


