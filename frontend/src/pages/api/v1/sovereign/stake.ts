/**
 * POST /api/v1/sovereign/stake
 * Staking has been discontinued — the on-chain contract was never deployed.
 * Returns 410 Gone to prevent UI from silently debiting user balances.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    return res.status(410).json({
        error: 'Staking is not available. The on-chain contract has not been deployed.',
        alternative: 'Run a node and earn GSTD from real AI inference — see /nodes',
    });
}
