-- Migration v36: Final Optimization for Million Users
-- Purpose: Indexes for high-performance marketplace and load balancing

-- 1. Optimize Marketplace Sort: "Show me highest paying available tasks"
CREATE INDEX IF NOT EXISTS idx_tasks_marketplace_perf ON tasks(status, labor_compensation_gstd DESC) 
WHERE status = 'available';

-- 2. Optimize Load Balancer: "Find me trusted online nodes"
CREATE INDEX IF NOT EXISTS idx_nodes_lb_perf ON nodes(status, trust_score DESC) 
WHERE status = 'online';

-- 3. Optimize Heartbeat updates
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes(last_seen);

-- 4. Optimize History Lookups
CREATE INDEX IF NOT EXISTS idx_tasks_executor_completed ON tasks(executor_address, completed_at DESC) 
WHERE status = 'completed';

-- 5. Maintenance
VACUUM ANALYZE tasks;
VACUUM ANALYZE nodes;
