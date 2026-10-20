/**
 * POST /api/v1/credits/deposit
 * Manually credit GSTD to a wallet (admin endpoint, protected by TREASURY_SECRET).
 * Production use: called by deposit-monitor.ts after confirming on-chain TON transfer.
 *
 * Body: { wallet: string, amount_gstd: number, tx_hash?: string }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvCreditOnce, kvIncrByFloat } from '../../../../lib/kv';
import { matchesSecret } from '../../../../lib/secretAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = process.env.TREASURY_SECRET || '';
    const auth   = req.headers['x-treasury-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!matchesSecret(auth, secret)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { wallet, amount_gstd, tx_hash } = req.body || {};

    if (typeof wallet !== 'string' || !wallet.trim()) {
        return res.status(400).json({ error: 'wallet required' });
    }
    const amount = Number(amount_gstd);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
        return res.status(400).json({ error: 'amount_gstd must be positive number' });
    }

    const walletKey = wallet.trim().toLowerCase();
    if (tx_hash !== undefined && (typeof tx_hash !== 'string' || !tx_hash.trim())) {
        return res.status(400).json({ error: 'tx_hash must be a non-empty string' });
    }

    // Idempotency: if tx_hash provided, skip duplicate
    let newBalance: number;
    if (tx_hash) {
        const result = await kvCreditOnce(`deposit:seen:${tx_hash}`, walletKey, amount, 86400 * 30);
        if (result.status === 'duplicate') {
            return res.status(200).json({ ok: true, duplicate: true, tx_hash });
        }
        if (result.status !== 'credited') {
            console.error('[credits/deposit] Invalid credit state', { tx_hash });
            return res.status(500).json({ error: 'Could not credit deposit' });
        }
        newBalance = result.balance;
    } else {
        newBalance = await kvIncrByFloat(`balance:${walletKey}`, amount);
    }

    return res.status(200).json({
        ok: true,
        wallet: walletKey,
        amount_gstd: amount,
        new_balance_gstd: newBalance,
        tx_hash: tx_hash || null,
    });
}
