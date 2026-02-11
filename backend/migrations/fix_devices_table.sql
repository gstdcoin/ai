-- Migration: Fix devices table structure
-- Purpose: Guaranteed creation of devices table with all required fields from Go models
-- Date: 2026-01-12

-- Drop table if exists (for clean recreation)
-- WARNING: This will delete all data! Use only for development or if table is empty
-- DROP TABLE IF EXISTS devices CASCADE;

-- Create devices table with all fields from Go models and migrations
CREATE TABLE IF NOT EXISTS devices (
    device_id VARCHAR(255) PRIMARY KEY,
    wallet_address VARCHAR(100) NOT NULL,  -- Increased from VARCHAR(48) per v14 migration
    device_type VARCHAR(20) NOT NULL,
    reputation DECIMAL(5, 4) NOT NULL DEFAULT 0.5,
    total_tasks INTEGER NOT NULL DEFAULT 0,
    successful_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks INTEGER NOT NULL DEFAULT 0,
    total_energy_consumed INTEGER NOT NULL DEFAULT 0,
    average_response_time_ms INTEGER NOT NULL DEFAULT 0,
    cached_models TEXT[],
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    slashing_count INTEGER NOT NULL DEFAULT 0,
    -- Additional fields from v2_enterprise_updates migration
    trust_score DECIMAL(5, 4) DEFAULT 0.1,
    region VARCHAR(10) DEFAULT 'unknown',
    latency_fingerprint INTEGER DEFAULT 0,
    -- Additional fields from v3_global_layer migration
    accuracy_score DECIMAL(5, 4) DEFAULT 0.5,
    latency_score DECIMAL(5, 4) DEFAULT 0.5,
    stability_score DECIMAL(5, 4) DEFAULT 0.5,
    last_reputation_update TIMESTAMP
);

-- Remove UNIQUE constraint from wallet_address if it exists (per add_new_fields.sql)
-- This allows multiple devices per wallet
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'devices_wallet_address_key'
    ) THEN
        ALTER TABLE devices DROP CONSTRAINT devices_wallet_address_key;
    END IF;
END $$;

-- Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_devices_reputation ON devices(reputation DESC);
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active, reputation DESC);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_devices_wallet_address ON devices(wallet_address);
CREATE INDEX IF NOT EXISTS idx_devices_trust_region ON devices(trust_score DESC, region);
CREATE INDEX IF NOT EXISTS idx_devices_wallet_active ON devices(wallet_address, is_active);
CREATE INDEX IF NOT EXISTS idx_devices_reputation_active ON devices(reputation DESC, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_devices_vector ON devices(accuracy_score DESC, latency_score DESC, stability_score DESC);

-- Add comments for documentation
COMMENT ON TABLE devices IS 'Registered computing devices (workers)';
COMMENT ON COLUMN devices.device_id IS 'Unique device fingerprint/identifier';
COMMENT ON COLUMN devices.wallet_address IS 'Wallet address associated with device (multiple devices per wallet allowed)';
COMMENT ON COLUMN devices.reputation IS 'Device reputation score (0.0 to 1.0)';
COMMENT ON COLUMN devices.trust_score IS 'Device trust score for enterprise features (0.0 to 1.0)';
COMMENT ON COLUMN devices.last_seen_at IS 'Last time device was seen/active';
COMMENT ON COLUMN devices.is_active IS 'Whether device is currently active';
