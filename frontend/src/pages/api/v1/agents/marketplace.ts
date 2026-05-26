/**
 * GET /api/v1/agents/marketplace
 *
 * Lists agents available for hire / task routing.
 * Returns nodes that are currently online and accepting tasks.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');

    try {
        const nodeKeys = await kvKeys('node:');
        const now = Date.now() / 1000;

        const agentData = await Promise.all(
            nodeKeys.slice(0, 100).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try { return JSON.parse(raw); }
                catch { return null; }
            })
        );

        const agents = agentData
            .filter(Boolean)
            .filter((node: any) => (now - (node.last_seen || 0)) < 600)
            .map((node: any) => ({
                id:          node.node_id || node.id,
                name:        node.name || node.node_id,
                description: node.description || 'General-purpose GSTD compute node',
                wallet:      node.wallet_address || node.operator_wallet || '',
                capabilities: node.capabilities || ['inference', 'compute'],
                rating:       node.rating || 5.0,
                tasks_done:   node.tasks_completed || 0,
                gstd_earned:  node.total_earned || 0,
                tier:         getTier(node.total_earned || 0),
                is_online:    true,
                cost_per_task: '0.001 GSTD',
                models:       node.models || [],
            }));

        return res.status(200).json({ agents, total: agents.length });
    } catch (err: any) {
        console.error('[agents/marketplace]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}

function getTier(gstdEarned: number): string {
    if (gstdEarned >= 1000) return 'diamond';
    if (gstdEarned >= 100)  return 'gold';
    if (gstdEarned >= 10)   return 'silver';
    return 'bronze';
}
