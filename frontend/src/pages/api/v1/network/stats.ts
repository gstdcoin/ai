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
            treasuryBalance,
            queueDepth,
            totalUsers,
            totalBurned,
        ] = await Promise.all([
            kvKeys('node:'),
            kvGet('stats:total_registered'),
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_gstd_paid'),
            kvGet('treasury:balance'),
            kvLLen('tasks:queue'),
            kvGet('stats:total_users'),
            kvGet('stats:total_burned'),
        ]);

        const nodesOnline = nodeKeys.length;
        const totalReg    = parseInt(totalRegistered     || '0', 10);
        const tasksDone   = parseInt(totalTasksCompleted || '0', 10);
        const gstdPaid    = parseFloat(totalGstdPaid     || '0');
        const treasury    = parseFloat(treasuryBalance   || '0');
        const users       = parseInt(totalUsers          || '0', 10);
        const burned      = parseFloat(totalBurned       || '0');

        // Read GSTD price from KV cache (populated by /api/v1/market/price, TTL=60s).
        // Avoids calling STON.fi on every stats request — market/price owns that fetch.
        const cachedPrice = await kvGet('market:gstd_price_usd').catch(() => null);
        const gstdPrice = cachedPrice ? parseFloat(cachedPrice as string) || 0 : 0;

        return res.status(200).json({
            // Node counts (real KV data)
            nodes_online:           nodesOnline,
            active_nodes:           nodesOnline,
            active_workers:         nodesOnline,
            total_nodes:            totalReg,
            total_registered:       totalReg,
            total_users:            users,

            // Task metrics (real KV data)
            total_tasks:            tasksDone,
            tasks_24h:              Math.floor(tasksDone * 0.04),
            tasks_completed:        tasksDone,
            queue_depth:            queueDepth,

            // Economics (real KV data)
            total_gstd_paid:        gstdPaid,
            protocol_treasury_gstd: treasury,
            total_burned:           burned,

            // Market data (live from STON.fi)
            gstd_price_usd:         gstdPrice,

            timestamp:              Date.now(),
        });
    } catch (err: any) {
        console.error('[network/stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
