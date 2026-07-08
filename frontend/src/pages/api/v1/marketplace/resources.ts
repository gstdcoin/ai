/**
 * GET /api/v1/marketplace/resources
 *
 * Returns aggregated resource availability across all active nodes.
 * Companies use this to understand network capacity before creating campaigns.
 *
 * Response: network-wide totals + per-node breakdown
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet } from '../../../../lib/kv';
import type { NodeRecord } from '../nodes/register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const keys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        if (keys.length === 0) {
            return res.status(200).json({
                network: { nodes: 0, storage_gb: 0, ram_gb: 0, cpu_cores: 0, gpu_nodes: 0, models: [] },
                nodes:   [],
                timestamp: Date.now(),
            });
        }

        const raws = await kvMGet(keys);
        const now  = Date.now();
        const cutoff = now - 10 * 60_000; // active in last 10 min

        const network = { nodes: 0, storage_gb: 0, ram_gb: 0, cpu_cores: 0, gpu_nodes: 0, models: new Set<string>() };
        const nodeList: any[] = [];

        for (const raw of raws) {
            if (!raw) continue;
            try {
                const node: NodeRecord & {
                    storage_free_gb?: number;
                    ram_free_mb?: number;
                    gpu_vram_mb?: number;
                    bandwidth_mbps?: number;
                } = JSON.parse(raw);

                if (new Date(node.last_seen).getTime() < cutoff) continue;

                const storageFreeGb = node.storage_free_gb || 0;
                const ramFreeMb     = node.ram_free_mb || node.ram_mb || 0;
                const gpuVramMb     = node.gpu_vram_mb || (node.gpu ? 4096 : 0);

                network.nodes++;
                network.storage_gb += storageFreeGb;
                network.ram_gb     += Math.round(ramFreeMb / 1024 * 10) / 10;
                network.cpu_cores  += node.cpu_cores || 0;
                if (node.gpu || gpuVramMb > 0) network.gpu_nodes++;
                for (const cap of node.capabilities || []) network.models.add(cap);

                nodeList.push({
                    node_id:        node.node_id,
                    name:           node.name,
                    mode:           node.mode,
                    platform:       node.platform,
                    arch:           node.arch,
                    cpu_cores:      node.cpu_cores,
                    ram_free_mb:    ramFreeMb,
                    storage_free_gb: storageFreeGb,
                    gpu:            node.gpu || null,
                    gpu_vram_mb:    gpuVramMb,
                    bandwidth_mbps: node.bandwidth_mbps || 0,
                    capabilities:   node.capabilities || [],
                    tasks_completed: node.tasks_completed || 0,
                    last_seen:      node.last_seen,
                });
            } catch { /* skip malformed */ }
        }

        return res.status(200).json({
            network: {
                nodes:      network.nodes,
                storage_gb: Math.round(network.storage_gb * 10) / 10,
                ram_gb:     Math.round(network.ram_gb * 10) / 10,
                cpu_cores:  network.cpu_cores,
                gpu_nodes:  network.gpu_nodes,
                models:     Array.from(network.models),
            },
            nodes:     nodeList,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[marketplace/resources]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
