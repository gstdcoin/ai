/**
 * POST /api/v1/nodes/heartbeat
 *
 * Called by gstdbot every 3 minutes.
 * Refreshes node TTL, updates stats, returns peer count + any commands.
 *
 * Response includes:
 *   - peers_online: active node count
 *   - reward: GSTD earned this heartbeat (0 for now, platform controls this)
 *   - commands: optional array of remote commands to execute
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr, kvKeys } from '../../../../lib/kv';
import type { NodeRecord } from './register';

const NODE_TTL = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const nodeId: string =
            body.node_id ||
            (req.headers['x-node-id'] as string) ||
            body.wallet_address;

        if (!nodeId) {
            return res.status(400).json({ error: 'node_id required' });
        }

        // Read existing record only if we need to merge (tasks_completed, gstd_earned).
        // This saves a KV read when the node sends all fields itself.
        const hasFullUpdate = body.tasks_completed != null && body.gstd_earned != null && body.uptime_hours != null;
        const raw = hasFullUpdate ? null : await kvGet(`node:${nodeId}`);
        const record: NodeRecord = raw
            ? JSON.parse(raw)
            : {
                node_id:        nodeId,
                name:           body.node_name || nodeId,
                wallet_address: body.wallet_address || (req.headers['x-wallet-address'] as string) || '',
                platform:       'unknown', arch: 'unknown',
                cpu_cores: 1, ram_mb: 0, gpu: null,
                mode:           body.mode || 'cloud',
                version:        body.node_version || '3.0',
                capabilities:   [],
                multiaddrs:     body.multiaddrs || [],
                registered_at:  new Date().toISOString(),
                last_seen:      new Date().toISOString(),
                tasks_completed: 0, gstd_earned: 0, uptime_hours: 0,
            };

        // Update live fields
        record.last_seen       = new Date().toISOString();
        record.tasks_completed = body.tasks_completed ?? body.queries_served ?? record.tasks_completed;
        record.gstd_earned     = body.gstd_earned ?? record.gstd_earned;
        record.uptime_hours    = body.uptime_hours ?? record.uptime_hours;
        if (body.multiaddrs?.length) record.multiaddrs = body.multiaddrs;
        if (body.capabilities?.length) record.capabilities = body.capabilities;
        if (body.mode) record.mode = body.mode;

        // Write + increment in parallel (2 ops, no extra read)
        const [, , nodesRaw] = await Promise.all([
            kvSet(`node:${nodeId}`, JSON.stringify(record), NODE_TTL),
            kvIncr('stats:total_heartbeats'),
            kvGet('stats:nodes_online_cached'),
        ]);
        const peers_online = nodesRaw ? parseInt(nodesRaw, 10) : 0;

        return res.status(200).json({
            ok:           true,
            peers_online,
            active_nodes: peers_online,
            reward:       0,
            commands:     [],
            timestamp:    Date.now(),
        });
    } catch (err: any) {
        console.error('[heartbeat]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
