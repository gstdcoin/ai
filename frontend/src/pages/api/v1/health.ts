/**
 * GET /api/v1/health
 *
 * Health check endpoint. Used by:
 * - A2A SDK (gstd_client.py health_check())
 * - Uptime monitors
 * - Bridge validators checking platform reachability
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../lib/kv';

const START_TIME = Date.now();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');

    let kvOk = false;
    try {
        await kvGet('health:ping');
        kvOk = true;
    } catch {
        kvOk = false;
    }

    const status = kvOk ? 'ok' : 'degraded';
    const code   = kvOk ? 200  : 503;

    return res.status(code).json({
        status,
        version: process.env.npm_package_version || '1.0.0',
        uptime_ms: Date.now() - START_TIME,
        kv: kvOk ? 'ok' : 'error',
        ts: new Date().toISOString(),
    });
}
