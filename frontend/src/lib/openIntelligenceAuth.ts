import { timingSafeEqual } from 'crypto';
import type { NextApiRequest } from 'next';

export function isValidOpenIntelligenceCronRequest(
    req: Pick<NextApiRequest, 'headers'>,
    secret = process.env.OPEN_INTELLIGENCE_CRON_SECRET || '',
): boolean {
    if (!secret) return false;
    const authorization = req.headers.authorization || '';
    const expected = `Bearer ${secret}`;
    if (authorization.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
