-- Absolute Point: Atomic Integrity, Audit Trail

-- Audit events for Auto-Bounty and Hardware Grant (prevent double-spend)
CREATE TABLE IF NOT EXISTS audit_treasury_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,  -- auto_bounty_debit, hardware_grant_debit
    reference_id VARCHAR(100) NOT NULL,
    amount_gstd NUMERIC(20,9) NOT NULL,
    balance_before NUMERIC(20,9),
    balance_after NUMERIC(20,9),
    status VARCHAR(20) DEFAULT 'confirmed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(reference_id, event_type)
);
CREATE INDEX IF NOT EXISTS idx_audit_treasury_ref ON audit_treasury_events(reference_id);
CREATE INDEX IF NOT EXISTS idx_audit_treasury_created ON audit_treasury_events(created_at DESC);
