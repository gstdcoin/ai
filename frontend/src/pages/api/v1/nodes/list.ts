/**
 * GET /api/v1/nodes/list
 * GET /api/v1/nodes/peers  (alias)
 *
 * Returns all active nodes (seen within 10 min).
 * Used by dashboard, landing page stats, and gstdbot peer discovery.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet, kvSet } from '../../../../lib/kv';
import { dedupeNodeRecords, isNodeOnline } from '../../../../lib/node-status';
import type { NodeRecord } from './register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Filter out sub-keys like node:X:pull_queue — only process root node entries
        const keys = (await kvKeys('node:')).filter(k => !k.slice(5).includes(':'));

        let nodes: NodeRecord[] = [];
        if (keys.length > 0) {
            const values = await kvMGet(keys);
            nodes = values
                .filter((v): v is string => v !== null)
                .map(v => JSON.parse(v) as NodeRecord);
        }

        // Fallback: GitHub registry file (updated by tunnel.sh on each restart)
        if (nodes.length === 0) {
            try {
                const ghResp = await fetch(
                    'https://raw.githubusercontent.com/gstdcoin/ai/main/nodes-registry.json',
                    { signal: AbortSignal.timeout(4000), cache: 'no-store' }
                );
                if (ghResp.ok) {
                    const registry: any[] = await ghResp.json();
                    nodes = registry as NodeRecord[];
                }
            } catch { /* GitHub unavailable */ }
        }

        const registeredNodes = dedupeNodeRecords(nodes);
        const onlineNodes = dedupeNodeRecords(nodes.filter(node => isNodeOnline(node)));

        // Strip sensitive fields for public listing
        const public_nodes = onlineNodes.map(n => ({
            node_id:         n.node_id,
            name:            n.name,
            mode:            n.mode,
            version:         n.version,
            platform:        n.platform,
            cpu_cores:       n.cpu_cores,
            has_gpu:         !!n.gpu,
            capabilities:    n.capabilities,
            multiaddrs:      n.multiaddrs,
            node_url:        (n as any).node_url || null,
            tasks_completed: n.tasks_completed,
            gstd_earned:     n.gstd_earned || 0,
            uptime_hours:    n.uptime_hours,
            last_seen:       n.last_seen,
            is_online:       true,
        }));

        // Cache node count for heartbeat endpoint (avoids expensive KEYS scan every heartbeat)
        await kvSet('stats:nodes_online_cached', String(public_nodes.length), 300).catch(() => {});

        return res.status(200).json({
            count:      public_nodes.length,
            total_registered: registeredNodes.length,
            offline_count: registeredNodes.length - public_nodes.length,
            peers:      public_nodes,
            nodes:      public_nodes,
            timestamp:  Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/list]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
