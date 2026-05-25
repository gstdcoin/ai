/**
 * GET /api/v1/nodes/list
 * GET /api/v1/nodes/peers  (alias)
 *
 * Returns all active nodes (seen within 10 min).
 * Used by dashboard, landing page stats, and gstdbot peer discovery.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet, kvSet } from '../../../../lib/kv';
import type { NodeRecord } from './register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const keys = await kvKeys('node:');

        let nodes: NodeRecord[] = [];
        if (keys.length > 0) {
            const values = await kvMGet(keys);
            nodes = values
                .filter((v): v is string => v !== null)
                .map(v => JSON.parse(v) as NodeRecord);
        }

        // Strip sensitive fields for public listing
        const public_nodes = nodes.map(n => ({
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
            uptime_hours:    n.uptime_hours,
            last_seen:       n.last_seen,
        }));

        // Cache node count for heartbeat endpoint (avoids expensive KEYS scan every heartbeat)
        await kvSet('stats:nodes_online_cached', String(nodes.length), 120).catch(() => {});

        return res.status(200).json({
            count:      nodes.length,
            peers:      public_nodes,
            nodes:      public_nodes,
            timestamp:  Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/list]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
