/**
 * POST /api/v1/treasury/buyback
 * Returns a GSTD buyback plan (treasury has enough, at current STON.fi
 * price, etc) for review. Protected by TREASURY_SECRET.
 *
 * dry_run:false previously deducted treasury:balance immediately and
 * recorded the plan as an executed buyback, on the claim that
 * "scripts/settle.ts on Pi" performs the real STON.fi swap -- it never
 * did (grep the whole repo: buyback.ts is the only file mentioning
 * buyback). Every live call silently destroyed real treasury GSTD from
 * the accounting with no swap, no XAUt/GSTD ever actually bought, and
 * no way to notice short of manually reconciling the balance. Until a
 * real, verified STON.fi swap exists (needs the same pTON-wrapping
 * research documented for TreasuryGold), this only ever returns a plan
 * and never touches the balance -- do not resurrect the old deduct-now
 * behavior without wiring it to an execution step that actually runs.
 *
 * Body: { dry_run?: boolean } -- dry_run is accepted for API compatibility
 * but has no effect; nothing is ever executed or recorded as executed.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

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
        executed:              false, // see file header -- no execution path exists yet
        timestamp:             new Date().toISOString(),
    };

    return res.status(200).json({ ok: true, plan });
}
