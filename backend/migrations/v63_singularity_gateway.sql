-- Singularity Gateway: Latency Optimization — cache suggestions for nodes when latency > 250ms

CREATE TABLE IF NOT EXISTS knowledge_cache_suggestions (
    id SERIAL PRIMARY KEY,
    consumer_h3_index VARCHAR(16),
    suggested_topics TEXT[] NOT NULL,
    latency_ms INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cache_suggestions_h3 ON knowledge_cache_suggestions(consumer_h3_index);
CREATE INDEX IF NOT EXISTS idx_cache_suggestions_created ON knowledge_cache_suggestions(created_at DESC);

-- IQ Milestone tracking for ticker alerts (single row)
CREATE TABLE IF NOT EXISTS iq_milestone_checkpoint (
    id SERIAL PRIMARY KEY,
    last_iq DECIMAL(5,2) NOT NULL DEFAULT 50,
    last_checked_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO iq_milestone_checkpoint (last_iq) SELECT 50 WHERE NOT EXISTS (SELECT 1 FROM iq_milestone_checkpoint LIMIT 1);
