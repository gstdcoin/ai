/**
 * GET /api/v1/users/pending_balance
 *
 * Returns unclaimed node-reward GSTD for the wallet identified by the
 * X-Session-Token header. Reads the same `rewards:pending:*` key used by
 * the Telegram bot's /balance command and claim_reward.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (!sessionToken) return res.status(401).json({ error: 'Not authenticated' });

    const walletKey = await kvGet(`session:${sessionToken}`).catch(() => null);
    if (!walletKey) return res.status(401).json({ error: 'Session expired' });

    const pendRaw = await kvGet(`rewards:pending:${walletKey}`).catch(() => null);

    return res.status(200).json({
        wallet:          walletKey,
        pending_balance: pendRaw ? parseFloat(pendRaw as string) : 0,
    });
}
