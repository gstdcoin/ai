/**
 * GET /api/v1/fund/status
 * Protocol Treasury — accumulates 10% of all campaign fees.
 * Funds liquidity support, GSTD buybacks, and node reward bonuses.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    try {
        const [balRaw, totalInRaw, totalOutRaw] = await Promise.all([
            kvGet('stats:protocol_treasury_gstd'),
            kvGet('fund:total_collected'),
            kvGet('fund:total_distributed'),
        ]);

        const balance           = balRaw      ? parseFloat(balRaw)      : 0;
        const total_collected   = totalInRaw  ? parseFloat(totalInRaw)  : 0;
        const total_distributed = totalOutRaw ? parseFloat(totalOutRaw) : 0;

        return res.status(200).json({
            treasury_gstd:          balance,
            total_collected_gstd:   total_collected,
            total_distributed_gstd: total_distributed,
            fee_split: {
                node_operators_pct: 90,
                protocol_treasury_pct: 10,
            },
            treasury_usage: {
                liquidity_pool_pct: 50,
                buyback_pct:        30,
                node_bonus_pct:     20,
            },
            note: 'Treasury accumulates 10% of all protocol fees. Node operators receive 90%.',
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[fund/status]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
