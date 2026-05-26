/**
 * GET /api/v1/nodes/liquidity/pools
 * Liquidity pool data for node operator vaults.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

    return res.status(200).json([]);
}
