/**
 * Compatibility alias. Model installation is a node-owner action, never a
 * server-side request to a caller-selected Ollama URL.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import pullModel from '../nodes/pull-model';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    // The canonical handler authenticates the session and checks node ownership.
    return pullModel({ method: req.method, headers: req.headers, body: { ...body, model: body.model ?? body.model_id } } as NextApiRequest,res);
}
