/**
 * Settlement confirmation is disabled until payouts are reserved atomically
 * and backed by independently verified on-chain transfer receipts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    return res.status(410).json({
        error: 'settlement_confirmation_disabled',
        message: 'Balances cannot be cleared until payout reservations and on-chain receipt verification are implemented.',
    });
}
