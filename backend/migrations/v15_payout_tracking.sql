-- Migration v15: Payout tracking and idempotency
-- Adds tables for tracking payout transactions and ensuring idempotency

-- Table for tracking payout transactions
CREATE TABLE IF NOT EXISTS payout_transactions (
    id SERIAL PRIMARY KEY,
    task_id UUID NOT NULL,
    executor_address VARCHAR(255) NOT NULL,
    tx_hash VARCHAR(255),
    query_id BIGINT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, confirmed, failed
    executor_reward_ton DECIMAL(20, 9) NOT NULL,
    platform_fee_ton DECIMAL(20, 9) NOT NULL,
    nonce BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    failed_at TIMESTAMP,
    error_message TEXT,
    CONSTRAINT fk_payout_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
    CONSTRAINT unique_task_executor UNIQUE (task_id, executor_address)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_payout_tx_hash ON payout_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payout_status ON payout_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payout_created ON payout_transactions(created_at);

-- Table for payout intents (idempotency)
CREATE TABLE IF NOT EXISTS payout_intents (
    id SERIAL PRIMARY KEY,
    task_id UUID NOT NULL UNIQUE,
    executor_address VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    nonce BIGINT NOT NULL,
    query_id BIGINT,
    executor_reward_ton DECIMAL(20, 9) NOT NULL,
    platform_fee_ton DECIMAL(20, 9) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMP,
    CONSTRAINT fk_intent_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_intent_idempotency ON payout_intents(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_intent_task ON payout_intents(task_id);

-- Add executor_payout_status column to tasks if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'executor_payout_status'
    ) THEN
        ALTER TABLE tasks ADD COLUMN executor_payout_status VARCHAR(50) DEFAULT 'pending';
    END IF;
END $$;

-- Add index for executor_payout_status
CREATE INDEX IF NOT EXISTS idx_tasks_payout_status ON tasks(executor_payout_status);
