-- Migration v17: Fix Missing Tables and Columns
-- Purpose: Create missing tables (golden_reserve_log, nodes) and add missing column (labor_compensation_ton)
-- Date: 2026-01-11

-- 1. Create golden_reserve_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS golden_reserve_log (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    gstd_amount DECIMAL(18, 9) NOT NULL,
    xaut_amount DECIMAL(18, 9),
    treasury_wallet VARCHAR(48) NOT NULL,
    swap_tx_hash VARCHAR(64),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for golden_reserve_log
CREATE INDEX IF NOT EXISTS idx_golden_reserve_task_id ON golden_reserve_log(task_id);
CREATE INDEX IF NOT EXISTS idx_golden_reserve_timestamp ON golden_reserve_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_golden_reserve_treasury ON golden_reserve_log(treasury_wallet);

-- 2. Create users table if it doesn't exist (required for nodes foreign key)
CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(48) PRIMARY KEY,
    balance DECIMAL(18, 9) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- 3. Create nodes table if it doesn't exist
CREATE TABLE IF NOT EXISTS nodes (
    id VARCHAR(255) PRIMARY KEY,
    wallet_address VARCHAR(48) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    cpu_model VARCHAR(255),
    ram_gb INTEGER,
    last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for nodes
CREATE INDEX IF NOT EXISTS idx_nodes_wallet_address ON nodes(wallet_address);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes(last_seen DESC);

-- Add foreign key constraint only if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'nodes_wallet_address_fkey'
    ) THEN
        ALTER TABLE nodes 
        ADD CONSTRAINT nodes_wallet_address_fkey 
        FOREIGN KEY (wallet_address) REFERENCES users(wallet_address) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Add labor_compensation_ton column to tasks if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'labor_compensation_ton'
    ) THEN
        ALTER TABLE tasks 
        ADD COLUMN labor_compensation_ton DECIMAL(18, 9);
        
        -- Migrate data from reward_amount_ton if it exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'tasks' AND column_name = 'reward_amount_ton'
        ) THEN
            UPDATE tasks 
            SET labor_compensation_ton = reward_amount_ton 
            WHERE labor_compensation_ton IS NULL;
        END IF;
        
        -- Set default for NULL values
        UPDATE tasks 
        SET labor_compensation_ton = 0 
        WHERE labor_compensation_ton IS NULL;
        
        -- Make column NOT NULL after migration
        ALTER TABLE tasks 
        ALTER COLUMN labor_compensation_ton SET NOT NULL,
        ALTER COLUMN labor_compensation_ton SET DEFAULT 0;
    END IF;
END $$;

-- 5. Add index for labor_compensation_ton if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_tasks_labor_compensation ON tasks(labor_compensation_ton DESC);

-- 6. Add comments for documentation
COMMENT ON TABLE golden_reserve_log IS 'Log of GSTD to XAUt swaps for golden reserve';
COMMENT ON TABLE nodes IS 'Registered computing nodes (devices)';
COMMENT ON COLUMN tasks.labor_compensation_ton IS 'Labor compensation amount in TON';
