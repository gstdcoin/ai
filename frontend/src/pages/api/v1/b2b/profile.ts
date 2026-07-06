/**
 * GET /api/v1/b2b/profile
 * Returns the B2B client profile for the given API key.
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

        const { api_key: _k, key_hash: _h, ...safe } = JSON.parse(raw);
        return res.status(200).json(safe);
    } catch (err: any) {
        console.error('[b2b/profile]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
