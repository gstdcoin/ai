/**
 * POST /api/v1/credits/ton-webhook
 * Called by deposit-monitor.ts running on Pi when a GSTD Jetton transfer is detected.
 * Converts incoming GSTD amount to credits and deposits to the sender wallet.
 *
 * Body: {
 *   secret: string,          — TREASURY_SECRET
 *   from_wallet: string,     — sender TON address
 *   amount_gstd: number,     — GSTD received (after 9-decimal conversion)
 *   tx_hash: string,         — TON transaction hash (idempotency key)
 *   memo?: string,           — optional credit target wallet (if different from sender)
 * }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvCreditOnce } from '../../../../lib/kv';
import { matchesSecret } from '../../../../lib/secretAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { secret, from_wallet, amount_gstd, tx_hash, memo } = req.body || {};

    const expectedSecret = process.env.TREASURY_SECRET || '';
    if (!matchesSecret(secret, expectedSecret)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (typeof from_wallet !== 'string' || !from_wallet.trim() || typeof tx_hash !== 'string' || !tx_hash.trim()) {
        return res.status(400).json({ error: 'from_wallet and tx_hash required' });
    }
    const amount = Number(amount_gstd);
    if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amount_gstd must be positive' });
    }

    const creditWallet = (typeof memo === 'string' && memo.trim() ? memo.trim() : from_wallet).toLowerCase();
    const ts = Date.now();
    const result = await kvCreditOnce(
        `deposit:seen:${tx_hash}`,
        creditWallet,
        amount,
        86400 * 30,
        {
            key: `deposit:${tx_hash}:${creditWallet}`,
            value: JSON.stringify({ from: from_wallet, to: creditWallet, amount, tx_hash, ts }),
            ttlSec: 86400 * 90,
        },
    );
    if (result.status === 'duplicate') {
        return res.status(200).json({ ok: true, duplicate: true });
    }
    if (result.status !== 'credited') {
        console.error('[credits/ton-webhook] Invalid credit state', { tx_hash });
        return res.status(500).json({ error: 'Could not credit deposit' });
    }

    return res.status(200).json({
        ok: true,
        credited_wallet: creditWallet,
        amount_gstd: amount,
        new_balance_gstd: result.balance,
        tx_hash,
    });
}
