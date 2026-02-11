-- v24_referral_system.sql
-- Add referral code and referred_by to users (using wallet_address as PK)
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(100) REFERENCES users(wallet_address);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Function to generate random referral code
CREATE OR REPLACE FUNCTION generate_referral_code() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := substring(md5(random()::text) from 1 for 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate referral code on insert
DROP TRIGGER IF EXISTS trg_generate_ref_code ON users;
CREATE TRIGGER trg_generate_ref_code
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION generate_referral_code();

-- Table to track referral rewards
CREATE TABLE IF NOT EXISTS referral_rewards (
    id SERIAL PRIMARY KEY,
    referrer_address VARCHAR(100) REFERENCES users(wallet_address),
    referred_user_address VARCHAR(100) REFERENCES users(wallet_address),
    task_id VARCHAR(64), -- if reward is from a specific task
    amount_gstd NUMERIC(20, 9) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    paid_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_address);
