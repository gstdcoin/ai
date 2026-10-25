/**
 * Legacy balance-clearing route. Disabled until settlement is atomic and
 * transfer receipts can be independently verified.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    return res.status(410).json({
        error: 'settlement_confirmation_disabled',
        message: 'Balances cannot be cleared until payout reservations and on-chain receipt verification are implemented.',
    });
}
