-- Migration v18: Performance Indexes
-- Purpose: Add missing indexes for optimal query performance
-- Date: 2026-01-11

-- Tasks table indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_requester_status ON tasks(requester_address, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_device ON tasks(assigned_device) WHERE assigned_device IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_escrow_status ON tasks(escrow_status) WHERE escrow_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_executor_payout_status ON tasks(executor_payout_status) WHERE executor_payout_status IS NOT NULL;

-- Devices table indexes
CREATE INDEX IF NOT EXISTS idx_devices_wallet_active ON devices(wallet_address, is_active);
CREATE INDEX IF NOT EXISTS idx_devices_reputation_active ON devices(reputation DESC, is_active) WHERE is_active = true;

-- Validations table indexes (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'validations') THEN
        -- Check if columns exist before creating indexes
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'validations' AND column_name = 'task_id') THEN
            CREATE INDEX IF NOT EXISTS idx_validations_task ON validations(task_id);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'validations' AND column_name = 'status') THEN
            CREATE INDEX IF NOT EXISTS idx_validations_status ON validations(status);
        END IF;
    END IF;
END $$;

-- Task assignments indexes (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_assignments') THEN
        CREATE INDEX IF NOT EXISTS idx_task_assignments_task_device ON task_assignments(task_id, device_id);
        CREATE INDEX IF NOT EXISTS idx_task_assignments_status ON task_assignments(status);
    END IF;
END $$;

-- Payout transactions indexes (if exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payout_transactions') THEN
        CREATE INDEX IF NOT EXISTS idx_payout_transactions_task ON payout_transactions(task_id);
        CREATE INDEX IF NOT EXISTS idx_payout_transactions_status ON payout_transactions(status);
        CREATE INDEX IF NOT EXISTS idx_payout_transactions_executor ON payout_transactions(executor_address);
    END IF;
END $$;

-- Analyze tables for query optimization
ANALYZE tasks;
ANALYZE devices;
ANALYZE nodes;
ANALYZE golden_reserve_log;
