/**
 * POST /api/v1/chat/deduct
 * Deduct GSTD from a wallet for chat inference.
 * Stores pending deduction in Redis; settled on-chain after contract deployment.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet, amount, tier } = req.body || {};
    if (!wallet || !amount) return res.status(400).json({ error: 'wallet and amount required' });

    try {
        const key = `balance:${wallet.toLowerCase()}`;
        const raw = await kvGet(key);
        const current = raw ? parseFloat(raw) : 0;

        const cost = parseFloat(amount) || 0;
        const remaining = Math.max(0, current - cost);

        if (remaining !== current) {
            await kvSet(key, String(remaining), 0);
        }

        const usageKey = `usage:chat:${wallet.toLowerCase()}`;
        const usageRaw = await kvGet(usageKey);
        const totalSpent = (usageRaw ? parseFloat(usageRaw) : 0) + cost;
        await kvSet(usageKey, String(totalSpent), 0);

        return res.status(200).json({
            ok:        true,
            wallet,
            deducted:  cost,
            remaining,
            tier:      tier || 'free',
        });
    } catch (err: any) {
        console.error('[chat/deduct]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
