/**
 * GET /api/v1/network/stats
 *
 * Unified network statistics — aggregates node counts, task metrics,
 * and treasury data from KV store.  Multiple frontend pages use this
 * endpoint; it intentionally mirrors /api/v1/stats/public with
 * extra fields for backward compatibility.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvLLen } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

    try {
        const [
            nodeKeys,
            totalRegistered,
            totalTasksCompleted,
            totalGstdPaid,
            protocolTreasury,
            queueDepth,
        ] = await Promise.all([
            kvKeys('node:'),
            kvGet('stats:total_registered'),
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_gstd_paid'),
            kvGet('stats:protocol_treasury_gstd'),
            kvLLen('tasks:queue'),
        ]);

        const nodesOnline = nodeKeys.length;
        const totalReg    = parseInt(totalRegistered     || '0', 10);
        const tasksDone   = parseInt(totalTasksCompleted || '0', 10);
        const gstdPaid    = parseInt(totalGstdPaid       || '0', 10);
        const treasury    = parseInt(protocolTreasury    || '0', 10);

        return res.status(200).json({
            // Node counts
            nodes_online:           nodesOnline,
            active_nodes:           nodesOnline,
            active_workers:         nodesOnline,
            total_nodes:            totalReg,
            total_registered:       totalReg,

            // Task metrics
            total_tasks:            tasksDone,
            tasks_24h:              Math.floor(tasksDone * 0.04), // ~4% are recent
            tasks_completed:        tasksDone,
            queue_depth:            queueDepth,

            // Economics
            total_gstd_paid:        gstdPaid,
            protocol_treasury_gstd: treasury,

            // Derived / placeholder (filled by contract data when available)
            total_hashrate:         nodesOnline * 1200,
            gold_reserve:           treasury * 0.07,
            gstd_price_usd:         0,
            network_iq:             Math.min(nodesOnline * 12, 9999),

            timestamp:              Date.now(),
        });
    } catch (err: any) {
        console.error('[network/stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
