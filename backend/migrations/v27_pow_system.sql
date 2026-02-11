-- Migration v27: Proof-of-Work System
-- Purpose: Challenge tracking for spam prevention
-- Date: 2026-01-18

-- ============================================
-- 1. POW CHALLENGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pow_challenges (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    worker_wallet VARCHAR(48) NOT NULL,
    
    -- Challenge data
    challenge VARCHAR(64) NOT NULL,           -- Random hex challenge
    difficulty INTEGER NOT NULL DEFAULT 16,   -- Leading zero bits required
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    nonce VARCHAR(64),                        -- Successful nonce
    
    -- Computed hash for audit
    result_hash VARCHAR(64),
    
    -- Unique constraint per task+worker
    UNIQUE(task_id, worker_wallet)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pow_task ON pow_challenges(task_id);
CREATE INDEX IF NOT EXISTS idx_pow_worker ON pow_challenges(worker_wallet);
CREATE INDEX IF NOT EXISTS idx_pow_expires ON pow_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_pow_verified ON pow_challenges(verified, created_at DESC);

-- ============================================
-- 2. POW AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS pow_audit_log (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    worker_wallet VARCHAR(48) NOT NULL,
    
    -- Attempt details
    attempt_nonce VARCHAR(64),
    result_hash VARCHAR(64),
    leading_zeros INTEGER,
    difficulty_required INTEGER,
    
    -- Result
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    
    -- Timing
    compute_time_ms INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pow_audit_task ON pow_audit_log(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pow_audit_worker ON pow_audit_log(worker_wallet, created_at DESC);

-- ============================================
-- 3. ADD POW REQUIREMENT TO TASKS
-- ============================================
DO $$
BEGIN
    -- Add pow_required column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'pow_required') THEN
        ALTER TABLE tasks ADD COLUMN pow_required BOOLEAN DEFAULT TRUE;
    END IF;
    
    -- Add pow_difficulty column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'pow_difficulty') THEN
        ALTER TABLE tasks ADD COLUMN pow_difficulty INTEGER DEFAULT 16;
    END IF;
END $$;

-- ============================================
-- 4. STATISTICS VIEW
-- ============================================
CREATE OR REPLACE VIEW pow_statistics AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as total_challenges,
    COUNT(*) FILTER (WHERE verified = true) as verified_count,
    ROUND(AVG(difficulty), 1) as avg_difficulty,
    COUNT(DISTINCT worker_wallet) as unique_workers
FROM pow_challenges
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Analyze tables
ANALYZE pow_challenges;

-- Comments
COMMENT ON TABLE pow_challenges IS 'Proof-of-Work challenges for spam prevention';
COMMENT ON TABLE pow_audit_log IS 'Audit log of all PoW verification attempts';
COMMENT ON COLUMN pow_challenges.difficulty IS 'Number of leading zero bits required in SHA256 hash';
