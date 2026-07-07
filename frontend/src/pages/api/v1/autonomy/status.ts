/**
 * GET /api/v1/autonomy/status
 * Quick autonomy system status — reads real KV metrics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const [tasks, gstd, jobs] = await Promise.all([
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_gstd_paid'),
            kvGet('stats:training_jobs_submitted'),
        ]);

        const tasksDone = parseInt(tasks || '0', 10);
        const gstdPaid  = parseFloat(gstd || '0');
        const isActive  = tasksDone > 0 || gstdPaid > 0;

        return res.status(200).json({
            active:           isActive,
            departments:      9,
            mode:             isActive ? 'operating' : 'standby',
            tasks_completed:  tasksDone,
            gstd_distributed: gstdPaid,
            training_jobs:    parseInt(jobs || '0', 10),
            timestamp:        Date.now(),
        });
    } catch {
        return res.status(200).json({ active: false, departments: 9, mode: 'standby', timestamp: Date.now() });
    }
}
