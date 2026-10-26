/**
 * GET /api/v1/nodes/list
 * GET /api/v1/nodes/peers  (alias)
 *
 * Returns all active nodes (seen within 10 min).
 * Used by dashboard, landing page stats, and gstdbot peer discovery.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys, kvMGet, kvSet } from '../../../../lib/kv';
import { dedupeNodeRecords, isNodeOnline, parseNodeRecords } from '../../../../lib/node-status';
import type { NodeRecord } from './register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Filter out sub-keys like node:X:pull_queue — only process root node entries
        const [keys, totalRegistered] = await Promise.all([
            kvKeys('node:').then(nodeKeys => nodeKeys.filter(k => !k.slice(5).includes(':'))),
            kvGet('stats:total_registered'),
        ]);

        let nodes: NodeRecord[] = [];
        if (keys.length > 0) {
            const values = await kvMGet(keys);
            nodes = parseNodeRecords<NodeRecord>(values);
        }

        const registeredNodes = dedupeNodeRecords(nodes);
        const onlineNodes = registeredNodes.filter(node => isNodeOnline(node));
        const totalRegisteredCount = registeredNodes.length;

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
            total_registered: totalRegisteredCount,
            registration_events: parseInt(totalRegistered || '0', 10),
            offline_count: Math.max(0, totalRegisteredCount - public_nodes.length),
            peers:      public_nodes,
            nodes:      public_nodes,
            timestamp:  Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/list]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
