/**
 * POST /api/v1/tasks/fail
 * Called by gstdbot when a task could not be completed.
 * Records the failure for diagnostics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvRecordAssignedTaskFailure } from '../../../../lib/kv';
import { requireNodeSignature } from '../../../../lib/nodeAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { task_id: taskId, node_id: nodeId } = req.body ?? {};
    const wallet = req.headers['x-wallet-address'];
    if (typeof taskId !== 'string' || !taskId.trim() || taskId.length > 200
        || typeof nodeId !== 'string' || !nodeId.trim() || nodeId.length > 200
        || typeof wallet !== 'string' || !wallet.trim()) {
        return res.status(400).json({ error: 'invalid_failure_report' });
    }
    try {
        const auth = await requireNodeSignature(nodeId, req.headers);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        const status = await kvRecordAssignedTaskFailure(taskId, nodeId, wallet.trim().toLowerCase());
        if (status === 'invalid') return res.status(409).json({ error: 'task_not_assigned' });
        return res.status(200).json({ ok: true, duplicate: status === 'duplicate' });
    } catch {
        console.error('[tasks/fail] Unable to record failure report');
        return res.status(503).json({ error: 'failure_report_unavailable' });
    }
}
