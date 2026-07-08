/**
 * GET /api/v1/nodes/rewards/network
 * Network-wide reward statistics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvSet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

    try {
        const [nodeKeys, rewardPoolRaw, distributedRaw, totalTasksRaw] = await Promise.all([
            kvKeys('node:'),
            kvGet('rewards:pool_total'),
            kvGet('rewards:distributed_total'),
            kvGet('stats:total_tasks_completed'),
        ]);
        const totalNodes = nodeKeys.length;
        let tasksDone = Math.round(parseFloat(totalTasksRaw || '0'));
        // Fallback: read oracle/stats cache if counter is 0
        if (!tasksDone) {
            const oracleCacheRaw = await kvGet('oracle:stats:cache').catch(() => null);
            if (oracleCacheRaw) {
                try {
                    const oc = JSON.parse(oracleCacheRaw as string);
                    if (oc?.total) {
                        tasksDone = oc.total;
                        // Sync the authoritative counter so future reads don't re-fetch
                        kvSet('stats:total_tasks_completed', String(tasksDone)).catch(() => {});
                    }
                } catch { /* ignore */ }
            }
        }

        return res.status(200).json({
            total_nodes:          totalNodes,
            active_nodes:         totalNodes,
            total_tasks:          tasksDone,
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
