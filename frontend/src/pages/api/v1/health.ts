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
import { logger } from '../../../lib/logger';

const START_TIME = Date.now();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');

    let kvOk = false;
    let kvError: string | undefined;
    try {
        await kvGet('health:ping');
        kvOk = true;
    } catch (error) {
        logger.error('Health check failed to reach Upstash Redis', error);
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        kvError = error instanceof Error ? error.name : 'UnknownError';
        if (error instanceof Error && error.message === 'Upstash Redis credentials are required in production') {
            kvError = 'missing_credentials';
        } else if (message.includes('fetch failed') || message.includes('network')) {
            kvError = 'network_error';
        } else if (message.includes('timeout') || message.includes('timed out')) {
            kvError = 'timeout';
        } else if (error !== null && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
            kvError = `upstream_http_${error.status}`;
        }
        kvOk = false;
    }

    const status = kvOk ? 'ok' : 'degraded';
    const code   = kvOk ? 200  : 503;

    return res.status(code).json({
        status,
        version: process.env.npm_package_version || '1.0.0',
        uptime_ms: Date.now() - START_TIME,
        kv: kvOk ? 'ok' : 'error',
        ...(kvError ? { kv_error: kvError } : {}),
        ts: new Date().toISOString(),
    });
}
