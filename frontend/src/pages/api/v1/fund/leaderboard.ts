/**
 * GET /api/v1/fund/leaderboard
 * Top contributors to the Golden Reserve Fund by earned rewards.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');

    const { limit = '20' } = req.query;
    const top = Math.min(100, parseInt(limit as string) || 20);

    try {
        // Read from leaderboard KV keys
        const lbKeys = await kvKeys('fund:leaderboard:').catch(() => [] as string[]);

        interface Entry { wallet: string; earned_gstd: number; rank: number; node_count: number }
        const entries: Entry[] = [];

        for (const k of lbKeys) {
            const raw = await kvGet(k).catch(() => null);
            if (!raw) continue;
            try {
                entries.push(JSON.parse(raw as string));
            } catch { /* skip */ }
        }

        entries.sort((a, b) => b.earned_gstd - a.earned_gstd);
        const ranked = entries.slice(0, top).map((e, i) => ({ ...e, rank: i + 1 }));

        return res.status(200).json({
            total_contributors: entries.length,
            leaderboard:        ranked,
            period:             'all_time',
            note:               ranked.length === 0 ? 'Leaderboard populates after first node reward claims.' : null,
            timestamp:          Date.now(),
        });
    } catch (err: any) {
        console.error('[fund/leaderboard]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
