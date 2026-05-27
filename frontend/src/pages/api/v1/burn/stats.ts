/**
 * GET /api/v1/burn/stats
 * Protocol burn statistics (alias used by stats page).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const [burnedRaw, lastBurnRaw] = await Promise.all([
            kvGet('stats:total_burned'),
            kvGet('stats:last_burn_at'),
        ]);

        const total_burned     = burnedRaw  ? parseFloat(burnedRaw)  : 0;
        const last_burn_at     = lastBurnRaw || null;
        const burn_rate_daily  = 0; // activates after contract deploy

        return res.status(200).json({
            total_burned,
            burn_rate_daily,
            burn_rate_pct:   2,
            last_burn_at,
            effective_supply: 1_000_000_000 - total_burned,
            note:            'Burns activate after TON contract deployment.',
            timestamp:       Date.now(),
        });
    } catch (err: any) {
        console.error('[burn/stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
