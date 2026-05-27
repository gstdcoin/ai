/**
 * GET /api/v1/queue/stats
 * Task queue depth and processing metrics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');

    try {
        const [pendingRaw, completedRaw, failedRaw] = await Promise.all([
            kvGet('queue:pending_count'),
            kvGet('stats:total_tasks_completed'),
            kvGet('stats:total_tasks_failed'),
        ]);

        // Count live task keys
        const taskKeys = await kvKeys('task:pending:').catch(() => [] as string[]);

        return res.status(200).json({
            pending:        taskKeys.length || (pendingRaw ? parseInt(pendingRaw as string) : 0),
            completed:      completedRaw ? parseInt(completedRaw as string) : 0,
            failed:         failedRaw    ? parseInt(failedRaw    as string) : 0,
            avg_wait_ms:    0,
            avg_process_ms: 0,
            timestamp:      Date.now(),
        });
    } catch (err: any) {
        console.error('[queue/stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
