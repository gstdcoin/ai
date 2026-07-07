/**
 * POST /api/v1/nodes/claim-rewards
 * Move pending node rewards to the wallet's spendable GSTD credit balance.
 * Credits can be used immediately for training jobs and inference.
 * On-chain TON transfer will be available after smart contract deployment.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncrByFloat } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    try {
        const walletKey  = wallet.toLowerCase();
        const rewardKey  = `rewards:pending:${walletKey}`;
        const raw        = await kvGet(rewardKey);
        const pending    = raw ? parseFloat(raw) : 0;

        if (pending < 0.001) {
            return res.status(200).json({ ok: false, reason: 'No pending rewards', pending_gstd: 0 });
        }

        // Move to spendable credit balance
        const newBalance = await kvIncrByFloat(`balance:${walletKey}`, pending);
        await kvSet(rewardKey, '0');

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
