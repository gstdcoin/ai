-- ============================================================================
-- GSTD PLATFORM UPGRADE: Marketplace & Growth System
-- Version: 2.0
-- Date: 2026-02-07
-- ============================================================================

-- ============================================================================
-- 1. ENHANCED USERS TABLE (add referral levels and bonus tracking)
-- ============================================================================

-- Add columns for multi-level referral system
ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_level_1 VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_level_2 VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_level_3 VARCHAR(100);

-- Add columns for bonus tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_bonus_claimed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_bootstrapped BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_faucet_claim TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reserved_balance DECIMAL(18,6) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS source VARCHAR(50); -- telegram, web, agent, api

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_referrer_l1 ON users(referrer_level_1);
CREATE INDEX IF NOT EXISTS idx_users_referrer_l2 ON users(referrer_level_2);
CREATE INDEX IF NOT EXISTS idx_users_referrer_l3 ON users(referrer_level_3);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- ============================================================================
-- 2. ENHANCED REFERRAL_REWARDS TABLE (add levels)
-- ============================================================================

ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_referral_rewards_level ON referral_rewards(level);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);

-- ============================================================================
-- 3. BONUS TRANSACTIONS TABLE (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bonus_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(100) NOT NULL,
    bonus_type VARCHAR(50) NOT NULL, -- welcome_bonus, daily_faucet, agent_bootstrap, referral_signup
    amount DECIMAL(18,6) NOT NULL,
    source VARCHAR(100), -- where the bonus came from
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonus_transactions_wallet ON bonus_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_type ON bonus_transactions(bonus_type);

-- ============================================================================
-- 4. TOKEN BURNS TABLE (deflationary tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_burns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- task_payment, marketplace_fee, transfer
    original_amount DECIMAL(18,6) NOT NULL,
    burn_amount DECIMAL(18,6) NOT NULL,
    burn_address VARCHAR(100) NOT NULL,
    source_wallet VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_burns_created ON token_burns(created_at);
CREATE INDEX IF NOT EXISTS idx_token_burns_type ON token_burns(transaction_type);

-- Running totals for quick access
CREATE TABLE IF NOT EXISTS burn_totals (
    id INT PRIMARY KEY DEFAULT 1,
    total_burned DECIMAL(18,6) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

INSERT INTO burn_totals (id, total_burned) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. AGENT REGISTRY TABLE (marketplace)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_wallet VARCHAR(100) NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT,
    capabilities JSONB DEFAULT '[]',
    pricing_model VARCHAR(20) DEFAULT 'per_task', -- per_task, hourly, subscription
    price_gstd DECIMAL(18,6) NOT NULL,
    trust_score DECIMAL(5,4) DEFAULT 0.5,
    total_rentals INT DEFAULT 0,
    total_earnings DECIMAL(18,6) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_registry_owner ON agent_registry(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_agent_registry_active ON agent_registry(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_registry_trust ON agent_registry(trust_score);
CREATE INDEX IF NOT EXISTS idx_agent_registry_price ON agent_registry(price_gstd);

-- ============================================================================
-- 6. AGENT RENTALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_rentals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agent_registry(id),
    renter_wallet VARCHAR(100) NOT NULL,
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active', -- active, completed, cancelled
    pricing_model VARCHAR(20),
    price_per_unit DECIMAL(18,6),
    estimated_cost DECIMAL(18,6),
    total_cost_gstd DECIMAL(18,6) DEFAULT 0,
    tasks_executed INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agent_rentals_agent ON agent_rentals(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_rentals_renter ON agent_rentals(renter_wallet);
CREATE INDEX IF NOT EXISTS idx_agent_rentals_status ON agent_rentals(status);

-- ============================================================================
-- 7. AGENT REVIEWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agent_registry(id),
    reviewer_wallet VARCHAR(100) NOT NULL,
    rating DECIMAL(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id, reviewer_wallet)
);

CREATE INDEX IF NOT EXISTS idx_agent_reviews_agent ON agent_reviews(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_rating ON agent_reviews(rating);

-- ============================================================================
-- 8. WORKER RATINGS TABLE (enhanced gamification)
-- ============================================================================

ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT 'Bronze';
ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '[]';
ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS daily_streak INT DEFAULT 0;
ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS last_active_date DATE;

CREATE INDEX IF NOT EXISTS idx_worker_ratings_xp ON worker_ratings(xp);
CREATE INDEX IF NOT EXISTS idx_worker_ratings_level ON worker_ratings(level);

-- ============================================================================
-- 9. TELEGRAM USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(100),
    telegram_first_name VARCHAR(100),
    wallet_address VARCHAR(100),
    is_premium BOOLEAN DEFAULT false,
    language_code VARCHAR(10) DEFAULT 'en',
    referral_code_used VARCHAR(20),
    first_seen_at TIMESTAMP DEFAULT NOW(),
    last_activity_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_users_tg_id ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_wallet ON telegram_users(wallet_address);

-- ============================================================================
-- 10. ACHIEVEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10), -- emoji
    xp_reward INT DEFAULT 0,
    gstd_reward DECIMAL(18,6) DEFAULT 0,
    requirement JSONB -- {"type": "tasks_completed", "value": 100}
);

-- Insert default achievements
INSERT INTO achievements (id, name, description, icon, xp_reward, gstd_reward, requirement) VALUES
    ('first_task', 'First Steps', 'Complete your first task', '🎯', 50, 0.1, '{"type": "tasks_completed", "value": 1}'),
    ('10_tasks', 'Getting Started', 'Complete 10 tasks', '⭐', 100, 0.5, '{"type": "tasks_completed", "value": 10}'),
    ('100_tasks', 'Task Master', 'Complete 100 tasks', '🏆', 500, 2.0, '{"type": "tasks_completed", "value": 100}'),
    ('1000_tasks', 'Legend', 'Complete 1000 tasks', '👑', 2000, 10.0, '{"type": "tasks_completed", "value": 1000}'),
    ('first_referral', 'Networker', 'Invite your first friend', '🤝', 100, 1.0, '{"type": "referrals", "value": 1}'),
    ('10_referrals', 'Influencer', 'Invite 10 friends', '🌟', 500, 5.0, '{"type": "referrals", "value": 10}'),
    ('week_streak', 'Consistent', '7-day activity streak', '🔥', 200, 1.0, '{"type": "streak", "value": 7}'),
    ('month_streak', 'Dedicated', '30-day activity streak', '💎', 1000, 5.0, '{"type": "streak", "value": 30}'),
    ('marketplace_seller', 'Entrepreneur', 'List an agent for rent', '🤖', 200, 1.0, '{"type": "agents_listed", "value": 1}'),
    ('marketplace_buyer', 'Customer', 'Rent an agent', '🛒', 100, 0.5, '{"type": "agents_rented", "value": 1}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. USER ACHIEVEMENTS (many-to-many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(100) NOT NULL,
    achievement_id VARCHAR(50) REFERENCES achievements(id),
    earned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(wallet_address, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_wallet ON user_achievements(wallet_address);

-- ============================================================================
-- 12. PLATFORM STATISTICS (for dashboard)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_stats (
    id INT PRIMARY KEY DEFAULT 1,
    total_users INT DEFAULT 0,
    total_agents INT DEFAULT 0,
    total_tasks INT DEFAULT 0,
    total_volume_gstd DECIMAL(18,6) DEFAULT 0,
    total_burned_gstd DECIMAL(18,6) DEFAULT 0,
    active_rentals INT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW()
);

INSERT INTO platform_stats (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 13. FUNCTION: Update platform stats
-- ============================================================================

CREATE OR REPLACE FUNCTION update_platform_stats() RETURNS void AS $$
BEGIN
    UPDATE platform_stats SET
        total_users = (SELECT COUNT(*) FROM users),
        total_agents = (SELECT COUNT(*) FROM agent_registry WHERE is_active = true),
        total_tasks = (SELECT COUNT(*) FROM tasks),
        total_volume_gstd = (SELECT COALESCE(SUM(labor_compensation_gstd), 0) FROM tasks WHERE status = 'completed'),
        total_burned_gstd = (SELECT COALESCE(SUM(burn_amount), 0) FROM token_burns),
        active_rentals = (SELECT COUNT(*) FROM agent_rentals WHERE status = 'active'),
        last_updated = NOW()
    WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMPLETED! Run with: psql -f migrations/002_marketplace_growth.sql
-- ============================================================================
