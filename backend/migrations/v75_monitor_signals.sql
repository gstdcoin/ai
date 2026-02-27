-- Monitor Signals: Real progress tracking for planetary problems
-- Each signal tracks real sponsorship, compute contribution, and solve progress

CREATE TABLE IF NOT EXISTS monitor_signals (
    signal_id       VARCHAR(64) PRIMARY KEY,
    category        VARCHAR(64) NOT NULL,
    total_sponsored NUMERIC(20,9) DEFAULT 0,       -- Total Stars spent
    total_gstd_allocated NUMERIC(20,9) DEFAULT 0,  -- Total GSTD allocated to workers
    total_gstd_gold NUMERIC(20,9) DEFAULT 0,       -- Total GSTD sent to gold reserve
    sponsor_count   INTEGER DEFAULT 0,              -- Number of unique sponsors
    contributor_count INTEGER DEFAULT 0,            -- Number of compute contributors
    tasks_created   INTEGER DEFAULT 0,              -- Tasks spawned from this signal
    tasks_completed INTEGER DEFAULT 0,              -- Tasks completed
    data_processed_tb NUMERIC(12,4) DEFAULT 0,      -- TB of data actually processed
    progress        INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    last_result     TEXT,                            -- Latest result summary
    last_sponsored_at TIMESTAMP WITH TIME ZONE,
    last_completed_at TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sponsorship log: every sponsorship action is recorded
CREATE TABLE IF NOT EXISTS monitor_sponsorships (
    id              SERIAL PRIMARY KEY,
    signal_id       VARCHAR(64) NOT NULL REFERENCES monitor_signals(signal_id),
    user_id         VARCHAR(128),                   -- Telegram user ID or wallet
    stars_paid      INTEGER NOT NULL DEFAULT 0,
    gstd_reward     NUMERIC(20,9) DEFAULT 0,
    gstd_gold_fee   NUMERIC(20,9) DEFAULT 0,
    task_id         VARCHAR(255),                   -- Reference to tasks table
    status          VARCHAR(32) DEFAULT 'pending',  -- pending, processing, completed, failed
    result_summary  TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_monitor_signals_category ON monitor_signals(category);
CREATE INDEX IF NOT EXISTS idx_monitor_sponsorships_signal ON monitor_sponsorships(signal_id);
CREATE INDEX IF NOT EXISTS idx_monitor_sponsorships_user ON monitor_sponsorships(user_id);

-- Initialize all 30 signals with zero real progress
INSERT INTO monitor_signals (signal_id, category) VALUES
    ('nasa_eosdis', 'Climate'),
    ('wildfire_sentinel', 'Climate'),
    ('copernicus_marine', 'Climate'),
    ('air_quality_mesh', 'Climate'),
    ('carbon_sink', 'Climate'),
    ('who_pubmed', 'Health'),
    ('alphafold_protein', 'Health'),
    ('antibiotic_resistance', 'Health'),
    ('mental_health_nlp', 'Health'),
    ('gdelt_crisis', 'Humanitarian'),
    ('darknet_tracker', 'Humanitarian'),
    ('osm_disaster', 'Humanitarian'),
    ('refugee_flow', 'Humanitarian'),
    ('famine_prediction', 'Food & Water'),
    ('water_stress', 'Food & Water'),
    ('seismic_array', 'Geophysics'),
    ('tsunami_model', 'Geophysics'),
    ('deepfake_firewall', 'Cyber Security'),
    ('critical_infra', 'Cyber Security'),
    ('cern_physics', 'Science & Energy'),
    ('fusion_sim', 'Science & Energy'),
    ('space_debris', 'Science & Energy'),
    ('education_gap', 'Society'),
    ('poverty_mapping', 'Society'),
    ('child_mortality', 'Society'),
    ('financial_contagion', 'Economy'),
    ('corruption_trace', 'Economy'),
    ('biodiversity_loss', 'Biodiversity'),
    ('ocean_plastic', 'Biodiversity')
ON CONFLICT (signal_id) DO NOTHING;
