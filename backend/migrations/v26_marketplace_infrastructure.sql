-- Migration v26: Marketplace Infrastructure
-- Purpose: Escrow system, transaction history, worker ratings
-- Date: 2026-01-17

-- ============================================
-- 1. TASK ESCROW TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS task_escrow (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL UNIQUE,
    creator_wallet VARCHAR(48) NOT NULL,
    
    -- Amounts
    budget_gstd DECIMAL(18, 9) NOT NULL,        -- Original budget
    platform_fee_gstd DECIMAL(18, 9) NOT NULL,  -- 5% fee
    total_locked_gstd DECIMAL(18, 9) NOT NULL,  -- budget + fee
    
    -- Configuration
    difficulty VARCHAR(20) DEFAULT 'medium',     -- easy, medium, hard
    task_type VARCHAR(50) NOT NULL,              -- network_survey, js_script, wasm_binary
    geography JSONB DEFAULT '{"type": "global"}'::jsonb,  -- {type: "global"} or {type: "countries", list: ["US", "DE"]}
    
    -- Status
    status VARCHAR(20) DEFAULT 'locked',         -- locked, released, refunded, expired
    locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
    released_at TIMESTAMP,
    
    -- Payout tracking
    workers_paid INTEGER DEFAULT 0,
    total_paid_gstd DECIMAL(18, 9) DEFAULT 0,
    
    -- Foreign key
    CONSTRAINT fk_escrow_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_escrow_creator ON task_escrow(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON task_escrow(status);
CREATE INDEX IF NOT EXISTS idx_escrow_locked_at ON task_escrow(locked_at DESC);

-- ============================================
-- 2. TRANSACTION HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS transaction_history (
    id SERIAL PRIMARY KEY,
    tx_id VARCHAR(64) NOT NULL UNIQUE,          -- Unique transaction ID (UUID)
    
    -- Parties
    from_wallet VARCHAR(48),                     -- NULL for platform
    to_wallet VARCHAR(48) NOT NULL,
    
    -- Transaction details
    amount_gstd DECIMAL(18, 9) NOT NULL,
    tx_type VARCHAR(30) NOT NULL,               -- escrow_lock, worker_payout, platform_fee, refund
    
    -- References
    task_id VARCHAR(255),
    escrow_id INTEGER,
    
    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending',        -- pending, confirmed, failed
    
    CONSTRAINT fk_tx_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE SET NULL,
    CONSTRAINT fk_tx_escrow FOREIGN KEY (escrow_id) REFERENCES task_escrow(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_from ON transaction_history(from_wallet);
CREATE INDEX IF NOT EXISTS idx_tx_to ON transaction_history(to_wallet);
CREATE INDEX IF NOT EXISTS idx_tx_task ON transaction_history(task_id);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transaction_history(tx_type);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transaction_history(created_at DESC);

-- ============================================
-- 3. WORKER RATINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS worker_ratings (
    id SERIAL PRIMARY KEY,
    worker_wallet VARCHAR(48) NOT NULL,
    
    -- Rating metrics
    total_tasks_completed INTEGER DEFAULT 0,
    total_tasks_failed INTEGER DEFAULT 0,
    total_earnings_gstd DECIMAL(18, 9) DEFAULT 0,
    
    -- Performance metrics
    avg_execution_time_ms INTEGER DEFAULT 0,
    avg_quality_score DECIMAL(5, 4) DEFAULT 0.5,
    reliability_score DECIMAL(5, 4) DEFAULT 0.5,   -- Successful / Total
    
    -- Capabilities (updated by client)
    cpu_cores INTEGER,
    ram_gb DECIMAL(5, 2),
    connection_type VARCHAR(20),
    last_known_country VARCHAR(3),
    
    -- Timestamps
    first_task_at TIMESTAMP,
    last_task_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(worker_wallet)
);

CREATE INDEX IF NOT EXISTS idx_worker_rating ON worker_ratings(reliability_score DESC);
CREATE INDEX IF NOT EXISTS idx_worker_earnings ON worker_ratings(total_earnings_gstd DESC);
CREATE INDEX IF NOT EXISTS idx_worker_country ON worker_ratings(last_known_country);

-- ============================================
-- 4. MARKETPLACE TASK EXTENSIONS
-- ============================================
-- Add marketplace fields to tasks table
DO $$
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'budget_gstd') THEN
        ALTER TABLE tasks ADD COLUMN budget_gstd DECIMAL(18, 9);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'difficulty') THEN
        ALTER TABLE tasks ADD COLUMN difficulty VARCHAR(20) DEFAULT 'medium';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'geography') THEN
        ALTER TABLE tasks ADD COLUMN geography JSONB DEFAULT '{"type": "global"}'::jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'escrow_id') THEN
        ALTER TABLE tasks ADD COLUMN escrow_id INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'max_workers') THEN
        ALTER TABLE tasks ADD COLUMN max_workers INTEGER DEFAULT 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'workers_completed') THEN
        ALTER TABLE tasks ADD COLUMN workers_completed INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'reward_per_worker') THEN
        ALTER TABLE tasks ADD COLUMN reward_per_worker DECIMAL(18, 9);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'estimated_time_sec') THEN
        ALTER TABLE tasks ADD COLUMN estimated_time_sec INTEGER DEFAULT 30;
    END IF;
