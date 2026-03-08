-- Hybrid Intelligence Router: Cocoon TON revenue tracking & distribution
-- Revenue split: 80% → Treasury (Gold Reserve), 20% → Swarm Rewards (GSTD emission)

CREATE TABLE IF NOT EXISTS cocoon_revenue (
    id                  SERIAL PRIMARY KEY,
    ton_earned          NUMERIC(20, 8) NOT NULL DEFAULT 0,
    treasury_share      NUMERIC(20, 8) NOT NULL DEFAULT 0,  -- 80%
    swarm_share         NUMERIC(20, 8) NOT NULL DEFAULT 0,  -- 20%
    model_served        TEXT NOT NULL DEFAULT '',
    participating_nodes INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cocoon_revenue_created ON cocoon_revenue(created_at);

-- Routing decision audit log (optional, for analytics)
CREATE TABLE IF NOT EXISTS hybrid_routing_log (
    id              SERIAL PRIMARY KEY,
    tier            TEXT NOT NULL,        -- 'swarm', 'cocoon', 'ollama'
    complexity      INTEGER NOT NULL,     -- 0=light, 1=medium, 2=heavy
    reason          TEXT,
    estimated_cost  NUMERIC(12, 6),
    actual_cost     NUMERIC(12, 6),
    latency_ms      INTEGER,
    wallet_address  TEXT,
    model           TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hybrid_routing_created ON hybrid_routing_log(created_at);
CREATE INDEX IF NOT EXISTS idx_hybrid_routing_tier ON hybrid_routing_log(tier);
