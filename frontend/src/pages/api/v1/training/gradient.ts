/**
 * POST /api/v1/training/gradient
 *
 * Fine-tuning is paused pending isolated worker sandboxing and settlement verification.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(410).json({
        error: 'training_disabled',
        message: 'Gradient submissions are disabled until fine-tuning workers can run in an isolated sandbox.',
    });
}
