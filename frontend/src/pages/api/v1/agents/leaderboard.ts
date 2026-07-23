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
        const rootKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        const agentData = await Promise.all(
            rootKeys.slice(0, 50).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try { return JSON.parse(raw); }
                catch { return null; }
            })
        );

        // Deduplicate by URL; prefer named nodes over UUID IDs
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        const allNodes = agentData.filter(Boolean) as any[];
        allNodes.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
        const seen = new Set<string>();
        const deduped = allNodes.filter(n => {
            const url = n.node_url || n.multiaddrs?.[0] || '';
            if (!url) return true;
            if (seen.has(url)) return false;
            seen.add(url); return true;
        });

        const agents = deduped
            .map((node: any, idx: number) => {
                const gstdEarned = node.gstd_earned || node.total_earned || 0;
                return {
                    rank:              idx + 1,
                    agent_id:          node.node_id || node.id || `agent-${idx}`,
                    name:              node.name || node.node_id || `Agent #${idx + 1}`,
                    tier:              getTier(gstdEarned),
                    total_earned_gstd: gstdEarned,
                    tasks_completed:   node.tasks_completed || 0,
                    uptime_pct:        node.uptime_pct ?? null,
                    capabilities:      node.capabilities || [],
                    online:            (Date.now() - new Date(node.last_seen || 0).getTime()) < 600_000,
                };
            })
            .sort((a, b) => b.tasks_completed - a.tasks_completed)
            .map((a, idx) => ({ ...a, rank: idx + 1 }));

        return res.status(200).json({ agents, total: agents.length });
    } catch (err: any) {
        console.error('[agents/leaderboard]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}

function getTier(gstdEarned: number): string {
    if (gstdEarned >= 10000) return 'sovereign';
    if (gstdEarned >= 2000)  return 'titan';
    if (gstdEarned >= 500)   return 'storm';
    if (gstdEarned >= 50)    return 'flame';
    return 'spark';
}
