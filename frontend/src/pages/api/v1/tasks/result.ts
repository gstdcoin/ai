/**
 * POST /api/v1/tasks/result
 *
 * Called by nodes after completing an AI inference task.
 * Stores the result so completions.ts can short-poll for it.
 *
 * Body: { task_id, node_id, result, latency_ms, model }
 *
 * GET /api/v1/tasks/result?task_id=xxx
 * Returns result if ready, or { ready: false }.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';

const RESULT_TTL = 120; // 2 min — caller picks it up or it expires

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        const body = req.body as any;
        const { task_id, node_id, result, latency_ms, model } = body;

        if (!task_id || !result) {
            return res.status(400).json({ error: 'task_id and result required' });
        }

        // Store node performance stat for routing
        if (node_id && latency_ms > 0) {
            const raw = await kvGet(`node:${node_id}`);
            if (raw) {
                const record = JSON.parse(raw);
                // Exponential moving average of latency
                const prev = record.avg_latency_ms || latency_ms;
                record.avg_latency_ms    = Math.round(prev * 0.7 + latency_ms * 0.3);
                record.tasks_completed   = (record.tasks_completed || 0) + 1;
                record.last_seen         = new Date().toISOString();
                await kvSet(`node:${node_id}`, JSON.stringify(record), 600);
            }
        }

        await kvSet(
            `task:result:${task_id}`,
            JSON.stringify({ ready: true, result, latency_ms: latency_ms || 0, node_id, model }),
            RESULT_TTL,
        );

        return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
        const taskId = req.query.task_id as string;
        if (!taskId) return res.status(400).json({ error: 'task_id required' });

        const raw = await kvGet(`task:result:${taskId}`);
        if (!raw) return res.status(200).json({ ready: false });

        return res.status(200).json(JSON.parse(raw));
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
