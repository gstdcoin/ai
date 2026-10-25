/**
 * GET /api/v1/nodes/rewards/network
 * Network-wide reward statistics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet } from '../../../../../lib/kv';
import { parseNodeRecords, dedupeNodeRecords, isNodeOnline } from '../../../../../lib/node-status';
import type { NodeRecord } from '../register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

    try {
        const [allNodeKeys, rewardPoolRaw, distributedRaw, totalTasksRaw] = await Promise.all([
            kvKeys('node:'),
            kvGet('rewards:pool_total'),
            kvGet('rewards:distributed_total'),
            kvGet('stats:total_tasks_completed'),
        ]);
        const rootKeys = allNodeKeys.filter((k: string) => !k.slice(5).includes(':'));
        const values = rootKeys.length ? await kvMGet(rootKeys) : [];
        const records = dedupeNodeRecords(parseNodeRecords<NodeRecord>(values));
        const nodesOnline = records.filter(node => isNodeOnline(node)).length;
        const tasksDone = parseInt(totalTasksRaw || '0', 10);

        return res.status(200).json({
            total_nodes:          records.length,
            active_nodes:         nodesOnline,
            total_tasks:          tasksDone,
            reward_pool_gstd:     parseFloat(rewardPoolRaw || '0'),
            distributed_total:    parseFloat(distributedRaw || '0'),
            epoch_reward_rate:    0,
            next_distribution_in: null,
            timestamp:            Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/rewards/network]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
