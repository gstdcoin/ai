/**
 * POST /api/v1/tasks/submit
 *
 * Submit a task to the distributed queue.
 * Any node polling /tasks/poll will pick it up.
 *
 * Body: { type, payload, priority? }
 *   type:    'inference' | 'embed' | 'naas' | 'custom'
 *   payload: task-specific data (model, prompt, chain, etc.)
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvPush, kvLLen, kvIncr } from '../../../../lib/kv';
import { randomBytes } from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;

        if (!body.type || !body.payload) {
            return res.status(400).json({ error: 'type and payload required' });
        }

        const task = {
            task_id:    randomBytes(8).toString('hex'),
            type:       body.type,
            payload:    body.payload,
            priority:   body.priority || 1,
            created_at: new Date().toISOString(),
        };

        await kvPush('tasks:queue', JSON.stringify(task));
        await kvIncr('stats:total_tasks_submitted');

        const queue_length = await kvLLen('tasks:queue');

        return res.status(200).json({ ok: true, task_id: task.task_id, queue_length });
    } catch (err: any) {
        console.error('[tasks/submit]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
