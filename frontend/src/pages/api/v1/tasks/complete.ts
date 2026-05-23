/**
 * POST /api/v1/tasks/complete
 *
 * Called by gstdbot after finishing a task.
 * Updates node earnings and global stats.
 *
 * Body: { node_id, task_id, result?, gstd_earned?, tasks_completed? }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';
import type { NodeRecord } from '../nodes/register';

const NODE_TTL = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const nodeId: string = body.node_id || (req.headers['x-node-id'] as string);

        if (!nodeId) {
            return res.status(400).json({ error: 'node_id required' });
        }

        const raw = await kvGet(`node:${nodeId}`);
        if (raw) {
            const record: NodeRecord = JSON.parse(raw);
            record.tasks_completed = (record.tasks_completed || 0) + 1;
            record.gstd_earned     = (record.gstd_earned || 0) + (body.gstd_earned || 0);
            record.last_seen       = new Date().toISOString();
            await kvSet(`node:${nodeId}`, JSON.stringify(record), NODE_TTL);
        }

        await kvIncr('stats:total_tasks_completed');

        return res.status(200).json({ ok: true, task_id: body.task_id });
    } catch (err: any) {
        console.error('[tasks/complete]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
