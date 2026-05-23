/**
 * POST /api/v1/tasks/fail
 * Called by gstdbot when a task could not be completed.
 * Records the failure for diagnostics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvIncr } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body as any;
    console.warn('[tasks/fail] task_id=%s node=%s error=%s', body.task_id, body.node_id, body.error);
    await kvIncr('stats:total_tasks_failed').catch(() => {});

    return res.status(200).json({ ok: true });
}
