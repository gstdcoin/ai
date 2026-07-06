/**
 * GET /api/v1/b2b/usage
 * Returns usage stats for the authenticated B2B client.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';
import { createHash } from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = (req.headers['x-api-key'] as string) || '';
    if (!apiKey) return res.status(401).json({ error: 'X-API-Key header required' });

    try {
        const keyHash = createHash('sha256').update(apiKey).digest('hex');
        const raw = await kvGet(`b2b:key:${keyHash}`);
        if (!raw) return res.status(404).json({ error: 'API key not found' });

        const profile = JSON.parse(raw);
        const usageKey = `b2b:usage:${profile.client_id}:${new Date().toISOString().slice(0, 7)}`;
        const usageRaw = await kvGet(usageKey);
        const usage = usageRaw ? JSON.parse(usageRaw) : { chains: [], total_requests: 0, total_cost_usd: 0 };

        return res.status(200).json({
            period: new Date().toISOString().slice(0, 7),
            chains: usage.chains,
            total_requests: usage.total_requests,
            total_cost_usd: usage.total_cost_usd,
        });
    } catch (err: any) {
        console.error('[b2b/usage]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
