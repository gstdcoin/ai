/**
 * GET /api/v1/nodes/pending-rewards?wallet=<address>
 * Pending GSTD rewards for a wallet address.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.query;
    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'wallet query param required' });
    }

    try {
        const rewardKey = `rewards:pending:${wallet.toLowerCase()}`;
        const raw = await kvGet(rewardKey);
        const pending = raw ? parseFloat(raw) : 0;

        return res.status(200).json({
            wallet,
            pending_gstd:  pending,
            claimable:     pending > 0,
            note:          pending === 0 ? 'Rewards accumulate as your node completes tasks.' : null,
            timestamp:     Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/pending-rewards]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
