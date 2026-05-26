/**
 * GET /api/v1/nodes/rewards/program
 * Reward program configuration and tiers.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

    return res.status(200).json({
        program_name: 'GSTD Node Rewards',
        status: 'active',
        base_rate_per_hour: 0.5,
        tiers: [
            { name: 'bronze', min_tasks: 0,    multiplier: 1.0, color: '#cd7f32' },
            { name: 'silver', min_tasks: 100,  multiplier: 1.5, color: '#c0c0c0' },
            { name: 'gold',   min_tasks: 1000, multiplier: 2.0, color: '#ffd700' },
            { name: 'diamond',min_tasks: 10000,multiplier: 3.0, color: '#b9f2ff' },
        ],
        bonuses: [
            { type: 'uptime',  description: '+20% for 99%+ uptime',  multiplier: 1.2 },
            { type: 'gpu',     description: '+50% for GPU nodes',     multiplier: 1.5 },
            { type: 'early',   description: 'Early-bird 2× (first 100 nodes)', multiplier: 2.0 },
        ],
        note: 'Rewards paid after TON smart contract deployment.',
        timestamp: Date.now(),
    });
}
