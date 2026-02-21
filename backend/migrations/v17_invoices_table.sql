-- Migration: Add Invoices table for Agent-to-Agent settlement
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer_address VARCHAR(255) NOT NULL,
    payer_address VARCHAR(255) NOT NULL,
    amount_gstd NUMERIC(20, 9) NOT NULL,
    description TEXT,
    task_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'unpaid' NOT NULL, -- unpaid, paid, cancelled, expired
    payment_tx_hash VARCHAR(255),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_invoices_payer ON public.invoices(payer_address);
CREATE INDEX IF NOT EXISTS idx_invoices_issuer ON public.invoices(issuer_address);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
