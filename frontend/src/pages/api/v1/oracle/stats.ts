/**
 * GET /api/v1/oracle/stats
 *
 * Proxy for trading bot oracle statistics.
 * Reads from the GSTD node's oracle stats endpoint (gstdbot tunnel),
 * falls back to KV-cached values if node is unreachable.
 *
 * Returns aggregate oracle decision stats:
 *   { total, enter, skip, enter_pct, avg_confidence, avg_latency_ms, sources, recent }
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

const CACHE_KEY = 'oracle:stats:cache';
const CACHE_TTL = 120; // 2 minutes

async function fetchFromNode(): Promise<object | null> {
    const nodeUrl = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');
    if (!nodeUrl) {
        // Try GitHub-published tunnel URL
        try {
            const r = await fetch(
                `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
                { signal: AbortSignal.timeout(3000) }
            );
            if (!r.ok) return null;
            const url = (await r.text()).trim();
            if (!url.startsWith('http')) return null;

            const statsRes = await fetch(`${url}/api/oracle/stats`, {
                signal: AbortSignal.timeout(8000),
            });
            if (!statsRes.ok) return null;
            return await statsRes.json();
        } catch {
            return null;
        }
    }

    try {
        const res = await fetch(`${nodeUrl}/api/oracle/stats`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    // Try live node first
    const live = await fetchFromNode();
    if (live) {
        // Cache for fallback
        await kvSet(CACHE_KEY, JSON.stringify({ ...live as object, _cached_at: Date.now() }), CACHE_TTL * 10);
        return res.status(200).json(live);
    }

    // Fall back to KV cache
    const cached = await kvGet(CACHE_KEY).catch(() => null);
    if (cached) {
        return res.status(200).json({ ...JSON.parse(cached as string), _from_cache: true });
    }

    // No data — return empty stats
    return res.status(200).json({
        total: 0, enter: 0, skip: 0, enter_pct: 0,
        avg_confidence: 0, avg_latency_ms: 0,
        sources: {}, recent: [],
        _note: 'Oracle stats not yet available — trading bot may not be active',
    });
}
