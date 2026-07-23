/**
 * GET /api/v1/agents/marketplace
 *
 * Lists agents available for hire / task routing.
 * Returns nodes that are currently online and accepting tasks.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');

    try {
        const rootKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        const now = Date.now();
        const agentData = await Promise.all(
            rootKeys.slice(0, 100).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try { return JSON.parse(raw); }
                catch { return null; }
            })
        );

        // Deduplicate by node_url; prefer named over UUID-generated IDs
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        const allNodes = agentData.filter(Boolean) as any[];
        allNodes.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
        const seenUrls = new Set<string>();
        const deduped = allNodes.filter(n => {
            const url = n.node_url || n.multiaddrs?.[0] || '';
            if (!url) return true;
            if (seenUrls.has(url)) return false;
            seenUrls.add(url); return true;
        });

        const agents = deduped
            .filter((node: any) => (now - new Date(node.last_seen || 0).getTime()) < 600_000)
            .map((node: any) => {
                const gstdEarned = node.gstd_earned || node.total_earned || 0;
                return {
                    agent_id:            node.node_id || node.id,
                    name:                node.name || node.node_id,
                    description:         node.description || 'General-purpose GSTD compute node',
                    capabilities:        node.capabilities || ['inference', 'compute'],
                    tier:                getTier(gstdEarned),
                    tasks_completed:     node.tasks_completed || 0,
                    average_rating:      node.rating ?? null,
                    price_per_task_gstd: node.price_per_task_gstd ?? null,
                    online:              true,
                };
            });

        return res.status(200).json({ agents, total: agents.length });
    } catch (err: any) {
        console.error('[agents/marketplace]', err.message);
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
