-- Pending Balances (Off-chain Ledger)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_balance_gstd DECIMAL(20, 9) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255); -- Wallet address of upline

-- Referral Graph (Who invited whom)
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer VARCHAR(255) NOT NULL, -- Upline
    referee VARCHAR(255) NOT NULL UNIQUE, -- Downline (New user)
    level INTEGER DEFAULT 1, -- 1, 2, 3
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Earnings History (Transparency)
CREATE TABLE IF NOT EXISTS earnings_history (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(255) NOT NULL,
    amount_gstd DECIMAL(20, 9) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'task', 'referral_bonus', 'mining'
    reference_id VARCHAR(255), -- task_id or referee_wallet
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for speed
CREATE INDEX idx_referrals_referrer ON referrals(referrer);
CREATE INDEX idx_earnings_wallet ON earnings_history(wallet_address);
