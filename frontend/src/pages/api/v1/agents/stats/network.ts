/**
 * GET /api/v1/agents/stats/network
 *
 * Agent network summary statistics — online agents, GSTD distributed.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');

    try {
        const [allNodeKeys, totalGstdPaid] = await Promise.all([
            kvKeys('node:'),
            kvGet('stats:total_gstd_paid'),
        ]);

        // Filter sub-keys and deduplicate by URL
        const rootKeys = allNodeKeys.filter((k: string) => !k.slice(5).includes(':'));
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        let online = 0;

        if (rootKeys.length > 0) {
            const values = await kvMGet(rootKeys).catch(() => [] as (string|null)[]);
            const records = values.filter((v): v is string => v !== null).map(v => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean) as any[];
            records.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
            const seenUrls = new Set<string>();
            const deduped = records.filter((n: any) => {
                const url = n.node_url || n.multiaddrs?.[0] || '';
                if (!url) return true;
                if (seenUrls.has(url)) return false;
                seenUrls.add(url); return true;
            });
            const now = Date.now();
            online = deduped.filter((n: any) => (now - new Date(n.last_seen || 0).getTime()) < 600_000).length;
        }

        return res.status(200).json({
            total_agents:     rootKeys.length,
            online_agents:    online,
            total_gstd_paid:  parseFloat(totalGstdPaid || '0'),
            timestamp:        Date.now(),
        });
    } catch (err: any) {
        console.error('[agents/stats/network]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
