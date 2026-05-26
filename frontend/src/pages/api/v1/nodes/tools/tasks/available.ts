/**
 * GET /api/v1/nodes/tools/tasks/available
 * Task types available for node operators to process.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const queueDepthRaw = await kvGet('tasks:queue_depth');
        const queueDepth = parseInt(queueDepthRaw || '0', 10);

        return res.status(200).json({
            tasks: [
                { type: 'llm_inference',   label: 'LLM Inference',    reward_gstd: 0.05, queue: queueDepth, requires: ['llama3.2:3b'] },
                { type: 'embedding',       label: 'Embeddings',       reward_gstd: 0.01, queue: 0,          requires: ['nomic-embed-text'] },
                { type: 'image_caption',   label: 'Image Captioning', reward_gstd: 0.10, queue: 0,          requires: ['llava'] },
                { type: 'code_review',     label: 'Code Review',      reward_gstd: 0.15, queue: 0,          requires: ['llama3.2:3b'] },
            ],
            total_queue: queueDepth,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[nodes/tools/tasks/available]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
