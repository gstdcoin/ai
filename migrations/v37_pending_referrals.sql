CREATE TABLE IF NOT EXISTS pending_referrals (
    telegram_id BIGINT PRIMARY KEY,
    referral_code VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
