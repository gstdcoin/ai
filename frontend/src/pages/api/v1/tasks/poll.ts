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
import { kvGet, kvPop, kvPush } from '../../../../lib/kv';
import { assignTaskToNode } from '../../../../lib/task-assignment';
import { maybeCreateVerifyProbe } from '../../../../lib/verifyProbe';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import { supportsTaskKind } from '../../../../lib/taskKinds';

const SCAN_DEPTH = 20; // max tasks to inspect before giving up
const ASSIGNMENT_TTL = 3600;

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
        const supportedTaskKinds: string[] = Array.isArray(body.supported_task_kinds)
            ? body.supported_task_kinds.filter((kind: unknown): kind is string => typeof kind === 'string')
            : [];
        const resources           = body.resources    || {};
        const priorityOnly: boolean = !!body.priority_only;

        // ── Node identity check ───────────────────────────────────────────
        if (!nodeId) return res.status(400).json({ error: 'node_id required' });
        const nodeRaw = await kvGet(`node:${nodeId}`);
        if (!nodeRaw) return res.status(403).json({ error: 'Unknown node — register first' });
        const storedWallet: string = (JSON.parse(nodeRaw) as any).wallet_address || '';
        if (!storedWallet.trim()) return res.status(403).json({ error: 'Wallet required for paid task assignments' });
        const headerWallet: string = ((req.headers['x-wallet-address'] as string) || '').trim().toLowerCase();
        if (storedWallet && storedWallet.trim().toLowerCase() !== headerWallet) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
        const auth = await requireNodeSignature(nodeId, req.headers as any);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

        // ── Priority queue: node-specific inference tasks (fast O(1)) ──────
        if (nodeId) {
            const raw = await kvPop(`tasks:inference:${nodeId}`);
            if (raw) {
                let task: any;
                try { task = JSON.parse(raw); } catch { /* malformed */ }
                if (task) {
                    try {
                        if (supportsTaskKind(task, supportedTaskKinds)
                            && await assignTaskToNode(task, nodeId, ASSIGNMENT_TTL)) {
                            return res.status(200).json({ task, source: 'priority' });
                        }
                        if (!supportsTaskKind(task, supportedTaskKinds)) {
                            await kvPush(`tasks:inference:${nodeId}`, raw);
                        }
                    } catch (error) {
                        await kvPush(`tasks:inference:${nodeId}`, raw);
                        throw error;
                    }
                }
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

            if (!picked
                && nodeCanHandle(task, caps, resources)
                && supportsTaskKind(task, supportedTaskKinds)) {
                picked = task;
            } else {
                skipped.push(task);
            }
        }

        // Requeue skipped tasks in original order (push to back → FIFO preserved)
        for (let i = skipped.length - 1; i >= 0; i--) {
            await kvPush('tasks:queue', JSON.stringify(skipped[i]));
        }

        // Record which node this task was handed to, so tasks/complete.ts can verify
        // the reward it's asked to pay out corresponds to a task actually assigned --
        // without this, any node_id could claim a reward for a fabricated task_id.
        if (picked) {
            try {
                if (!(await assignTaskToNode(picked, nodeId, ASSIGNMENT_TTL))) picked = null;
            } catch (error) {
                await kvPush('tasks:queue', JSON.stringify(picked));
                throw error;
            }
        }

        if (!picked) {
            const probe = await maybeCreateVerifyProbe(nodeId, caps);
            if (probe && (await assignTaskToNode(probe, nodeId, ASSIGNMENT_TTL))) {
                const visible = { ...probe };
                delete visible.expected_hash;
                return res.status(200).json({ task: visible, source: 'probe' });
            }
        }

        return res.status(200).json({ task: picked || null });
    } catch (err: any) {
        console.error('[tasks/poll]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
