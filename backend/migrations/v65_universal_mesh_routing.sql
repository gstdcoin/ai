-- UniversalMesh_Routing: Knowledge Cross-Link — model capabilities vs leaders
-- Knowledge_Integrator updates this when absorbing new models

CREATE TABLE IF NOT EXISTS universal_mesh_routing (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(128) NOT NULL UNIQUE,
    platform_preference VARCHAR(32) NOT NULL DEFAULT 'server',
    capability_score DECIMAL(10,4) NOT NULL DEFAULT 0,
    rank INT NOT NULL DEFAULT 0,
    source_hf VARCHAR(256),
    license VARCHAR(64),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_universal_mesh_routing_model ON universal_mesh_routing(model_id);
CREATE INDEX IF NOT EXISTS idx_universal_mesh_routing_rank ON universal_mesh_routing(rank DESC);
