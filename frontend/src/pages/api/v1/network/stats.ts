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
        // Deduplicate by node_url (same as nodes/list) to avoid counting ghost/duplicate nodes
        let nodesOnline = rootNodeKeys.length;
        if (rootNodeKeys.length > 1) {
            const values = await kvMGet(rootNodeKeys);
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
            const records = values.filter((v): v is string => v !== null).map(v => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
            records.sort((a: any, b: any) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
            const seenUrls = new Set<string>();
            const dedupedCount = records.filter((n: any) => {
                const url = n.node_url || n.multiaddrs?.[0] || '';
                if (!url) return true;
                if (seenUrls.has(url)) return false;
                seenUrls.add(url); return true;
            }).length;
            nodesOnline = dedupedCount;
        }
        // If total_registered KV counter is 0 (likely due to kvIncr failure), fall back to actual node count
        const totalReg    = Math.max(parseInt(totalRegistered || '0', 10), nodesOnline);
        const gstdPaid    = parseFloat(totalGstdPaid     || '0');
        const treasury    = parseFloat(treasuryBalance   || '0');
        const users       = parseInt(totalUsers          || '0', 10);
        const burned      = parseFloat(totalBurned       || '0');

        // Tasks completed: prefer KV counter; fall back to summing node records (heartbeat sets these)
        // then oracle/stats cache as last resort
        let tasksDone = parseInt(totalTasksCompleted || '0', 10);
        if (!tasksDone) {
            // Sum tasks_completed from all node records (updated by PlatformLink heartbeat)
            if (rootNodeKeys.length > 0) {
                const nodeVals = await kvMGet(rootNodeKeys).catch(() => [] as (string|null)[]);
                for (const raw of nodeVals) {
                    if (!raw) continue;
                    try { tasksDone += parseInt(JSON.parse(raw as string).tasks_completed || '0', 10); } catch { /* ignore */ }
                }
            }
        }
        if (!tasksDone) {
            const oracleCacheRaw = await kvGet('oracle:stats:cache').catch(() => null);
            if (oracleCacheRaw) {
                try { tasksDone = JSON.parse(oracleCacheRaw as string)?.total || 0; } catch { /* ignore */ }
            }
        }
        // Sync the authoritative counter so subsequent reads are fast
        if (tasksDone > parseInt(totalTasksCompleted || '0', 10)) {
            kvSet('stats:total_tasks_completed', String(tasksDone)).catch(() => {});
        }

        // Read GSTD price: KV cache → live STON.fi fetch → seed fallback
        let gstdPrice = 0;
        const cachedPrice = await kvGet('market:gstd_price_usd').catch(() => null);
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
        if (!gstdPrice) gstdPrice = 0.001; // pre-listing seed

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
