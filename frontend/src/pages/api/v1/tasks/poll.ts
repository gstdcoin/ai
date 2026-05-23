/**
 * POST /api/v1/tasks/poll
 *
 * Called by gstdbot every 30s.
 * Returns the next queued task for this node (if any).
 * Task is removed from queue on pop (at-most-once delivery).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvPop } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const raw = await kvPop('tasks:queue');
        if (!raw) {
            return res.status(200).json({ task: null });
        }

        const task = JSON.parse(raw);
        return res.status(200).json({ task });
    } catch (err: any) {
        console.error('[tasks/poll]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
