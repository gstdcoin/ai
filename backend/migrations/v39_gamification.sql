-- v39_gamification.sql
-- Add level and XP to worker_ratings
ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS level VARCHAR(20) DEFAULT 'Bronze';
ALTER TABLE worker_ratings ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;

-- Create index for leaderboard
CREATE INDEX IF NOT EXISTS idx_worker_level ON worker_ratings(level);
CREATE INDEX IF NOT EXISTS idx_worker_xp ON worker_ratings(xp DESC);

-- Add cpu_score and ram_score to devices for AI orchestration
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_score INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ram_gb DECIMAL(5, 2) DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS orchestration_score DECIMAL(10, 4) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_device_orchestration ON devices(orchestration_score DESC);
