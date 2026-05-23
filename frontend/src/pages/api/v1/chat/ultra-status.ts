/**
 * GET /api/v1/chat/ultra-status
 * Returns available models and network status for the chat UI.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const [nodeKeys, totalCompleted] = await Promise.all([
        kvKeys('node:'),
        kvGet('stats:total_tasks_completed'),
    ]).catch(() => [[], null] as [string[], null]);

    const hasGroq = !!process.env.GROQ_API_KEY;

    return res.status(200).json({
        status:       'online',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',  provider: 'groq',   free: true,  active: hasGroq },
            { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B',   provider: 'groq',   free: true,  active: hasGroq },
            { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B',   provider: 'groq',   free: true,  active: hasGroq },
            { id: 'gemma2-9b-it',            name: 'Gemma 2 9B',     provider: 'groq',   free: true,  active: hasGroq },
        ],
        swarm_devices:  Array.isArray(nodeKeys) ? nodeKeys.length : 0,
        workers_gstd:   0,
        tasks_served:   parseInt(totalCompleted || '0', 10),
        groq_enabled:   hasGroq,
    });
}
