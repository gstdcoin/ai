/**
 * GET /api/v1/nodes/rewards/leaderboard?period=week|month|all
 * Leaderboard ranked by GSTD earned.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const nodeKeys = await kvKeys('node:');
        const entries = (
            await Promise.all(
                nodeKeys.slice(0, 100).map(async (key) => {
                    const raw = await kvGet(key);
                    if (!raw) return null;
                    try { return JSON.parse(raw); } catch { return null; }
                })
            )
        )
            .filter(Boolean)
            .map((n: any, idx: number) => ({
                rank:        idx + 1,
                node_id:     n.node_id,
                name:        n.name || n.node_id,
                wallet:      n.wallet_address || n.operator_wallet || '',
                tasks_done:  n.tasks_completed || 0,
                gstd_earned: n.total_earned || 0,
                uptime_pct:  n.uptime_pct || 99,
                is_online:   (Date.now() - new Date(n.last_seen || 0).getTime()) < 600_000,
            }))
            .sort((a, b) => b.gstd_earned - a.gstd_earned)
            .map((e, idx) => ({ ...e, rank: idx + 1 }));

        return res.status(200).json({ leaderboard: entries, total: entries.length, period: req.query.period || 'all' });
    } catch (err: any) {
        console.error('[nodes/rewards/leaderboard]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
