/**
 * GET /api/v1/leaderboard
 *
 * Global node operator leaderboard ranked by tasks completed.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const allKeys = await kvKeys('node:');
        // Filter out sub-keys like node:X:pull_queue — only process root node entries
        const nodeKeys = allKeys.filter((k: string) => !k.slice(5).includes(':'));

        const nodeData = await Promise.all(
            nodeKeys.slice(0, 100).map(async (key) => {
                const raw = await kvGet(key);
                if (!raw) return null;
                try { return JSON.parse(raw); }
                catch { return null; }
            })
        );

        // Deduplicate by node_url: prefer named nodes over UUID-generated IDs
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
        const filteredNodes = nodeData.filter(Boolean) as any[];
        filteredNodes.sort((a, b) => (UUID_RE.test(a.node_id) ? 1 : 0) - (UUID_RE.test(b.node_id) ? 1 : 0));
        const seenLbUrls = new Set<string>();
        const dedupedNodes = filteredNodes.filter(n => {
            const url = n.node_url || n.multiaddrs?.[0] || '';
            if (!url) return true;
            if (seenLbUrls.has(url)) return false;
            seenLbUrls.add(url);
            return true;
        });

        const entries = dedupedNodes
            .map((node: any) => ({
                node_id:       node.node_id || node.id,
                name:          node.name || node.node_id,
                wallet:        node.wallet_address || node.operator_wallet || '',
                tasks_done:    node.tasks_completed || 0,
                gstd_earned:   node.gstd_earned || node.total_earned || 0,
                uptime_pct:    node.uptime_pct || 99.0,
                is_online:     (Date.now() - new Date(node.last_seen || 0).getTime()) < 600_000,
            }))
            .sort((a, b) => b.tasks_done - a.tasks_done)
            .slice(0, 50)
            .map((e, idx) => ({ ...e, rank: idx + 1 }));

        return res.status(200).json({ entries, total: entries.length });
    } catch (err: any) {
        console.error('[leaderboard]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
