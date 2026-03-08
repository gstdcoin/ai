-- Ensure nightly_audits exists (used by StatsService and nightly_audit binary)
CREATE TABLE IF NOT EXISTS nightly_audits (
    audit_date DATE PRIMARY KEY,
    total_supply_gstd NUMERIC,
    reserve_xaut NUMERIC,
    reserve_value_usd NUMERIC,
    backing_ratio_percent NUMERIC,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
