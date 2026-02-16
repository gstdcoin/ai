-- Singularity Ready: Immortal Identity (constitution hash), Global Equilibrium, Archon Protocol

ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS constitution_hash VARCHAR(64);
ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(128);
ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS anchored_chain VARCHAR(16);
