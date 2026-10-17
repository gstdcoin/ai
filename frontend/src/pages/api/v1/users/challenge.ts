import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { kvSetNX } from '../../../../lib/kv';

const CHALLENGE_TTL_SECONDS = 5 * 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const payload = randomBytes(32).toString('hex');
    const issued = await kvSetNX(`ton-auth:challenge:${payload}`, '1', CHALLENGE_TTL_SECONDS);
    if (!issued) return res.status(503).json({ error: 'Could not create wallet challenge' });

    return res.status(200).json({ payload, expires_in: CHALLENGE_TTL_SECONDS });
}
