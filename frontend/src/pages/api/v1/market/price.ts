/**
 * GET /api/v1/market/price
 * Returns GSTD market price data.
 * Reads from KV (updated by admin or oracle), falls back to last known value.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

const STON_PAIR_URL = 'https://api.ston.fi/v1/pools/EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO/stats';
const TON_USD_URL   = 'https://tonapi.io/v2/rates?tokens=ton&currencies=usd';
const CACHE_TTL     = 60;

async function fetchLivePrice(): Promise<{ gstd_price_usd: number; gstd_price_ton: number } | null> {
    try {
        const [tonResp, stonResp] = await Promise.all([
            fetch(TON_USD_URL,   { signal: AbortSignal.timeout(3000) }),
            fetch(STON_PAIR_URL, { signal: AbortSignal.timeout(3000) }),
        ]);
        if (!tonResp.ok || !stonResp.ok) return null;

        const tonData  = await tonResp.json();
        const stonData = await stonResp.json();

        const tonUsd      = tonData?.rates?.TON?.prices?.USD as number | undefined;
        const gstdTon     = stonData?.stats?.last_price as number | undefined;

        if (!tonUsd || !gstdTon) return null;

        return {
            gstd_price_ton: gstdTon,
            gstd_price_usd: gstdTon * tonUsd,
        };
    } catch {
        return null;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    // Try KV cached price first
    const [priceRaw, tonRaw, changeRaw] = await Promise.all([
        kvGet('market:gstd_price_usd').catch(() => null),
        kvGet('market:gstd_price_ton').catch(() => null),
        kvGet('market:change_24h_pct').catch(() => null),
    ]);

    let gstd_price_usd = priceRaw  ? parseFloat(priceRaw)  : 0;
    let gstd_price_ton = tonRaw    ? parseFloat(tonRaw)    : 0;
    const change_24h_pct = changeRaw ? parseFloat(changeRaw) : 0;

    // If cache is empty, try live fetch and cache result
    if (!gstd_price_usd) {
        const live = await fetchLivePrice();
        if (live) {
            gstd_price_usd = live.gstd_price_usd;
            gstd_price_ton = live.gstd_price_ton;
            await Promise.all([
                kvSet('market:gstd_price_usd', String(gstd_price_usd), CACHE_TTL),
                kvSet('market:gstd_price_ton', String(gstd_price_ton), CACHE_TTL),
            ]).catch(() => {});
        }
    }

    return res.status(200).json({
        gstd_price_usd,
        gstd_price_ton,
        change_24h_pct,
        source:    gstd_price_usd > 0 ? 'ston.fi' : 'unavailable',
        timestamp: Date.now(),
    });
}
