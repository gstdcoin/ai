/**
 * POST /api/v1/credits/deposit
 * Manually credit GSTD to a wallet (admin endpoint, protected by TREASURY_SECRET).
 * Production use: called by deposit-monitor.ts after confirming on-chain TON transfer.
 *
 * Body: { wallet: string, amount_gstd: number, tx_hash?: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvIncrByFloat, kvSet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = process.env.TREASURY_SECRET || '';
    const auth   = req.headers['x-treasury-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!secret || auth !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { wallet, amount_gstd, tx_hash } = req.body || {};

    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'wallet required' });
    }
    const amount = parseFloat(amount_gstd);
    if (!amount || amount <= 0 || amount > 1_000_000) {
        return res.status(400).json({ error: 'amount_gstd must be positive number' });
    }

    const walletKey = wallet.trim().toLowerCase();

    // Idempotency: if tx_hash provided, skip duplicate
    if (tx_hash) {
        const dedupKey = `deposit:seen:${tx_hash}`;
        const existing = await kvGet(dedupKey);
        if (existing) {
            return res.status(200).json({ ok: true, duplicate: true, tx_hash });
        }
        await kvSet(dedupKey, '1', 86400 * 30); // 30-day dedup window
    }

    const newBalance = await kvIncrByFloat(`balance:${walletKey}`, amount);

    return res.status(200).json({
        ok: true,
        wallet: walletKey,
        amount_gstd: amount,
        new_balance_gstd: newBalance,
        tx_hash: tx_hash || null,
    });
}
