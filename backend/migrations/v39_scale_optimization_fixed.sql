-- Optimization for High Concurrency (1000+ MoltBots)
-- Migration v39_scale_optimization_fixed.sql

-- 1. Optimized Index for Worker Discovery (Partial Index)
-- Helps filtering online nodes quickly
DROP INDEX IF EXISTS idx_nodes_discovery_optimized;
CREATE INDEX idx_nodes_discovery_optimized 
ON nodes (trust_score DESC, last_seen DESC) 
WHERE status = 'online';

-- 2. Add 'specs' column if not exists (Required by Bridge Service)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'nodes' AND column_name = 'specs') THEN
        ALTER TABLE nodes ADD COLUMN specs JSONB DEFAULT '{}';
    END IF;
END $$;

-- 3. Index for JSONB capabilities (GIN index)
-- Speeds up discovery filtering by capability (e.g. GPU, Docker)
CREATE INDEX IF NOT EXISTS idx_nodes_specs_gin 
ON nodes USING GIN (specs);

-- 4. Covered Index for Session Verification
-- Speeds up every API call protected by session auth
CREATE INDEX IF NOT EXISTS idx_bridge_sessions_validation 
ON bridge_sessions (session_token) 
INCLUDE (client_id, client_wallet, is_active, expires_at);

-- 5. Covered Index for Task Status polling
-- Speeds up MoltBot polling loop
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_polling 
ON bridge_tasks (id) 
INCLUDE (status, worker_id, result_hash);
