/**
 * GET /api/v1/stats/public
 * Full network statistics including marketplace and treasury.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvLLen } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [
            nodeKeys, campaignKeys,
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

        return res.status(200).json({
            nodes_online:           nodeKeys.length,
            active_nodes:           nodeKeys.length,
            total_registered:       parseInt(totalRegistered  || '0', 10),
            total_heartbeats:       parseInt(totalHeartbeats  || '0', 10),
            total_tasks_submitted:  parseInt(totalTasksSubmitted || '0', 10),
            total_tasks_completed:  parseInt(totalTasksCompleted || '0', 10),
            tasks_completed:        parseInt(totalTasksCompleted || '0', 10),
            queue_depth:            queueDepth,
            total_gstd_paid:        parseInt(totalGstdPaid    || '0', 10),
            protocol_treasury_gstd: parseInt(protocolTreasury || '0', 10),
            active_campaigns:       campaignKeys.length,
            total_campaigns:        parseInt(totalCampaigns   || '0', 10),
            timestamp:              Date.now(),
        });
    } catch (err: any) {
        console.error('[stats/public]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
