-- Migration v34: Add geo-fencing columns to nodes table
ALTER TABLE nodes 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS is_spoofing BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for spoofing checks
CREATE INDEX IF NOT EXISTS idx_nodes_is_spoofing ON nodes(is_spoofing);

-- Add comments
COMMENT ON COLUMN nodes.latitude IS 'Last reported GPS latitude.';
COMMENT ON COLUMN nodes.longitude IS 'Last reported GPS longitude.';
COMMENT ON COLUMN nodes.is_spoofing IS 'Flag indicating if GPS spoofing was detected (speed > 1000 km/h).';
