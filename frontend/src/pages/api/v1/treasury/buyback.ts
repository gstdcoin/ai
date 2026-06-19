/**
 * POST /api/v1/treasury/buyback
 * Triggers a GSTD buyback from STON.fi using treasury funds.
 * Protected by TREASURY_SECRET.
 * Actual on-chain execution runs via scripts/settle.ts on Pi.
 * This endpoint records the buyback intent in KV and returns the plan.
 *
 * Body: { dry_run?: boolean }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncrByFloat } from '../../../../lib/kv';

const BUYBACK_MIN_GSTD   = 100;  // Only buyback when treasury has at least 100 GSTD
const BUYBACK_PERCENT    = 0.5;  // Use 50% of treasury for each buyback cycle
const STON_ASSET_URL     = 'https://api.ston.fi/v1/assets/EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';

async function getGstdPrice(): Promise<number> {
    try {
        const resp = await fetch(STON_ASSET_URL, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
            const data: any = await resp.json();
            return parseFloat(data?.asset?.dex_usd_price || '0') || 0;
        }
    } catch { /* fallback */ }
    return 0.000079; // last known
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = process.env.TREASURY_SECRET || '';
    const auth   = req.headers['x-treasury-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!secret || auth !== secret) return res.status(401).json({ error: 'Unauthorized' });

    const dryRun = req.body?.dry_run !== false;

    const treasuryRaw = await kvGet('treasury:balance');
    const treasuryBalance = parseFloat(treasuryRaw || '0');

    if (treasuryBalance < BUYBACK_MIN_GSTD) {
        return res.status(200).json({
            ok:        false,
            reason:    'below_minimum',
            balance:   treasuryBalance,
            minimum:   BUYBACK_MIN_GSTD,
            message:   `Treasury has ${treasuryBalance.toFixed(2)} GSTD, need ${BUYBACK_MIN_GSTD} to trigger buyback.`,
        });
    }

    const gstdPrice    = await getGstdPrice();
    const buybackGstd  = treasuryBalance * BUYBACK_PERCENT;
    const buybackUsd   = buybackGstd * gstdPrice;

    const plan = {
        treasury_balance_gstd: treasuryBalance,
        buyback_gstd:          buybackGstd,
        buyback_usd:           buybackUsd,
        gstd_price_usd:        gstdPrice,
        remaining_treasury:    treasuryBalance - buybackGstd,
        via:                   'ston.fi',
        dry_run:               dryRun,
        timestamp:             new Date().toISOString(),
    };

    if (!dryRun) {
        // Record buyback intent — actual execution via scripts/settle.ts on Pi
        await kvSet(
            `buyback:${Date.now()}`,
            JSON.stringify(plan),
            86400 * 90,
        );
        // Deduct from treasury balance
        await kvIncrByFloat('treasury:balance', -buybackGstd);
        // Accumulate locked amount (proof of backing)
        await kvIncrByFloat('treasury:total_bought_back', buybackGstd);
    }

    return res.status(200).json({ ok: true, plan });
}
