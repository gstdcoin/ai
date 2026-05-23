/**
 * GET /api/v1/stats
 *
 * Network-wide stats for dashboard and landing page.
 * Returns active nodes, total tasks, total heartbeats, queue depth.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvLLen } from '../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [nodeKeys, totalRegistered, totalHeartbeats, totalTasksSubmitted, totalTasksCompleted, queueDepth] =
            await Promise.all([
                kvKeys('node:'),
                kvGet('stats:total_registered'),
                kvGet('stats:total_heartbeats'),
                kvGet('stats:total_tasks_submitted'),
                kvGet('stats:total_tasks_completed'),
                kvLLen('tasks:queue'),
            ]);

        return res.status(200).json({
            nodes_online:          nodeKeys.length,
            total_registered:      parseInt(totalRegistered || '0', 10),
            total_heartbeats:      parseInt(totalHeartbeats || '0', 10),
            total_tasks_submitted: parseInt(totalTasksSubmitted || '0', 10),
            total_tasks_completed: parseInt(totalTasksCompleted || '0', 10),
            queue_depth:           queueDepth,
            timestamp:             Date.now(),
        });
    } catch (err: any) {
        console.error('[stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
