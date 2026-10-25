/**
 * GET /api/v1/network/stats
 *
 * Unified network statistics — aggregates node counts, task metrics,
 * and treasury data from KV store.  Multiple frontend pages use this
 * endpoint; it intentionally mirrors /api/v1/stats/public with
 * extra fields for backward compatibility.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys, kvMGet, kvLLen } from '../../../../lib/kv';
import { dedupeNodeRecords, isNodeOnline, parseNodeRecords } from '../../../../lib/node-status';
import type { NodeRecord } from '../nodes/register';

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

        // Filter out sub-keys like node:X:pull_queue — only count root node entries
        const rootNodeKeys = nodeKeys.filter((k: string) => !k.slice(5).includes(':'));
        const nodeValues = rootNodeKeys.length > 0 ? await kvMGet(rootNodeKeys) : [];
        const nodeRecords = dedupeNodeRecords(parseNodeRecords<NodeRecord>(nodeValues));
        const nodesOnline = nodeRecords.filter(node => isNodeOnline(node)).length;
        // If total_registered KV counter is 0 (likely due to kvIncr failure), use the deduplicated registry count.
        const totalReg    = Math.max(parseInt(totalRegistered || '0', 10), nodeRecords.length);
        const gstdPaid    = parseFloat(totalGstdPaid     || '0');
        const treasury    = parseFloat(treasuryBalance   || '0');
        const users       = parseInt(totalUsers          || '0', 10);
        const burned      = parseFloat(totalBurned       || '0');

        const tasksDone = parseInt(totalTasksCompleted || '0', 10);

        // Read GSTD price: KV cache → live STON.fi fetch → seed fallback
        let gstdPrice = 0;
        const cachedPrice = await kvGet('market:gstd_price_usd').catch(() => null);
        const [probeOk, probeFail] = await Promise.all([kvGet('stats:probe_verified').catch(() => null), kvGet('stats:probe_failed').catch(() => null)]);
        if (cachedPrice) {
            gstdPrice = parseFloat(cachedPrice as string);
        }
        if (!gstdPrice) {
            // KV expired — fetch live from STON.fi and refresh cache
            try {
                const r = await fetch(
                    'https://api.ston.fi/v1/assets/EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
                    { signal: AbortSignal.timeout(3000) }
                );
                if (r.ok) {
                    const d = await r.json();
                    gstdPrice = parseFloat(d?.asset?.dex_usd_price || '0');
                    if (gstdPrice) {
                        kvSet('market:gstd_price_usd', String(gstdPrice), 1800).catch(() => {});
                        kvSet('market:price_source', 'ston.fi', 1800).catch(() => {});
                    }
                }
            } catch { /* ignore */ }
        }
        // Zero means no live price is available; never publish a synthetic seed price.

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
            probes_verified:        Number(probeOk) || 0,
            probes_failed:          Number(probeFail) || 0,
            tasks_24h:              null,
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
