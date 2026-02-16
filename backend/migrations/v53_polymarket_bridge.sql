-- Migration v53: Polymarket Bridge — события в задачи, критерии результата, награды, комиссия золото/фонд
-- Purpose: Crowdsourced prediction tasks from Polymarket events

-- Pool for Polymarket tasks (allocate tokens for tasks)
INSERT INTO platform_funds (fund_type, balance_gstd) 
VALUES ('polymarket_pool', 0)
ON CONFLICT (fund_type) DO NOTHING;

-- Polymarket event → task mapping + aggregation
CREATE TABLE IF NOT EXISTS polymarket_bridge_tasks (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(128) NOT NULL UNIQUE,
    event_id VARCHAR(128) NOT NULL,
    event_title TEXT,
    question TEXT NOT NULL,
    task_id VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',  -- pending, collecting, analyzed, paid, expired
    yes_pct_at_create DECIMAL(10, 4),
    consensus_prediction VARCHAR(10),    -- yes, no (after aggregation)
    consensus_confidence DECIMAL(5, 4),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    analyzed_at TIMESTAMP,
    UNIQUE(market_id)
);

CREATE INDEX IF NOT EXISTS idx_polymarket_bridge_task ON polymarket_bridge_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_polymarket_bridge_status ON polymarket_bridge_tasks(status);
CREATE INDEX IF NOT EXISTS idx_polymarket_bridge_market ON polymarket_bridge_tasks(market_id);

-- Result criteria: prediction format
COMMENT ON TABLE polymarket_bridge_tasks IS 'Polymarket events as crowdsourced prediction tasks. Result: {prediction: yes|no, confidence: 0-1, reasoning: string}';
