/**
 * POST /api/v1/sovereign/stake
 * Record intent to stake GSTD. On-chain staking activates after contract deploy.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet, amount } = req.body || {};
    if (!wallet || !amount) return res.status(400).json({ error: 'wallet and amount required' });

    const gstd = parseFloat(amount);
    if (isNaN(gstd) || gstd <= 0) return res.status(400).json({ error: 'Invalid amount' });

    try {
        const key    = `staked:${wallet.toLowerCase()}`;
        const balKey = `balance:${wallet.toLowerCase()}`;
        const [currentRaw, balRaw] = await Promise.all([kvGet(key), kvGet(balKey)]);

        const current = currentRaw ? parseFloat(currentRaw) : 0;
        const balance = balRaw     ? parseFloat(balRaw)     : 0;

        if (balance < gstd) {
            return res.status(400).json({ error: 'Insufficient balance', balance, requested: gstd });
        }

        await Promise.all([
            kvSet(key,    String(current + gstd), 0),
            kvSet(balKey, String(balance  - gstd), 0),
        ]);

        return res.status(200).json({
            ok:           true,
            wallet,
            staked:       gstd,
            total_staked: current + gstd,
            note:         'Stake recorded. On-chain staking activates after contract deployment.',
        });
    } catch (err: any) {
        console.error('[sovereign/stake]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
