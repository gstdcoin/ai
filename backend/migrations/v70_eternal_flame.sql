-- Eternal Flame: platform_status used for worker_boost, archon alerts
-- (platform_status already exists from v69; this ensures compatibility)
CREATE TABLE IF NOT EXISTS platform_status (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO platform_status (key, value) VALUES ('eternal_flame', 'active')
ON CONFLICT (key) DO UPDATE SET value = 'active', updated_at = NOW();
