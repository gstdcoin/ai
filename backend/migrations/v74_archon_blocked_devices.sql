-- Sovereign Dawn: Archon Health Check — block unified_device_id on collision

CREATE TABLE IF NOT EXISTS archon_blocked_devices (
    unified_device_id VARCHAR(128) PRIMARY KEY,
    reason VARCHAR(255) NOT NULL DEFAULT 'collision',
    blocked_at TIMESTAMP DEFAULT NOW(),
    worker_wallets TEXT[]  -- wallets involved in collision
);

CREATE INDEX IF NOT EXISTS idx_archon_blocked_at ON archon_blocked_devices(blocked_at);

COMMENT ON TABLE archon_blocked_devices IS 'Sovereign Dawn: Blocked device IDs on unified_device_id collision (Leviathan safety)';
