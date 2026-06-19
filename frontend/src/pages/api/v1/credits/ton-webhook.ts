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
import { kvGet, kvIncrByFloat, kvSet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { secret, from_wallet, amount_gstd, tx_hash, memo } = req.body || {};

    const expectedSecret = process.env.TREASURY_SECRET || '';
    if (!expectedSecret || secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!from_wallet || !tx_hash) {
        return res.status(400).json({ error: 'from_wallet and tx_hash required' });
    }
    const amount = parseFloat(amount_gstd);
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'amount_gstd must be positive' });
    }

    // Idempotency
    const dedupKey = `deposit:seen:${tx_hash}`;
    if (await kvGet(dedupKey)) {
        return res.status(200).json({ ok: true, duplicate: true });
    }
    await kvSet(dedupKey, '1', 86400 * 30);

    // Credit target: memo wallet if provided, else sender
    const creditWallet = (memo?.trim() || from_wallet).toLowerCase();
    const newBalance   = await kvIncrByFloat(`balance:${creditWallet}`, amount);

    // Log deposit event
    await kvSet(
        `deposit:${Date.now()}:${creditWallet}`,
        JSON.stringify({ from: from_wallet, to: creditWallet, amount, tx_hash, ts: Date.now() }),
        86400 * 90,
    );

    return res.status(200).json({
        ok: true,
        credited_wallet: creditWallet,
        amount_gstd: amount,
        new_balance_gstd: newBalance,
        tx_hash,
    });
}
