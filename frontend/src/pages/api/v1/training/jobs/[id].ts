/**
 * GET /api/v1/training/jobs/:id — job status, progress, gradients, lora_url
 *
 * Returns full TrainingJob record including:
 *   status: pending | training | aggregating | done | failed
 *   shards_done / shards_total
 *   gradients: list of submitted gradient records from nodes
 *   lora_url: download link when done
 *   avg_metacognitive_score: quality indicator
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';
import type { TrainingJob } from '../jobs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query as { id: string };
        if (!id) return res.status(400).json({ error: 'job id required' });

        const raw = await kvGet(`training:job:${id}`);
        if (!raw) return res.status(404).json({ error: 'Job not found' });

        const job: TrainingJob = JSON.parse(raw);

        const avg_score = job.gradients.length > 0
            ? job.gradients.reduce((s, g) => s + g.metacognitive_score, 0) / job.gradients.length
            : null;

        return res.status(200).json({
            ...job,
            avg_metacognitive_score: avg_score,
            progress_pct: job.shards_total > 0
                ? Math.round(job.shards_done / job.shards_total * 100)
                : 0,
        });
    } catch (err: any) {
        console.error('[training/jobs/[id]]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
