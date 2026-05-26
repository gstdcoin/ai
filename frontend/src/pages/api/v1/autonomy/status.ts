/**
 * GET /api/v1/autonomy/status
 * Quick autonomy system status for OpenClaw panel.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    return res.status(200).json({
        active:      false,
        departments: 9,
        mode:        'standby',
        timestamp:   Date.now(),
    });
}
