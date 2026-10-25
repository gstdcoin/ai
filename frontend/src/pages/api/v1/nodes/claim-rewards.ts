/**
 * POST /api/v1/nodes/claim-rewards
 * Move pending node rewards for the authenticated wallet to spendable GSTD credits.
 * Credits can be used immediately for training jobs and inference.
 * On-chain TON transfer will be available after smart contract deployment.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvClaimPending } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const r = await kvClaimPending(wallet, 0.001);
        if (r.status === 'invalid') return res.status(409).json({ ok: false, reason: 'Reward state invalid' });
        if (r.status === 'nothing') {
            return res.status(200).json({ ok: false, reason: 'No pending rewards', pending_gstd: 0 });
        }
        const pending = r.gross;
        const newBalance = r.balance;
        return res.status(200).json({
            ok:            true,
            claimed_gstd:  pending,
            new_balance:   newBalance,
            note:          'Rewards moved to your GSTD credit balance. Use for training jobs and inference. On-chain TON withdrawal coming soon.',
            timestamp:     Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/claim-rewards]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
