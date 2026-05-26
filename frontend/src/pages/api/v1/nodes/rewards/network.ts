/**
 * GET /api/v1/nodes/rewards/network
 * Network-wide reward statistics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const nodeKeys = await kvKeys('node:');
        const totalNodes = nodeKeys.length;

        const rewardPoolRaw = await kvGet('rewards:pool_total');
        const distributedRaw = await kvGet('rewards:distributed_total');

        return res.status(200).json({
            total_nodes:          totalNodes,
            active_nodes:         totalNodes,
            reward_pool_gstd:     parseFloat(rewardPoolRaw || '0'),
            distributed_total:    parseFloat(distributedRaw || '0'),
            epoch_reward_rate:    0.5,
            next_distribution_in: 3600,
            timestamp:            Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/rewards/network]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
