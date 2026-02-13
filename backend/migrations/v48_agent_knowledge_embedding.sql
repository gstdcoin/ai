-- Add optional embedding column for agent_knowledge (vector search future)
ALTER TABLE agent_knowledge ADD COLUMN IF NOT EXISTS embedding BYTEA;
