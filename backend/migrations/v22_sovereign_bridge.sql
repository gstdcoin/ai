-- GSTD Sovereign Compute Bridge Database Schema
-- Migration v22: Bridge support tables

-- Bridge swap transactions (auto-swap TON → GSTD)
CREATE TABLE IF NOT EXISTS bridge_swaps (
    id UUID PRIMARY KEY,
    wallet_address VARCHAR(128) NOT NULL,
    amount_in DECIMAL(18,9) NOT NULL,
    currency_in VARCHAR(10) NOT NULL DEFAULT 'TON',
    expected_out DECIMAL(18,9) NOT NULL,
    actual_out DECIMAL(18,9),
    currency_out VARCHAR(10) NOT NULL DEFAULT 'GSTD',
    rate DECIMAL(18,9),
    tx_hash VARCHAR(128),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT bridge_swaps_status_check CHECK (status IN ('pending', 'completed', 'failed', 'cancelled'))
);

-- Index for wallet lookup
CREATE INDEX IF NOT EXISTS idx_bridge_swaps_wallet ON bridge_swaps(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bridge_swaps_status ON bridge_swaps(status);
CREATE INDEX IF NOT EXISTS idx_bridge_swaps_created ON bridge_swaps(created_at DESC);

-- Bridge tasks tracking
CREATE TABLE IF NOT EXISTS bridge_tasks (
    id UUID PRIMARY KEY,
    client_id VARCHAR(128) NOT NULL,
    client_wallet VARCHAR(128) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    payload_encrypted TEXT,
    required_capabilities JSONB DEFAULT '[]',
    min_reputation DECIMAL(3,2) DEFAULT 0.5,
    max_budget_gstd DECIMAL(18,9) NOT NULL,
    actual_cost_gstd DECIMAL(18,9),
    priority VARCHAR(20) DEFAULT 'normal',
    timeout_seconds INTEGER DEFAULT 300,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    worker_id VARCHAR(128),
    worker_wallet VARCHAR(128),
    reservation_token UUID,
    result_hash VARCHAR(64),
    result_encrypted TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT bridge_tasks_status_check CHECK (status IN ('pending', 'matched', 'processing', 'completed', 'failed', 'timeout', 'disputed', 'refunded')),
    CONSTRAINT bridge_tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical'))
);

-- Indexes for task queries
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_client ON bridge_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_wallet ON bridge_tasks(client_wallet);
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_status ON bridge_tasks(status);
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_worker ON bridge_tasks(worker_id);
CREATE INDEX IF NOT EXISTS idx_bridge_tasks_created ON bridge_tasks(created_at DESC);

-- Bridge sessions
CREATE TABLE IF NOT EXISTS bridge_sessions (
    id UUID PRIMARY KEY,
    session_token VARCHAR(128) UNIQUE NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_wallet VARCHAR(128) NOT NULL,
    api_key_hash VARCHAR(64),
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_bridge_sessions_token ON bridge_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_bridge_sessions_client ON bridge_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_bridge_sessions_active ON bridge_sessions(is_active) WHERE is_active = true;

-- Worker reservations
CREATE TABLE IF NOT EXISTS bridge_reservations (
    id UUID PRIMARY KEY,
    reservation_token UUID UNIQUE NOT NULL,
    worker_id VARCHAR(128) NOT NULL,
    worker_wallet VARCHAR(128) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    task_id UUID,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT bridge_reservations_status_check CHECK (status IN ('active', 'used', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_bridge_reservations_token ON bridge_reservations(reservation_token);
CREATE INDEX IF NOT EXISTS idx_bridge_reservations_worker ON bridge_reservations(worker_id);
CREATE INDEX IF NOT EXISTS idx_bridge_reservations_expires ON bridge_reservations(expires_at);

-- User wallet extended info (if table exists, add columns)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_wallets') THEN
        CREATE TABLE user_wallets (
            address VARCHAR(128) PRIMARY KEY,
            gstd_balance DECIMAL(18,9) DEFAULT 0,
            locked_balance DECIMAL(18,9) DEFAULT 0,
            ton_balance_cached DECIMAL(18,9) DEFAULT 0,
            auto_swap_enabled BOOLEAN DEFAULT true,
            max_auto_swap_ton DECIMAL(18,9) DEFAULT 10,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    END IF;
END $$;

-- Add auto_swap column to users if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'settings'
    ) THEN
        ALTER TABLE users ADD COLUMN settings JSONB DEFAULT '{"auto_swap_enabled": true}';
    END IF;
END $$;

-- Bridge metrics aggregation (for analytics)
CREATE TABLE IF NOT EXISTS bridge_metrics (
    id SERIAL PRIMARY KEY,
    metric_date DATE NOT NULL,
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    failed_tasks INTEGER DEFAULT 0,
    total_gstd_spent DECIMAL(18,9) DEFAULT 0,
    total_swaps INTEGER DEFAULT 0,
    total_ton_swapped DECIMAL(18,9) DEFAULT 0,
    unique_clients INTEGER DEFAULT 0,
    unique_workers INTEGER DEFAULT 0,
    avg_task_duration_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_metrics_date ON bridge_metrics(metric_date);

-- Function to update bridge metrics daily
CREATE OR REPLACE FUNCTION update_bridge_daily_metrics()
RETURNS void AS $$
BEGIN
    INSERT INTO bridge_metrics (metric_date, total_tasks, completed_tasks, failed_tasks, total_gstd_spent, unique_clients, unique_workers, avg_task_duration_ms)
    SELECT 
        CURRENT_DATE,
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status IN ('failed', 'timeout')),
        COALESCE(SUM(actual_cost_gstd), 0),
        COUNT(DISTINCT client_id),
        COUNT(DISTINCT worker_id),
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::INTEGER, 0)
    FROM bridge_tasks
    WHERE created_at::DATE = CURRENT_DATE
    ON CONFLICT (metric_date) DO UPDATE SET
        total_tasks = EXCLUDED.total_tasks,
        completed_tasks = EXCLUDED.completed_tasks,
        failed_tasks = EXCLUDED.failed_tasks,
        total_gstd_spent = EXCLUDED.total_gstd_spent,
        unique_clients = EXCLUDED.unique_clients,
        unique_workers = EXCLUDED.unique_workers,
        avg_task_duration_ms = EXCLUDED.avg_task_duration_ms;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE bridge_swaps IS 'Auto-swap transactions for TON→GSTD conversions';
COMMENT ON TABLE bridge_tasks IS 'Tasks submitted through Sovereign Compute Bridge';
COMMENT ON TABLE bridge_sessions IS 'Active bridge client sessions (MoltBot instances)';
COMMENT ON TABLE bridge_reservations IS 'Worker reservations for pending tasks';
