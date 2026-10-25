/**
 * GET /api/v1/nodes/update/check?version=x.y.z
 * Tells a node client whether a newer release exists on gstdbot/main.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { nodeUpdateInfo } from '../../../../../lib/nodeUpdate';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=300');
    const version = typeof req.query.version === 'string' ? req.query.version.slice(0, 32) : undefined;
    return res.status(200).json(await nodeUpdateInfo(version, 3000));
}
