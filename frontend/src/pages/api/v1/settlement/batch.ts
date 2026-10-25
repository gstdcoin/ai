import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(410).json({
        error: 'legacy_settlement_disabled',
        message: 'Caller-submitted reward events are not accepted. Rewards are accrued only from server-issued task assignments.',
    });
}
