/**
 * POST /api/v1/nodes/claim-rewards
 * Claim pending GSTD rewards. Will process on-chain after contract deployment.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    try {
        const rewardKey = `rewards:pending:${wallet.toLowerCase()}`;
        const raw = await kvGet(rewardKey);
        const pending = raw ? parseFloat(raw) : 0;

        if (pending === 0) {
            return res.status(200).json({ ok: false, reason: 'No pending rewards', pending_gstd: 0 });
        }

        return res.status(200).json({
            ok:      false,
            reason:  'Claims process on-chain after TON smart contract deployment.',
            pending_gstd: pending,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/claim-rewards]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
