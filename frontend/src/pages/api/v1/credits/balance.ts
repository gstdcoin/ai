/**
 * GET /api/v1/credits/balance?wallet=EQ...
 * Returns the GSTD credit balance and pending node rewards for a wallet.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const wallet = (req.query.wallet as string || '').trim().toLowerCase();
    if (!wallet) return res.status(400).json({ error: 'wallet query param required' });

    const [balRaw, pendingRaw] = await Promise.all([
        kvGet(`balance:${wallet}`),
        kvGet(`rewards:pending:${wallet}`),
    ]);

    const balance         = parseFloat(balRaw  || '0');
    const pending_rewards = parseFloat(pendingRaw || '0');

    // Daily free usage
    const today = new Date().toISOString().slice(0, 10);
    const freeUsedRaw = await kvGet(`usage:free:${wallet}:${today}`);
    const free_used    = parseInt(freeUsedRaw || '0', 10);
    const free_remaining = Math.max(0, 50 - free_used);

    return res.status(200).json({
        wallet,
        balance_gstd: balance,
        pending_rewards_gstd: pending_rewards,
        free_requests_today: free_used,
        free_requests_remaining: free_remaining,
        currency: 'GSTD',
    });
}
