-- Decentralized Verification: P2P check every 100th task
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS p2p_verified BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tasks_p2p_verified ON tasks(p2p_verified) WHERE p2p_verified = true;
