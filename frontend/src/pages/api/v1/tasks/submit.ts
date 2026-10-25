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

const MAX_PAYLOAD_BYTES = 16_384;
const MAX_QUEUE_DEPTH = 500;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;

        if (!body.type || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
            return res.status(400).json({ error: 'type and payload (object) required' });
        }
        if (typeof body.type !== 'string' || !['inference', 'embed', 'naas', 'custom'].includes(body.type)) {
            return res.status(400).json({ error: 'unsupported task type' });
        }
        if (JSON.stringify(body.payload).length > MAX_PAYLOAD_BYTES) {
            return res.status(413).json({ error: 'payload too large' });
        }

        // Public submissions are unfunded: strip fields that influence rewards or training-job accounting.
        const { reward_gstd: _r, job_id: _j, shard_id: _s, ...payload } = body.payload;

        if ((await kvLLen('tasks:queue')) >= MAX_QUEUE_DEPTH) {
            return res.status(503).json({ error: 'queue full, retry later' });
        }

        const task = {
            task_id:    randomBytes(8).toString('hex'),
            type:       body.type,
            payload,
            priority:   Math.min(Math.max(Number(body.priority) || 1, 1), 10),
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
