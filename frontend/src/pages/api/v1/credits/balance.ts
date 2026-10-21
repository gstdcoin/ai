/**
 * GET /api/v1/credits/balance?wallet=EQ...
 * Requires a verified TON wallet session; an optional wallet query must match it.
 * Returns the GSTD credit balance and pending node rewards for that wallet.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Verified wallet session required' });

    const requestedWallet = req.query.wallet;
    if (requestedWallet !== undefined) {
        if (typeof requestedWallet !== 'string' || !requestedWallet.trim()) {
            return res.status(400).json({ error: 'wallet query param must be a single address' });
        }
        if (requestedWallet.trim().toLowerCase() !== wallet) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated session' });
        }
    }

    try {
        const [balRaw, pendingRaw] = await Promise.all([
            kvGet(`balance:${wallet}`),
            kvGet(`rewards:pending:${wallet}`),
        ]);
        const balance = balRaw ? Number(balRaw) : 0;
        const pending_rewards = pendingRaw ? Number(pendingRaw) : 0;
        if (!Number.isFinite(balance) || !Number.isFinite(pending_rewards) || balance < 0 || pending_rewards < 0) {
            throw new Error('Invalid stored wallet balance');
        }

        // Daily free usage
        const today = new Date().toISOString().slice(0, 10);
        const freeUsedRaw = await kvGet(`usage:free:${wallet}:${today}`);
        const free_used = freeUsedRaw ? Number(freeUsedRaw) : 0;
        if (!Number.isInteger(free_used) || free_used < 0) throw new Error('Invalid stored free usage');
        const free_remaining = Math.max(0, 50 - free_used);

        return res.status(200).json({
            wallet,
            balance_gstd: balance,
            pending_rewards_gstd: pending_rewards,
            free_requests_today: free_used,
            free_requests_remaining: free_remaining,
            currency: 'GSTD',
        });
    } catch (err: any) {
        console.error('[credits/balance]', err?.message || err);
        return res.status(500).json({ error: 'Could not load wallet credits' });
    }
}
