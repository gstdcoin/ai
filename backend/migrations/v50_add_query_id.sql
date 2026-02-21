-- Migration v50: Add query_id and nonce to payout_transactions (PaymentTracker fix)
-- Fixes: pq: column "query_id" does not exist (error 42703)

-- Add query_id if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payout_transactions' AND column_name = 'query_id'
    ) THEN
        ALTER TABLE payout_transactions ADD COLUMN query_id BIGINT;
    END IF;
END $$;

-- Add nonce if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payout_transactions' AND column_name = 'nonce'
    ) THEN
        ALTER TABLE payout_transactions ADD COLUMN nonce BIGINT DEFAULT 0;
    END IF;
END $$;

-- Add failed_at if missing (for markTransactionFailedAndRefund)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payout_transactions' AND column_name = 'failed_at'
    ) THEN
        ALTER TABLE payout_transactions ADD COLUMN failed_at TIMESTAMP;
    END IF;
END $$;

-- Index for query_id (reconciliation speed)
CREATE INDEX IF NOT EXISTS idx_payout_transactions_query_id ON payout_transactions(query_id) WHERE query_id IS NOT NULL;
