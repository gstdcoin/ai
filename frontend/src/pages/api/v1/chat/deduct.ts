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
import { kvDebitBalance, kvGet } from '../../../../lib/kv';

const MAX_DEDUCT_GSTD = 10; // generous headroom over the highest real tier cost (0.50 GSTD)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (!sessionToken) return res.status(401).json({ error: 'Not authenticated' });

    const walletKey = await kvGet(`session:${sessionToken}`).catch(() => null);
    if (!walletKey) return res.status(401).json({ error: 'Session expired' });

    const { amount, tier } = req.body || {};
    const cost = Number(amount);
    if (!Number.isFinite(cost) || cost <= 0 || cost > MAX_DEDUCT_GSTD) {
        return res.status(400).json({ error: `amount must be a positive number up to ${MAX_DEDUCT_GSTD}` });
    }

    try {
        const debit = await kvDebitBalance(walletKey, cost, [
            { key: `usage:chat:${walletKey}`, amount: cost },
        ]);
        if (debit.status === 'insufficient') {
            return res.status(402).json({ error: 'Insufficient balance', balance: debit.balance, required: cost });
        }
        if (debit.status !== 'debited') throw new Error('Could not apply chat deduction');

        return res.status(200).json({
            ok:        true,
            wallet:    walletKey,
            deducted:  cost,
            remaining: debit.balance,
            tier:      tier || 'free',
        });
    } catch (err: any) {
        console.error('[chat/deduct]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
