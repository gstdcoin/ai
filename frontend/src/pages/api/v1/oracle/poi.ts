/**
 * GET /api/v1/oracle/poi
 *
 * Proof-of-Intelligence (PoI) summary from the GSTD trading validation sidecar.
 * Fetches IW stats from the gstdbot node's PoI proxy endpoint.
 * Falls back to KV cache if node is unreachable.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvKeys, kvMGet } from '../../../../lib/kv';

const CACHE_KEY = 'oracle:poi:cache';
const CACHE_TTL = 300; // 5 minutes

async function fetchFromNode(): Promise<object | null> {
    // Find node URL from KV registry
    try {
        const nodeKeys = await kvKeys('node:');
        if (nodeKeys.length === 0) return null;
        const values = await kvMGet(nodeKeys);
        const now = Date.now();
        for (const raw of values) {
            if (!raw) continue;
            const node: any = JSON.parse(raw as string);
            const url = (node.node_url || node.multiaddrs?.[0] || '').replace(/\/$/, '');
            if (!url.startsWith('http')) continue;
            const age = now - new Date(node.last_seen || 0).getTime();
            if (age > 600_000) continue;

            const r = await fetch(`${url}/api/oracle/poi/summary`, {
                signal: AbortSignal.timeout(6000),
            });
            if (r.ok) return await r.json();
        }
    } catch { /* node unreachable */ }
    return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    const live = await fetchFromNode();
    if (live) {
        await kvSet(CACHE_KEY, JSON.stringify({ ...live as object, _cached_at: Date.now() }), CACHE_TTL * 4);
        return res.status(200).json(live);
    }

    const cached = await kvGet(CACHE_KEY).catch(() => null);
    if (cached) {
        return res.status(200).json({ ...JSON.parse(cached as string), _from_cache: true });
    }

    return res.status(200).json({
        experiences_total: 0,
        avg_iw: 0,
        high_intelligence_total: 0,
        _note: 'PoI sidecar data not yet available',
    });
}
