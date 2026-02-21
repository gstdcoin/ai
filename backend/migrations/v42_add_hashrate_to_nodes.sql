ALTER TABLE nodes ADD COLUMN IF NOT EXISTS current_hashrate double precision DEFAULT 0;
COMMENT ON COLUMN nodes.current_hashrate IS 'Real-time hashrate of the node (PFLOPS or similar unit)';
