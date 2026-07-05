/**
 * GET /api/v1/tasks/worker/pending?node_id=...
 *
 * Called by gstd-a2a SDK (GSTDClient.get_pending_tasks).
 * Returns tasks the node is capable of handling.
 *
 * Node capabilities are read from KV (node:{node_id}) so
 * the node doesn't need to re-send them on every poll.
 *
 * Response: { tasks: [...] }  (list, may be empty)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvPop, kvPush } from '../../../../../lib/kv';
import type { NodeRecord } from '../../nodes/register';

const SCAN_DEPTH = 20;

function nodeCanHandle(task: any, caps: string[], resources: Record<string, number>): boolean {
    const required: string[] = task.required_caps || [];
    for (const cap of required) {
        if (!caps.includes(cap)) return false;
    }
    const minR = task.min_resources || {};
    if (minR.storage_gb  && (resources.storage_free_gb || 0) < minR.storage_gb)  return false;
    if (minR.ram_mb      && (resources.ram_free_mb     || 0) < minR.ram_mb)      return false;
    if (minR.gpu_vram_mb && (resources.gpu_vram_mb     || 0) < minR.gpu_vram_mb) return false;
    return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const nodeId = (req.query.node_id as string) || '';

        // Look up node capabilities from registry
        let caps: string[] = [];
        let resources: Record<string, number> = {};

        if (nodeId) {
            const raw = await kvGet(`node:${nodeId}`);
            if (raw) {
                const record: NodeRecord = JSON.parse(raw);
                caps = record.capabilities || [];
                resources = {
                    storage_free_gb: record.storage_free_gb ?? 10,
                    ram_free_mb:     record.ram_free_mb     ?? 2048,
                    gpu_vram_mb:     record.gpu_vram_mb     ?? 0,
                    cpu_cores:       record.cpu_cores       ?? 1,
                };
            }
        }

        // Check node-specific priority queue first (O(1))
        if (nodeId) {
            const raw = await kvPop(`tasks:inference:${nodeId}`);
            if (raw) {
                let task: any;
                try { task = JSON.parse(raw); } catch { /* skip */ }
                if (task) return res.status(200).json({ tasks: [task] });
            }
        }

        // Scan general queue
        const skipped: any[] = [];
        let picked: any = null;

        for (let i = 0; i < SCAN_DEPTH; i++) {
            const raw = await kvPop('tasks:queue');
            if (!raw) break;

            let task: any;
            try { task = JSON.parse(raw); } catch { continue; }

            if (!picked && nodeCanHandle(task, caps, resources)) {
                picked = task;
            } else {
                skipped.push(task);
            }
        }

        // Requeue skipped tasks (preserve FIFO)
        for (let i = skipped.length - 1; i >= 0; i--) {
            await kvPush('tasks:queue', JSON.stringify(skipped[i]));
        }

        return res.status(200).json({ tasks: picked ? [picked] : [] });
    } catch (err: any) {
        console.error('[tasks/worker/pending]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
