/**
 * GET /api/v1/stats/public
 * Full network statistics including marketplace and treasury.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys, kvMGet, kvLLen } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [
            allNodeKeys, campaignKeys,
            totalRegistered, totalHeartbeats,
            totalTasksSubmitted, totalTasksCompleted,
            totalGstdPaid, protocolTreasury, totalCampaigns,
            queueDepth,
        ] = await Promise.all([
            kvKeys('node:'),
            kvKeys('campaign:'),
            kvGet('stats:total_registered'),
            kvGet('stats:total_heartbeats'),
            kvGet('stats:total_tasks_submitted'),
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_gstd_paid'),
            kvGet('stats:protocol_treasury_gstd'),
            kvGet('stats:total_campaigns'),
            kvLLen('tasks:queue'),
        ]);

        // Filter sub-keys (node:X:pull_queue etc.) and deduplicate by URL
        const rootNodeKeys = allNodeKeys.filter((k: string) => !k.slice(5).includes(':'));
        let nodesOnline = rootNodeKeys.length;
        let tasksDone = parseInt(totalTasksCompleted || '0', 10);

        if (rootNodeKeys.length > 0) {
            const values = await kvMGet(rootNodeKeys).catch(() => [] as (string|null)[]);
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
            const records = values.filter((v): v is string => v !== null).map(v => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
            // Dedup by URL; prefer named nodes over UUID IDs
            records.sort((a: any, b: any) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
            const seenUrls = new Set<string>();
            const dedupedRecords = records.filter((n: any) => {
                const url = n.node_url || n.multiaddrs?.[0] || '';
                if (!url) return true;
                if (seenUrls.has(url)) return false;
                seenUrls.add(url); return true;
            });
            nodesOnline = dedupedRecords.length;
            // Sum tasks from node records (trading bot calls gstdbot directly, not Vercel oracle)
            if (!tasksDone) {
                for (const n of dedupedRecords) {
                    tasksDone += parseInt(n.tasks_completed || '0', 10);
                }
            }
        }
        if (tasksDone > parseInt(totalTasksCompleted || '0', 10)) {
            kvSet('stats:total_tasks_completed', String(tasksDone)).catch(() => {});
        }

        const totalReg = Math.max(parseInt(totalRegistered || '0', 10), nodesOnline);

        return res.status(200).json({
            nodes_online:           nodesOnline,
            active_nodes:           nodesOnline,
            total_registered:       totalReg,
            total_heartbeats:       parseInt(totalHeartbeats  || '0', 10),
            total_tasks_submitted:  parseInt(totalTasksSubmitted || '0', 10),
            total_tasks_completed:  tasksDone,
            tasks_completed:        tasksDone,
            queue_depth:            queueDepth,
            total_gstd_paid:        parseFloat(totalGstdPaid  || '0'),
            protocol_treasury_gstd: parseFloat(protocolTreasury || '0'),
            active_campaigns:       campaignKeys.length,
            total_campaigns:        parseInt(totalCampaigns   || '0', 10),
            timestamp:              Date.now(),
        });
    } catch (err: any) {
        console.error('[stats/public]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
