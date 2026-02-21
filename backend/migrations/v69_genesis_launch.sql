-- Genesis Launch: Viral Loop Analytics + Community Favorite
-- Tracks share link clicks per model for "Community Favorite" badge
CREATE TABLE IF NOT EXISTS viral_shares (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(64) NOT NULL,
    share_count INT DEFAULT 0,
    click_count INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(model_id)
);
CREATE INDEX IF NOT EXISTS idx_viral_shares_model ON viral_shares(model_id);
CREATE INDEX IF NOT EXISTS idx_viral_shares_clicks ON viral_shares(click_count DESC);

-- Platform status for Genesis Launch
CREATE TABLE IF NOT EXISTS platform_status (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO platform_status (key, value) VALUES ('genesis_launch', 'active')
ON CONFLICT (key) DO UPDATE SET value = 'active', updated_at = NOW();
