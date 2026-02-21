-- Migration v41: Node Performance and Map Optimization
-- Purpose: Index for fast lookups of online nodes for the global map
-- Date: 2026-01-29

CREATE INDEX IF NOT EXISTS idx_nodes_status_geo ON nodes(status, latitude, longitude) WHERE status = 'online';

-- Ensure we have statistics for the new index
ANALYZE nodes;
