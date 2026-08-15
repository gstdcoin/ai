/**
 * POST /api/v1/nodes/rewards/confirm-settlement
 *
 * Clears pending balances ONLY for wallets whose on-chain transfer actually
 * succeeded. Split out from /settle so that clearing never happens before
 * (or regardless of) transfer success -- see settle.ts's comment for the
 * failure mode this prevents.
 *
 * Auth: TREASURY_SECRET header, same as /settle.
 *
 * Request body: { epoch: string; wallets: string[] }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSettledRewards } from '../../../../../lib/rewards';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = process.env.TREASURY_SECRET || '';
    const auth   = req.headers['x-treasury-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!secret || auth !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { epoch, wallets } = req.body as { epoch?: string; wallets?: string[] };
    if (!epoch || !Array.isArray(wallets)) {
        return res.status(400).json({ error: 'epoch and wallets[] required' });
    }
    if (wallets.length === 0) {
        return res.status(200).json({ ok: true, cleared: 0 });
    }

    await clearSettledRewards(wallets, epoch);

    return res.status(200).json({ ok: true, cleared: wallets.length });
}
