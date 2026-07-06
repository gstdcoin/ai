/**
 * POST /api/v1/tasks/poll
 *
 * Called by gstdbot. Returns the best-fit task for this node.
 * Tasks are matched by: capabilities, resource requirements, priority.
 *
 * Body: {
 *   node_id:       string
 *   capabilities:  string[]
 *   resources:     { storage_free_gb, ram_free_mb, cpu_cores, gpu_vram_mb }
 *   max_tasks?:    number
 *   priority_only?: boolean  — if true, only check node-specific inference queue (fast)
 * }
 *
 * Priority queue (checked first): tasks:inference:{node_id} — pushed by completions.ts
 * General queue: tasks:queue — scanned up to SCAN_DEPTH tasks
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvPop, kvPush } from '../../../../lib/kv';

const SCAN_DEPTH = 20; // max tasks to inspect before giving up

function nodeCanHandle(task: any, caps: string[], resources: any): boolean {
    // Check required capabilities
    const requiredCaps: string[] = task.required_caps || [];
    for (const cap of requiredCaps) {
        if (!caps.includes(cap)) return false;
    }

    // Check resource minimums
    const minR = task.min_resources || {};
    if (minR.storage_gb  && (resources.storage_free_gb || 0) < minR.storage_gb)  return false;
    if (minR.ram_mb      && (resources.ram_free_mb     || 0) < minR.ram_mb)      return false;
    if (minR.cpu_cores   && (resources.cpu_cores       || 0) < minR.cpu_cores)   return false;
    if (minR.gpu_vram_mb && (resources.gpu_vram_mb     || 0) < minR.gpu_vram_mb) return false;

    return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body                = req.body as any;
        const nodeId: string      = body.node_id      || '';
        const caps:   string[]    = body.capabilities || [];
        const resources           = body.resources    || {};
        const priorityOnly: boolean = !!body.priority_only;

        // ── Node identity check ───────────────────────────────────────────
        if (!nodeId) return res.status(400).json({ error: 'node_id required' });
        const { kvGet } = await import('../../../../lib/kv');
        const nodeRaw = await kvGet(`node:${nodeId}`);
        if (!nodeRaw) return res.status(403).json({ error: 'Unknown node — register first' });
        const storedWallet: string = (JSON.parse(nodeRaw) as any).wallet_address || '';
        const headerWallet: string = (req.headers['x-wallet-address'] as string || '').trim();
        if (storedWallet && headerWallet && storedWallet !== headerWallet) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }

        // ── Priority queue: node-specific inference tasks (fast O(1)) ──────
        if (nodeId) {
            const raw = await kvPop(`tasks:inference:${nodeId}`);
            if (raw) {
                let task: any;
                try { task = JSON.parse(raw); } catch { /* malformed */ }
                if (task) return res.status(200).json({ task, source: 'priority' });
            }
        }

        // If priority_only, stop here — don't scan general queue
        if (priorityOnly) {
            return res.status(200).json({ task: null });
        }

        // ── General queue: scan up to SCAN_DEPTH tasks ────────────────────
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

        // Requeue skipped tasks in original order (push to back → FIFO preserved)
        for (let i = skipped.length - 1; i >= 0; i--) {
            await kvPush('tasks:queue', JSON.stringify(skipped[i]));
        }

        return res.status(200).json({ task: picked || null });
    } catch (err: any) {
        console.error('[tasks/poll]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
