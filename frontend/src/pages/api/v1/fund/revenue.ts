/**
 * GET /api/v1/fund/revenue
 * Revenue breakdown by stream — shows where fund income comes from.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    try {
        const [inferenceRaw, storageRaw, computeRaw, relayRaw, stakingRaw, bridgeRaw] = await Promise.all([
            kvGet('revenue:inference'),
            kvGet('revenue:storage'),
            kvGet('revenue:compute'),
            kvGet('revenue:relay'),
            kvGet('revenue:staking_fees'),
            kvGet('revenue:bridge'),
        ]);

        const parse = (v: string | null) => v ? parseFloat(v) : 0;

        const streams = {
            inference_gstd:     parse(inferenceRaw),
            storage_gstd:       parse(storageRaw),
            compute_gstd:       parse(computeRaw),
            relay_gstd:         parse(relayRaw),
            staking_fees_gstd:  parse(stakingRaw),
            bridge_gstd:        parse(bridgeRaw),
        };

        const total = Object.values(streams).reduce((s, v) => s + v, 0);

        return res.status(200).json({
            total_gstd: total,
            streams,
            fund_share_gstd: parseFloat((total * 0.15).toFixed(4)),
            fund_share_pct:  15,
            period:          '30d',
            note:            'Revenue tracking activates after TON contract deployment.',
            timestamp:       Date.now(),
        });
    } catch (err: any) {
        console.error('[fund/revenue]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
