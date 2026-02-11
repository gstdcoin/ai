-- Migration v22: Add trust_score and country to nodes table for reputation system
-- Trust score starts at 1.0 and decreases when validation fails
-- Country is determined by IP geolocation

ALTER TABLE nodes 
ADD COLUMN IF NOT EXISTS trust_score FLOAT NOT NULL DEFAULT 1.0;

ALTER TABLE nodes
ADD COLUMN IF NOT EXISTS country VARCHAR(2); -- ISO 3166-1 alpha-2 country code

-- Create index for trust_score queries
CREATE INDEX IF NOT EXISTS idx_nodes_trust_score ON nodes(trust_score DESC);

-- Create index for country queries
CREATE INDEX IF NOT EXISTS idx_nodes_country ON nodes(country);

-- Add comments
COMMENT ON COLUMN nodes.trust_score IS 'Reputation score (0.0-1.0). Default 1.0. Decreases on validation failures.';
COMMENT ON COLUMN nodes.country IS 'ISO 3166-1 alpha-2 country code determined by IP geolocation.';
