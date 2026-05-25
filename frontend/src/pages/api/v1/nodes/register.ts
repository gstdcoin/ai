/**
 * POST /api/v1/nodes/register
 *
 * Called by gstdbot on startup. Stores node record in KV.
 * Node TTL: 10 minutes (heartbeat must refresh it).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';

const NODE_TTL = 600; // 10 minutes

export interface NodeRecord {
    node_id:          string;
    name:             string;
    wallet_address:   string;
    platform:         string;
    arch:             string;
    cpu_cores:        number;
    ram_mb:           number;
    gpu:              string | null;
    mode:             string;
    version:          string;
    capabilities:     string[];
    multiaddrs:       string[];
    registered_at:    string;
    last_seen:        string;
    tasks_completed:  number;
    gstd_earned:      number;
    uptime_hours:     number;
    // Live resource stats (updated every heartbeat)
    storage_free_gb?: number;
    ram_free_mb?:     number;
    gpu_vram_mb?:     number;
    bandwidth_mbps?:  number;
    cpu_score?:       number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const nodeId: string = body.node_id || body.specs?.node_id || body.name?.replace(/\s/g, '-');

        if (!nodeId) {
            return res.status(400).json({ error: 'node_id required' });
        }

        const now = new Date().toISOString();
        const specs = body.specs || body;

        // Preserve existing capabilities if the new registration doesn't provide them
        // (some node modules re-register without model lists; we must not overwrite valid caps)
        const existingRaw = await kvGet(`node:${nodeId}`);
        const existing: NodeRecord | null = existingRaw ? JSON.parse(existingRaw) : null;

        const incomingCaps: string[] = specs.capabilities?.models || specs.models || [];
        const capabilities = incomingCaps.length > 0 ? incomingCaps : (existing?.capabilities || []);

        const record: NodeRecord = {
            node_id:         nodeId,
            name:            body.name || specs.node_name || nodeId,
            wallet_address:  (req.headers['x-wallet-address'] as string) || body.wallet_address || '',
            platform:        specs.platform || 'unknown',
            arch:            specs.arch || 'unknown',
            cpu_cores:       specs.cpu_cores || specs.capabilities?.cpu_cores || 1,
            ram_mb:          specs.ram || specs.ram_total_mb || 0,
            gpu:             specs.gpu || null,
            mode:            specs.mode || 'cloud',
            version:         specs.version || body.node_version || '3.0',
            capabilities,
            multiaddrs:      specs.multiaddrs || [],
            registered_at:   existing?.registered_at || now,
            last_seen:       now,
            tasks_completed: existing?.tasks_completed || 0,
            gstd_earned:     existing?.gstd_earned     || 0,
            uptime_hours:    existing?.uptime_hours    || 0,
        };

        await kvSet(`node:${nodeId}`, JSON.stringify(record), NODE_TTL);
        await kvIncr('stats:total_registered');

        return res.status(200).json({
            ok: true,
            node_id: nodeId,
            registered_at: now,
            ttl_seconds: NODE_TTL,
        });
    } catch (err: any) {
        console.error('[register]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
