-- Optimization for High Concurrency (1000+ MoltBots)
-- Migration v39_scale_optimization.sql

-- 1. Optimized Index for Worker Discovery
-- Uses partial index for 'online' nodes only to keep it small and fast
CREATE INDEX IF NOT EXISTS idx_nodes_discovery_optimized 
ON nodes (trust_score DESC, last_seen DESC) 
WHERE status = 'online';

-- 2. Index for JSONB capabilities (GIN index) to speed up specs->'capabilities' @> ...
CREATE INDEX IF NOT EXISTS idx_nodes_specs_gin 
ON nodes USING GIN (specs);

-- 3. Optimization for Session Verification (frequently called by middleware)
-- Covering index to avoid heap lookup for session validation
CREATE INDEX IF NOT EXISTS idx_bridge_sessions_validation 
ON bridge_sessions (session_token) 
INCLUDE (client_id, client_wallet, is_active, expires_at);

-- 4. Optimization for Task Status polling (MoltBot polls this often)
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_polling 
ON bridge_tasks (id) 
INCLUDE (status, worker_id, result_hash);

-- 5. Increase Max Connections logic (applied via app config, but ensuring DB user limits are fine)
ALTER ROLE postgres SET max_connections = 500;
