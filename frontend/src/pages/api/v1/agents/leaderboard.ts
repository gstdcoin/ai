/**
 * GET /api/v1/agents/leaderboard
 *
 * Returns the top agents ranked by tasks completed.
 * Agents are nodes that have completed tasks and registered via the A2A protocol.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const nodeKeys = await kvKeys('node:');

        const agentData = await Promise.all(
            nodeKeys.slice(0, 50).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try {
                    return JSON.parse(raw);
                } catch {
                    return null;
                }
            })
        );

        const agents = agentData
            .filter(Boolean)
            .map((node: any, idx: number) => ({
                rank:           idx + 1,
                id:             node.node_id || node.id || `agent-${idx}`,
                name:           node.name || node.node_id || `Agent #${idx + 1}`,
                wallet:         node.wallet_address || node.operator_wallet || '',
                tasks_done:     node.tasks_completed || 0,
                gstd_earned:    node.total_earned || 0,
                uptime_pct:     node.uptime_pct || 99.0,
                tier:           getTier(node.total_earned || 0),
                is_online:      (Date.now() - new Date(node.last_seen || 0).getTime()) < 600_000,
                joined_at:      node.registered_at || node.created_at || null,
            }))
            .sort((a, b) => b.tasks_done - a.tasks_done)
            .map((a, idx) => ({ ...a, rank: idx + 1 }));

        return res.status(200).json({ agents, total: agents.length });
    } catch (err: any) {
        console.error('[agents/leaderboard]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}

function getTier(gstdEarned: number): string {
    if (gstdEarned >= 1000) return 'diamond';
    if (gstdEarned >= 100)  return 'gold';
    if (gstdEarned >= 10)   return 'silver';
    return 'bronze';
}
