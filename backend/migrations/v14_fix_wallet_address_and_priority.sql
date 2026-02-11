-- Migration v14: Fix wallet address length and priority_score column

-- 1. Increase wallet_address column size in nodes table (to support raw format addresses up to 66 chars)
ALTER TABLE nodes 
ALTER COLUMN wallet_address TYPE VARCHAR(100);

-- 2. Increase wallet_address column size in users table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='wallet_address') THEN
        ALTER TABLE users ALTER COLUMN wallet_address TYPE VARCHAR(100);
    END IF;
END $$;

-- 3. Increase wallet_address column size in devices table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='wallet_address') THEN
        ALTER TABLE devices ALTER COLUMN wallet_address TYPE VARCHAR(100);
    END IF;
END $$;

-- 4. Ensure priority_score column exists or use certainty_gravity_score
DO $$
BEGIN
    -- Check if priority_score exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='priority_score') THEN
        -- Check if certainty_gravity_score exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='certainty_gravity_score') THEN
            -- Create priority_score as alias or add it
            ALTER TABLE tasks ADD COLUMN priority_score DECIMAL(10, 6) DEFAULT 0.0;
            -- Copy values from certainty_gravity_score if it exists
            UPDATE tasks SET priority_score = certainty_gravity_score WHERE certainty_gravity_score IS NOT NULL;
        ELSE
            -- Add priority_score column
            ALTER TABLE tasks ADD COLUMN priority_score DECIMAL(10, 6) DEFAULT 0.0;
        END IF;
    END IF;
END $$;

-- 5. Ensure certainty_gravity_score exists (for compatibility)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='certainty_gravity_score') THEN
        ALTER TABLE tasks ADD COLUMN certainty_gravity_score DECIMAL(10, 6) DEFAULT 0.0;
        -- Copy values from priority_score if it exists
        UPDATE tasks SET certainty_gravity_score = priority_score WHERE priority_score IS NOT NULL;
    END IF;
END $$;

