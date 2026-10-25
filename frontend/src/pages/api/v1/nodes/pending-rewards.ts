/**
 * GET /api/v1/nodes/pending-rewards
 * Pending GSTD rewards for the wallet bound to the caller's session.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const rewardKey = `rewards:pending:${wallet}`;
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
