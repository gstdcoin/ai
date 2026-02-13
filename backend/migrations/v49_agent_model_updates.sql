-- Migration v49: Agent model updates (LoRA adapters) - Collective Evolution
CREATE TABLE IF NOT EXISTS agent_model_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    weights_url TEXT NOT NULL,
    metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_model_updates_agent ON agent_model_updates(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_model_updates_created ON agent_model_updates(created_at DESC);
