-- Omnipotence Mode: Predictive Allocation, Autonomous Expansion, Golden Age Verification

-- 1. Topic trend tracking (Predictive Resource Allocation)
CREATE TABLE IF NOT EXISTS topic_query_trends (
    id SERIAL PRIMARY KEY,
    topic TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    query_count INT NOT NULL DEFAULT 0,
    growth_rate_pct DECIMAL(8,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topic_trends_topic ON topic_query_trends(topic);
CREATE INDEX IF NOT EXISTS idx_topic_trends_period ON topic_query_trends(period_end DESC);

-- 2. Sub-agents (Autonomous Expansion at IQ 95.0)
CREATE TABLE IF NOT EXISTS sub_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    niche TEXT NOT NULL UNIQUE,
    agent_registry_id UUID REFERENCES agent_registry(id),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    triggered_at_iq DECIMAL(5,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sub_agents_niche ON sub_agents(niche);

-- 3. IQ-Golden correlation (Golden Age Verification)
CREATE TABLE IF NOT EXISTS iq_golden_verification (
    id SERIAL PRIMARY KEY,
    iq DECIMAL(5,2) NOT NULL,
    golden_reserve_xaut DECIMAL(18,8) NOT NULL,
    verified_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_golden_iq ON iq_golden_verification(iq DESC);
INSERT INTO iq_golden_verification (iq, golden_reserve_xaut) SELECT 50, 0 WHERE NOT EXISTS (SELECT 1 FROM iq_golden_verification LIMIT 1);