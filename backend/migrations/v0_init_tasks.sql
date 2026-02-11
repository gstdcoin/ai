-- Initial tasks table creation
-- This should be the first migration to run

CREATE TABLE IF NOT EXISTS tasks (
    task_id VARCHAR(255) PRIMARY KEY,
    requester_address VARCHAR(255) NOT NULL,
    task_type VARCHAR(100) NOT NULL,
    operation VARCHAR(100),
    model VARCHAR(255),
    labor_compensation_ton DECIMAL(20, 9) DEFAULT 0,
    priority_score DECIMAL(10, 6) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    escrow_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    min_trust_score DECIMAL(5, 2) DEFAULT 0,
    is_private BOOLEAN DEFAULT FALSE,
    confidence_depth INTEGER DEFAULT 1,
    redundancy_factor INTEGER DEFAULT 1,
    is_spot_check BOOLEAN DEFAULT FALSE,
    payload TEXT,
    executor_address VARCHAR(255),
    result TEXT,
    result_hash VARCHAR(255),
    validated_at TIMESTAMP,
    payment_verified_at TIMESTAMP,
    payment_memo VARCHAR(255),
    platform_fee_ton DECIMAL(20, 9) DEFAULT 0,
    executor_reward_ton DECIMAL(20, 9) DEFAULT 0,
    executor_payout_status VARCHAR(50) DEFAULT 'pending',
    executor_payout_tx_hash VARCHAR(255),
    certainty_gravity_score DECIMAL(10, 6) DEFAULT 0,
    validation_hash VARCHAR(255),
    arbitration_count INTEGER DEFAULT 0,
    entropy_score DECIMAL(10, 6) DEFAULT 1.0
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_requester ON tasks(requester_address);
CREATE INDEX IF NOT EXISTS idx_tasks_executor ON tasks(executor_address);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_labor_compensation ON tasks(labor_compensation_ton DESC);

-- Create payout_history if not exists
CREATE TABLE IF NOT EXISTS payout_history (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) REFERENCES tasks(task_id),
    executor_address VARCHAR(255) NOT NULL,
    amount_ton DECIMAL(20, 9) NOT NULL,
    tx_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payout_history_executor ON payout_history(executor_address);
CREATE INDEX IF NOT EXISTS idx_payout_history_status ON payout_history(status);

-- Create payout_transactions if not exists
CREATE TABLE IF NOT EXISTS payout_transactions (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255),
    wallet_address VARCHAR(255) NOT NULL,
    amount_ton DECIMAL(20, 9) NOT NULL,
    tx_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_tx_status ON payout_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payout_tx_wallet ON payout_transactions(wallet_address);

-- Create failed_payouts table if not exists
CREATE TABLE IF NOT EXISTS failed_payouts (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255),
    executor_address VARCHAR(255) NOT NULL,
    amount_ton DECIMAL(20, 9) NOT NULL,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_payouts_executor ON failed_payouts(executor_address);
CREATE INDEX IF NOT EXISTS idx_failed_payouts_retry ON failed_payouts(retry_count);

-- Create network_measurements for GENESIS_MAP
CREATE TABLE IF NOT EXISTS network_measurements (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(255) NOT NULL,
    latency_ms INTEGER,
    packet_loss FLOAT,
    connection_type VARCHAR(50),
    gps_lat FLOAT,
    gps_lng FLOAT,
    recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_measurements_node ON network_measurements(node_id);
CREATE INDEX IF NOT EXISTS idx_network_measurements_recorded ON network_measurements(recorded_at DESC);

COMMENT ON TABLE tasks IS 'Main tasks table for distributed computing platform';
COMMENT ON TABLE network_measurements IS 'Network telemetry data from GENESIS_MAP task';
