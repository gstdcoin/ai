/**
 * GET /api/v1/market/price
 * Returns GSTD market price data.
 *
 * Priority:
 *   1. KV override (admin can set `market:gstd_price_usd` directly)
 *   2. Live fetch from STON.fi + tonapi.io (once token is listed)
 *   3. Seed price — used pre-launch so Stars ↔ GSTD rate calculation always works
 *
 * Seed price = $0.001/GSTD (1000 GSTD per dollar).
 * Admin can override: POST /api/v1/admin/price-seed { secret, price_usd }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

const STON_ASSET_URL = 'https://api.ston.fi/v1/assets/EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const TON_USD_URL    = 'https://tonapi.io/v2/rates?tokens=ton&currencies=usd';
const CACHE_TTL      = 1800; // 30 min — price doesn't change second-to-second
const SEED_PRICE_USD = 0.001;

async function fetchLivePrice(): Promise<{ gstd_price_usd: number; gstd_price_ton: number } | null> {
    try {
        const [assetResp, tonResp] = await Promise.all([
            fetch(STON_ASSET_URL, { signal: AbortSignal.timeout(4000) }),
            fetch(TON_USD_URL,    { signal: AbortSignal.timeout(4000) }),
        ]);
        if (!assetResp.ok) return null;

        const assetData = await assetResp.json();
        const gstdUsd   = parseFloat(assetData?.asset?.dex_usd_price || '0');
        if (!gstdUsd) return null;

        let gstdTon = 0;
        if (tonResp.ok) {
            const tonData = await tonResp.json();
            const tonUsd  = tonData?.rates?.TON?.prices?.USD as number | undefined;
            if (tonUsd) gstdTon = gstdUsd / tonUsd;
        }

        return { gstd_price_usd: gstdUsd, gstd_price_ton: gstdTon };
    } catch {
        return null;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    // 1. Try KV admin override first
    const [priceRaw, tonRaw, changeRaw, sourceRaw] = await Promise.all([
        kvGet('market:gstd_price_usd').catch(() => null),
        kvGet('market:gstd_price_ton').catch(() => null),
        kvGet('market:change_24h_pct').catch(() => null),
        kvGet('market:price_source').catch(() => null),
    ]);

    let gstd_price_usd   = priceRaw  ? parseFloat(priceRaw as string)  : 0;
    let gstd_price_ton   = tonRaw    ? parseFloat(tonRaw as string)    : 0;
    const change_24h_pct = changeRaw ? parseFloat(changeRaw as string) : 0;
    let source           = (sourceRaw as string) || '';

    // 2. If no cached price, try live STON.fi fetch
    if (!gstd_price_usd) {
        const live = await fetchLivePrice();
        if (live) {
            gstd_price_usd = live.gstd_price_usd;
            gstd_price_ton = live.gstd_price_ton;
            source         = 'ston.fi';
            await Promise.all([
                kvSet('market:gstd_price_usd',  String(gstd_price_usd),  CACHE_TTL),
                kvSet('market:gstd_price_ton',  String(gstd_price_ton),  CACHE_TTL),
                kvSet('market:price_source',    source,                   CACHE_TTL),
            ]).catch(() => {});
        }
    }

    // 3. Fall back to seed price — ensures Stars ↔ GSTD rate is always calculable
    const is_seed = !gstd_price_usd;
    if (is_seed) {
        gstd_price_usd = SEED_PRICE_USD;
        source = 'seed';
    }

    return res.status(200).json({
        gstd_price_usd,
        gstd_price_ton,
        change_24h_pct,
        source: source || 'seed',
        timestamp: Date.now(),
    });
}
