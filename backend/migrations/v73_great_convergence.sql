-- Great Convergence: Global Payout ID — unified_device_id for mass transaction integrity

ALTER TABLE settlement_ledger ADD COLUMN IF NOT EXISTS unified_device_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_settlement_ledger_unified_device ON settlement_ledger(unified_device_id) WHERE unified_device_id IS NOT NULL;

COMMENT ON COLUMN settlement_ledger.unified_device_id IS 'Canonical device/node ID (gstd_* or node_id) for payout traceability and deduplication';
