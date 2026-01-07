-- Base schema initialization
-- This creates the core tables needed for the platform

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    task_id UUID PRIMARY KEY,
    requester_address VARCHAR(48) NOT NULL,
    task_type VARCHAR(20) NOT NULL,
    operation VARCHAR(50) NOT NULL,
    model VARCHAR(50),
    input_source VARCHAR(10) NOT NULL,
    input_hash VARCHAR(255),
    input_data TEXT,
    constraints_time_limit_sec INTEGER NOT NULL,
    constraints_max_energy_mwh INTEGER NOT NULL,
    reward_amount_ton DECIMAL(18, 9) NOT NULL,
    validation_method VARCHAR(20) NOT NULL,
    priority_score DECIMAL(10, 6) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    assigned_at TIMESTAMP,
    completed_at TIMESTAMP,
    escrow_address VARCHAR(48) NOT NULL,
    escrow_amount_ton DECIMAL(18, 9) NOT NULL,
    assigned_device VARCHAR(255),
    timeout_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_requester ON tasks(requester_address);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(255) PRIMARY KEY,
    wallet_address VARCHAR(48) NOT NULL UNIQUE,
    device_type VARCHAR(20) NOT NULL,
    reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    total_tasks INTEGER NOT NULL DEFAULT 0,
    successful_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks INTEGER NOT NULL DEFAULT 0,
    total_energy_consumed INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER NOT NULL DEFAULT 0,
    cached_models TEXT[],
    last_seen_at TIMESTAMP NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    slashing_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_devices_reputation ON devices(reputation DESC);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active, reputation DESC);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);

-- Task assignments table
CREATE TABLE IF NOT EXISTS task_assignments (
    assignment_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id),
    assigned_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL,
    result_data JSONB,
    proof_signature VARCHAR(255),
    proof_timestamp BIGINT,
    proof_energy_consumed INTEGER,
    proof_execution_time_ms INTEGER,
    validation_status VARCHAR(20),
    validation_method VARCHAR(20),
    payment_tx_hash VARCHAR(64),
    payment_status VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_assignments_device ON task_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON task_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_assigned_at ON task_assignments(assigned_at);

-- Validations table
CREATE TABLE IF NOT EXISTS validations (
    validation_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    assignment_id UUID NOT NULL REFERENCES task_assignments(assignment_id),
    validation_method VARCHAR(20) NOT NULL,
    reference_result JSONB,
    majority_results JSONB[],
    ai_check_confidence DECIMAL(5, 4),
    human_check_result BOOLEAN,
    human_checker_address VARCHAR(48),
    validation_result VARCHAR(20) NOT NULL,
    validated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_validations_task ON validations(task_id);
CREATE INDEX IF NOT EXISTS idx_validations_result ON validations(validation_result);

-- Requesters table
CREATE TABLE IF NOT EXISTS requesters (
    requester_address VARCHAR(48) PRIMARY KEY,
    gstd_balance DECIMAL(18, 9) NOT NULL DEFAULT 0,
    reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    total_tasks_created INTEGER NOT NULL DEFAULT 0,
    total_tasks_completed INTEGER NOT NULL DEFAULT 0,
    total_ton_spent DECIMAL(18, 9) NOT NULL DEFAULT 0,
    average_validation_success_rate DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    timely_payments_count INTEGER NOT NULL DEFAULT 0,
    last_activity_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requesters_reputation ON requesters(reputation DESC);
CREATE INDEX IF NOT EXISTS idx_requesters_balance ON requesters(gstd_balance DESC);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    assignment_id UUID NOT NULL REFERENCES task_assignments(assignment_id),
    device_address VARCHAR(48) NOT NULL,
    amount_ton DECIMAL(18, 9) NOT NULL,
    base_reward DECIMAL(18, 9) NOT NULL,
    energy_bonus DECIMAL(18, 9) NOT NULL DEFAULT 0,
    time_bonus DECIMAL(18, 9) NOT NULL DEFAULT 0,
    reputation_multiplier DECIMAL(5, 4) NOT NULL DEFAULT 1.0,
    tx_hash VARCHAR(64) UNIQUE,
    tx_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    confirmed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_device ON payments(device_address);
CREATE INDEX IF NOT EXISTS idx_payments_tx_status ON payments(tx_status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Slashings table
CREATE TABLE IF NOT EXISTS slashings (
    slashing_id UUID PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id),
    task_id UUID REFERENCES tasks(task_id),
    assignment_id UUID REFERENCES task_assignments(assignment_id),
    reason VARCHAR(50) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    amount_gstd DECIMAL(18, 9) NOT NULL,
    slashed_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slashings_device ON slashings(device_id);
CREATE INDEX IF NOT EXISTS idx_slashings_reason ON slashings(reason);

-- Device metrics table
CREATE TABLE IF NOT EXISTS device_metrics (
    metric_id UUID PRIMARY KEY,
    device_id VARCHAR(255) NOT NULL REFERENCES devices(device_id),
    metric_type VARCHAR(20) NOT NULL,
    metric_value DECIMAL(10, 4) NOT NULL,
    recorded_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_device_type ON device_metrics(device_id, metric_type, recorded_at DESC);

-- Task queue table
CREATE TABLE IF NOT EXISTS task_queue (
    queue_id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(task_id),
    priority_score DECIMAL(10, 6) NOT NULL,
    queued_at TIMESTAMP NOT NULL,
    assigned_at TIMESTAMP,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_priority ON task_queue(status, priority_score DESC, queued_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_task ON task_queue(task_id);


