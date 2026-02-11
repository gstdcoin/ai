-- Migration v35_eco_label_and_traffic.sql

-- 1. Add eco_certified label to nodes
ALTER TABLE nodes 
ADD COLUMN IF NOT EXISTS eco_certified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add traffic tracking for Egress-Free Logic
-- We track traffic but do NOT charge for it (egress_used_bytes)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS egress_used_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_data_transfer_free BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN nodes.eco_certified IS 'True if node uses renewable energy or idle hardware (Consumer DePIN).';
COMMENT ON COLUMN tasks.is_data_transfer_free IS 'Always TRUE. GSTD does not charge for egress traffic.';
