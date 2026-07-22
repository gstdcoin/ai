/**
 * POST /api/v1/settlement/clear
 *
 * Called by settle-rewards.ts after on-chain settlement to zero out pending balances.
 * Admin-only (requires TREASURY_SECRET header).
 *
 * Body: { wallets: string[], epoch_id: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSettledRewards } from '../../../../lib/rewards';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = req.headers['x-admin-secret'] || req.query.secret;
    const expectedSecret = process.env.TREASURY_SECRET || '';
    if (!expectedSecret || secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const body: any = req.body;
        const wallets: string[] = body.wallets || [];
        const epochId: string   = body.epoch_id || `epoch_${Date.now()}`;

        if (!wallets.length) {
            return res.status(400).json({ error: 'wallets array required' });
        }

        await clearSettledRewards(wallets, epochId);

        return res.status(200).json({
            ok:        true,
            cleared:   wallets.length,
            epoch_id:  epochId,
        });
    } catch (err: any) {
        console.error('[settlement/clear]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
