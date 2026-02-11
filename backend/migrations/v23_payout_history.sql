-- Migration v23: Payout History Table for Successful Transactions Logging
-- This table logs all successful payout transactions for audit and analytics

CREATE TABLE IF NOT EXISTS payout_history (
    id SERIAL PRIMARY KEY,
    payout_transaction_id INTEGER NOT NULL,
    task_id VARCHAR(255) NOT NULL,
    executor_address VARCHAR(255) NOT NULL,
    tx_hash VARCHAR(255) NOT NULL,
    query_id BIGINT,
    executor_reward_ton DECIMAL(20, 9) NOT NULL,
    platform_fee_ton DECIMAL(20, 9) NOT NULL,
    nonce BIGINT NOT NULL,
    confirmed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_payout_history_transaction FOREIGN KEY (payout_transaction_id) REFERENCES payout_transactions(id) ON DELETE CASCADE,
    CONSTRAINT fk_payout_history_task FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_payout_history_tx_hash ON payout_history(tx_hash);
CREATE INDEX IF NOT EXISTS idx_payout_history_executor ON payout_history(executor_address);
CREATE INDEX IF NOT EXISTS idx_payout_history_task ON payout_history(task_id);
CREATE INDEX IF NOT EXISTS idx_payout_history_confirmed ON payout_history(confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_history_transaction_id ON payout_history(payout_transaction_id);

-- Add comment
COMMENT ON TABLE payout_history IS 'Log of all successful payout transactions for audit and analytics';
COMMENT ON COLUMN payout_history.payout_transaction_id IS 'Reference to payout_transactions table';
COMMENT ON COLUMN payout_history.confirmed_at IS 'When the transaction was confirmed on blockchain';
