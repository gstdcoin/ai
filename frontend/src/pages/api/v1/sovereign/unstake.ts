/**
 * POST /api/v1/sovereign/unstake
 * Unstake GSTD back to wallet balance.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Staking is discontinued — on-chain contract was never deployed.
    // Legacy KV staked balances are migrated back to node rewards automatically.
    return res.status(410).json({
        error: 'Staking discontinued',
        message: 'On-chain staking has been discontinued. Your GSTD is earned directly through node operation — no staking required. See /nodes to run a node.',
        docs: '/nodes',
    });
}
