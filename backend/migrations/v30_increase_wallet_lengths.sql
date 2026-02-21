-- Migration v30: Increase wallet address column lengths
-- Purpose: Support raw TON addresses (66 chars) and avoid 'value too long' errors
-- Date: 2026-01-19

ALTER TABLE golden_reserve_log ALTER COLUMN treasury_wallet TYPE VARCHAR(128);
ALTER TABLE topology_metrics ALTER COLUMN wallet_address TYPE VARCHAR(128);
ALTER TABLE withdrawal_locks ALTER COLUMN worker_wallet TYPE VARCHAR(128);
ALTER TABLE withdrawal_locks ALTER COLUMN approved_by TYPE VARCHAR(128);
ALTER TABLE telemetry_rate_limits ALTER COLUMN wallet_address TYPE VARCHAR(128);
ALTER TABLE task_escrow ALTER COLUMN creator_wallet TYPE VARCHAR(128);
ALTER TABLE transaction_history ALTER COLUMN from_wallet TYPE VARCHAR(128);
ALTER TABLE transaction_history ALTER COLUMN to_wallet TYPE VARCHAR(128);
ALTER TABLE worker_ratings ALTER COLUMN worker_wallet TYPE VARCHAR(128);
ALTER TABLE worker_task_assignments ALTER COLUMN worker_wallet TYPE VARCHAR(128);
ALTER TABLE pow_audit_log ALTER COLUMN worker_wallet TYPE VARCHAR(128);
ALTER TABLE tasks ALTER COLUMN creator_wallet TYPE VARCHAR(128);
