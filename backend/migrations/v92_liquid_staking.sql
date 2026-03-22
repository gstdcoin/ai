-- v92_liquid_staking.sql
-- Add Liquid Staking token tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS stgstd_balance NUMERIC(20,9) DEFAULT 0;
