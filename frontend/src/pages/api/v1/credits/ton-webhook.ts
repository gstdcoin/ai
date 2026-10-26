import type { NextApiRequest, NextApiResponse } from 'next';
/** Preserved ledger entries require reconciliation; this route cannot create or debit token claims. */
export default async function handler(_req: NextApiRequest,res: NextApiResponse) {
    return res.status(410).json({ error: 'legacy_finance_disabled', ledger_version: 2,
        replacement: '/api/v1/finance/reconcile' });
}
