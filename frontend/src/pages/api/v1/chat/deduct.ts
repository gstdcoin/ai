/**
 * POST /api/v1/chat/deduct
 * Deduct GSTD from the caller's own wallet for chat inference.
 * Stores pending deduction in Redis; settled on-chain after contract deployment.
 *
 * The wallet is resolved from the X-Session-Token header (issued by
 * POST /api/v1/users/login) rather than trusted from the request body --
 * this previously accepted an arbitrary `wallet` field with no auth at all,
 * letting anyone zero out any wallet's balance by naming it directly.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

const MAX_DEDUCT_GSTD = 10; // generous headroom over the highest real tier cost (0.50 GSTD)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (!sessionToken) return res.status(401).json({ error: 'Not authenticated' });

    const walletKey = await kvGet(`session:${sessionToken}`).catch(() => null);
    if (!walletKey) return res.status(401).json({ error: 'Session expired' });

    const { amount, tier } = req.body || {};
    const cost = parseFloat(amount);
    if (!cost || cost <= 0 || cost > MAX_DEDUCT_GSTD) {
        return res.status(400).json({ error: `amount must be a positive number up to ${MAX_DEDUCT_GSTD}` });
    }

    try {
        const key = `balance:${walletKey}`;
        const raw = await kvGet(key);
        const current = raw ? parseFloat(raw) : 0;

        if (current < cost) {
            return res.status(402).json({ error: 'Insufficient balance', balance: current, required: cost });
        }

        const remaining = current - cost;
        await Promise.all([
            kvSet(key, String(remaining), 0),
            (async () => {
                const usageKey = `usage:chat:${walletKey}`;
                const usageRaw = await kvGet(usageKey);
                const totalSpent = (usageRaw ? parseFloat(usageRaw) : 0) + cost;
                await kvSet(usageKey, String(totalSpent), 0);
            })(),
        ]);

        return res.status(200).json({
            ok:        true,
            wallet:    walletKey,
            deducted:  cost,
            remaining,
            tier:      tier || 'free',
        });
    } catch (err: any) {
        console.error('[chat/deduct]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
