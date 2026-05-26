/**
 * GET /api/v1/autonomy/ai/history
 * AI operator decision history log.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const keys = await kvKeys('autonomy:action:');
        const entries = (
            await Promise.all(
                keys.slice(0, 50).map(async (k) => {
                    const raw = await kvGet(k);
                    if (!raw) return null;
                    try { return JSON.parse(raw); } catch { return null; }
                })
            )
        ).filter(Boolean);

        return res.status(200).json({
            history:   entries,
            total:     entries.length,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[autonomy/ai/history]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
