/**
 * GET /api/v1/nodes/tools/burn-stats
 * GSTD token burn statistics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

    try {
        const burnedRaw = await kvGet('token:burned_total');
        return res.status(200).json({
            total_burned:    parseFloat(burnedRaw || '0'),
            burn_rate_daily: 0,
            last_burn_at:    null,
            note:            'Burns activate after TON contract deployment.',
            timestamp:       Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/tools/burn-stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
