/**
 * GET /api/v1/nodes/tools/governance/active
 * Active DAO governance proposals.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

    return res.status(200).json({
        proposals: [],
        total: 0,
        note: 'DAO governance activates after TON smart contract deployment.',
        timestamp: Date.now(),
    });
}
