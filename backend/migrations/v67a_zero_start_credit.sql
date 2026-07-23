-- Genesis Sync: Reputation Recovery — bonus points for good standing
ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation_bonus INT DEFAULT 0;
UPDATE users SET reputation_bonus = 0 WHERE reputation_bonus IS NULL;
