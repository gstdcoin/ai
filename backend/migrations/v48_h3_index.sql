-- Migration v48: Add H3 index for node location (Data Airlock phase)
-- H3 Resolution 6: ~36 km² per cell, suitable for node presence

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS h3_index VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_nodes_h3_index ON nodes(h3_index) WHERE h3_index IS NOT NULL;

COMMENT ON COLUMN nodes.h3_index IS 'H3 hexagonal index at Resolution 6 for geospatial queries';
