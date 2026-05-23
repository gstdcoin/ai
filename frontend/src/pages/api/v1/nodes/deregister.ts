/**
 * POST /api/v1/nodes/deregister
 * Called by gstdbot on graceful shutdown.
 * Removes the node record from KV immediately.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvDel } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = req.body as any;
    const nodeId: string = body.node_id || (req.headers['x-node-id'] as string);

    if (!nodeId) {
        return res.status(400).json({ error: 'node_id required' });
    }

    await kvDel(`node:${nodeId}`).catch(() => {});
    return res.status(200).json({ ok: true });
}
