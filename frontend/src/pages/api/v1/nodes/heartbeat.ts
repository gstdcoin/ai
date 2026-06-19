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
import { kvGet, kvSet, kvIncr, kvKeys, kvDel } from '../../../../lib/kv';
import { rateLimit, getClientIp } from '../../../../lib/ratelimit';
import type { NodeRecord } from './register';

const NODE_TTL = 600;
const NODE_ID_RE = /^[a-zA-Z0-9_.-]{4,64}$/;

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

        if (!nodeId || !NODE_ID_RE.test(nodeId)) {
            return res.status(400).json({ error: 'node_id required (4-64 alphanumeric chars)' });
        }

        // Rate limit per node_id so multiple nodes behind the same NAT don't share the limit
        const ip = getClientIp(req.headers as any);
        if (!rateLimit(`hb:${nodeId}`, 10, 60_000)) {
            return res.status(429).json({ error: 'Too many heartbeats from this node' });
        }
        // Secondary IP-level guard against node_id spoofing floods
        if (!rateLimit(`hb_ip:${ip}`, 120, 60_000)) {
            return res.status(429).json({ error: 'Too many heartbeats from this IP' });
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
        if (body.multiaddrs?.length)    record.multiaddrs  = body.multiaddrs;
        if (body.capabilities?.length)  record.capabilities = body.capabilities;
        if (body.mode)                  record.mode         = body.mode;
        if (body.node_url)              (record as any).node_url = body.node_url;
        // Resource stats — enables marketplace matching + locality scoring
        if (body.storage_free_gb != null) (record as any).storage_free_gb = Number(body.storage_free_gb);
        if (body.ram_free_mb     != null) (record as any).ram_free_mb     = Number(body.ram_free_mb);
        if (body.gpu_vram_mb     != null) (record as any).gpu_vram_mb     = Number(body.gpu_vram_mb);
        if (body.bandwidth_mbps  != null) (record as any).bandwidth_mbps  = Number(body.bandwidth_mbps);
        if (body.cpu_score       != null) (record as any).cpu_score       = Number(body.cpu_score);
        // models_loaded: list of Ollama models hot in RAM — used for locality-aware routing
        if (Array.isArray(body.models_loaded) && body.models_loaded.length > 0) {
            record.capabilities = body.models_loaded;
        }

        // Also cache the node_url for fast lookup by completions endpoint
        const nodeUrlForCache = body.node_url || body.multiaddrs?.[0] || '';
        const writeOps: Promise<any>[] = [
            kvSet(`node:${nodeId}`, JSON.stringify(record), NODE_TTL),
            kvKeys('node:'),
            kvIncr('stats:total_heartbeats'),
        ];
        if (nodeUrlForCache) {
            writeOps.push(kvSet(`node_url:${nodeId}`, nodeUrlForCache, NODE_TTL));
        }
        const [, nodesKeys] = await Promise.all(writeOps);
        const peers_online = Array.isArray(nodesKeys) ? nodesKeys.length : 0;
        // Keep stats:nodes_online_cached fresh for /api/v1/ecosystem/features
        kvSet('stats:nodes_online_cached', String(peers_online), 120).catch(() => {});

        // Read and return pull_queue so node can download new models
        let pull_queue: string[] = [];
        const queueKey = `node:${nodeId}:pull_queue`;
        try {
            const queueRaw = await kvGet(queueKey);
            if (queueRaw) {
                pull_queue = JSON.parse(queueRaw as string);
                // Clear queue after delivery (node will pull and report back via capabilities)
                if (pull_queue.length > 0) await kvDel(queueKey);
            }
        } catch { pull_queue = []; }

        return res.status(200).json({
            ok:           true,
            peers_online,
            active_nodes: peers_online,
            reward:       0,
            commands:     [],
            pull_queue,
            timestamp:    Date.now(),
        });
    } catch (err: any) {
        console.error('[heartbeat]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