END $$;

-- ============================================
-- 5. PLATFORM FUNDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS platform_funds (
    id SERIAL PRIMARY KEY,
    fund_type VARCHAR(30) NOT NULL,             -- dev_fund, gold_reserve
    balance_gstd DECIMAL(18, 9) DEFAULT 0,
    total_received_gstd DECIMAL(18, 9) DEFAULT 0,
    total_withdrawn_gstd DECIMAL(18, 9) DEFAULT 0,
    last_deposit_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(fund_type)
);

-- Initialize funds
INSERT INTO platform_funds (fund_type, balance_gstd) 
VALUES 
    ('dev_fund', 0),
    ('gold_reserve', 0)
ON CONFLICT (fund_type) DO NOTHING;

-- ============================================
-- 6. FUND TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS fund_transactions (
    id SERIAL PRIMARY KEY,
    fund_type VARCHAR(30) NOT NULL,
    amount_gstd DECIMAL(18, 9) NOT NULL,
    tx_type VARCHAR(20) NOT NULL,               -- deposit, withdrawal
    source_task_id VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fund_tx_type ON fund_transactions(fund_type, created_at DESC);

-- ============================================
-- 7. WORKER TASK ASSIGNMENTS (for multi-worker tasks)
-- ============================================
CREATE TABLE IF NOT EXISTS worker_task_assignments (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    worker_wallet VARCHAR(48) NOT NULL,
    device_id VARCHAR(255),
    
    -- Status
    status VARCHAR(20) DEFAULT 'assigned',       -- assigned, executing, completed, failed, timeout
    
    -- Execution details
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    execution_time_ms INTEGER,
    
    -- Result
    result_data JSONB,
    quality_score DECIMAL(5, 4),
    
    -- Payout
    reward_gstd DECIMAL(18, 9),
    payout_tx_id VARCHAR(64),
    paid_at TIMESTAMP,
    
    UNIQUE(task_id, worker_wallet),
    CONSTRAINT fk_assignment_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_worker ON worker_task_assignments(worker_wallet);
CREATE INDEX IF NOT EXISTS idx_assignment_status ON worker_task_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignment_task ON worker_task_assignments(task_id);

-- Analyze all new tables
ANALYZE task_escrow;
ANALYZE transaction_history;
ANALYZE worker_ratings;
ANALYZE platform_funds;
ANALYZE fund_transactions;
ANALYZE worker_task_assignments;

-- Comments
COMMENT ON TABLE task_escrow IS 'Holds locked funds for tasks until completion';
COMMENT ON TABLE transaction_history IS 'Complete audit trail of all GSTD movements';
COMMENT ON TABLE worker_ratings IS 'Worker reputation and performance tracking';
COMMENT ON TABLE platform_funds IS 'Platform treasury: dev fund (2%) and gold reserve (3%)';
