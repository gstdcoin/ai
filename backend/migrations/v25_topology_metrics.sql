-- Migration v25: Topology Metrics Table for Genesis Task Telemetry
-- Purpose: Store 5G/GPS telemetry data with geo-spatial indexes
-- Date: 2026-01-17

-- Create topology_metrics table for storing device telemetry
CREATE TABLE IF NOT EXISTS topology_metrics (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    wallet_address VARCHAR(48) NOT NULL,
    
    -- Timestamp
    collected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    client_timestamp TIMESTAMP,
    
    -- GPS Data
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    gps_accuracy DECIMAL(10, 2),
    altitude DECIMAL(10, 2),
    speed DECIMAL(10, 2),
    
    -- H3 Index for efficient geo queries (https://h3geo.org)
    -- Resolution 7 = ~5.16 km² hexagon
    -- Resolution 9 = ~0.11 km² hexagon  
    h3_index_r7 VARCHAR(20),
    h3_index_r9 VARCHAR(20),
    
    -- Network/5G Data
    connection_type VARCHAR(20), -- 'wifi', '4g', '5g', 'ethernet'
    effective_type VARCHAR(10), -- 'slow-2g', '2g', '3g', '4g'
    downlink_mbps DECIMAL(10, 2),
    rtt_ms INTEGER,
    save_data BOOLEAN DEFAULT false,
    
    -- Device Info
    platform VARCHAR(50),
    vendor VARCHAR(100),
    cpu_cores INTEGER,
    memory_gb DECIMAL(5, 2),
    user_agent TEXT,
    
    -- Validation Status
    is_validated BOOLEAN DEFAULT false,
    validation_score DECIMAL(5, 4),
    
    -- Foreign Keys
    CONSTRAINT fk_topology_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- Performance indexes for topology_metrics
-- Index on task_id for joins with tasks table
CREATE INDEX IF NOT EXISTS idx_topology_task_id ON topology_metrics(task_id);

-- Index on wallet_address for user queries
CREATE INDEX IF NOT EXISTS idx_topology_wallet ON topology_metrics(wallet_address);

-- Index on device_id for device queries
CREATE INDEX IF NOT EXISTS idx_topology_device ON topology_metrics(device_id);

-- Temporal index for time-series queries
CREATE INDEX IF NOT EXISTS idx_topology_collected_at ON topology_metrics(collected_at DESC);

-- H3 geo-spatial indexes for efficient location queries
-- These enable fast queries like "find all metrics in hexagon X"
CREATE INDEX IF NOT EXISTS idx_topology_h3_r7 ON topology_metrics(h3_index_r7) WHERE h3_index_r7 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_topology_h3_r9 ON topology_metrics(h3_index_r9) WHERE h3_index_r9 IS NOT NULL;

-- Compound index for map queries (location + time)
CREATE INDEX IF NOT EXISTS idx_topology_geo_time ON topology_metrics(h3_index_r7, collected_at DESC) 
WHERE h3_index_r7 IS NOT NULL;

-- Connection type index for network analysis
CREATE INDEX IF NOT EXISTS idx_topology_connection ON topology_metrics(connection_type, effective_type);

-- Validation status index
CREATE INDEX IF NOT EXISTS idx_topology_validated ON topology_metrics(is_validated, collected_at DESC);

-- Create telemetry_queue table for Redis fallback
-- Used when PostgreSQL is temporarily unavailable
CREATE TABLE IF NOT EXISTS telemetry_queue (
    id SERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    status VARCHAR(20) DEFAULT 'pending' -- 'pending', 'processing', 'completed', 'failed'
);

-- Index for queue processing
CREATE INDEX IF NOT EXISTS idx_telemetry_queue_status ON telemetry_queue(status, created_at)
WHERE status = 'pending';

-- Add rate limiting tracking for telemetry endpoints
CREATE TABLE IF NOT EXISTS telemetry_rate_limits (
    wallet_address VARCHAR(48) PRIMARY KEY,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP NOT NULL DEFAULT NOW(),
    last_request TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for rate limit cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON telemetry_rate_limits(window_start);

-- Analyze tables
ANALYZE topology_metrics;
ANALYZE telemetry_queue;
ANALYZE telemetry_rate_limits;

-- Comments for documentation
COMMENT ON TABLE topology_metrics IS 'Stores 5G/GPS telemetry data from Genesis Task execution';
COMMENT ON COLUMN topology_metrics.h3_index_r7 IS 'H3 hexagonal index at resolution 7 (~5km² hexagon) for regional queries';
COMMENT ON COLUMN topology_metrics.h3_index_r9 IS 'H3 hexagonal index at resolution 9 (~0.1km² hexagon) for local queries';
COMMENT ON TABLE telemetry_queue IS 'Fallback queue for telemetry when PostgreSQL is unavailable';
COMMENT ON TABLE telemetry_rate_limits IS 'Rate limiting tracking for telemetry submission endpoints';
