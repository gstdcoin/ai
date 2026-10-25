/**
 * GET /api/v1/stats/public
 * Full network statistics including marketplace and treasury.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet, kvLLen } from '../../../../lib/kv';
import { dedupeNodeRecords, isNodeOnline, parseNodeRecords } from '../../../../lib/node-status';
import type { NodeRecord } from '../nodes/register';

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
        let nodesOnline = 0;
        let registeredNodes = 0;
        const tasksDone = parseInt(totalTasksCompleted || '0', 10);

        if (rootNodeKeys.length > 0) {
            const values = await kvMGet(rootNodeKeys).catch(() => [] as (string|null)[]);
            const records = parseNodeRecords<NodeRecord>(values);
            const dedupedRecords = dedupeNodeRecords(records);
            registeredNodes = dedupedRecords.length;
            nodesOnline = dedupedRecords.filter(node => isNodeOnline(node)).length;
        }

        const totalReg = Math.max(parseInt(totalRegistered || '0', 10), registeredNodes);

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
