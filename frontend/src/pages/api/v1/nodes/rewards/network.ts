/**
 * GET /api/v1/nodes/rewards/network
 * Network-wide reward statistics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet, kvSet } from '../../../../../lib/kv';

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
        let nodesOnline = rootKeys.length;
        let tasksDone = parseInt(totalTasksRaw || '0', 10);

        if (rootKeys.length > 0) {
            const values = await kvMGet(rootKeys).catch(() => [] as (string|null)[]);
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
            const records = values.filter((v): v is string => v !== null).map(v => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean) as any[];
            records.sort((a: any, b: any) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
            const seen = new Set<string>();
            const deduped = records.filter((n: any) => {
                const url = n.node_url || n.multiaddrs?.[0] || '';
                if (!url) return true;
                if (seen.has(url)) return false;
                seen.add(url); return true;
            });
            nodesOnline = deduped.length;
            if (!tasksDone) {
                for (const n of deduped) tasksDone += parseInt(n.tasks_completed || '0', 10);
                if (tasksDone > 0) kvSet('stats:total_tasks_completed', String(tasksDone)).catch(() => {});
            }
        }

        return res.status(200).json({
            total_nodes:          nodesOnline,
            active_nodes:         nodesOnline,
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
