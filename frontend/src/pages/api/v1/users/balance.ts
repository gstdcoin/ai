/**
 * GET /api/v1/users/balance
 *
 * Returns GSTD balance for the wallet identified by the X-Session-Token
 * header set after POST /api/v1/users/login. Shares the same `balance:*`
 * KV key used by loans/create.ts, loans/repay.ts and the Telegram bot, so
 * a wallet's balance is consistent across every surface.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const sessionToken = req.headers['x-session-token'] as string | undefined;
    if (!sessionToken) return res.status(401).json({ error: 'Not authenticated' });

    const walletKey = await kvGet(`session:${sessionToken}`).catch(() => null);
    if (!walletKey) return res.status(401).json({ error: 'Session expired' });

    const balRaw = await kvGet(`balance:${walletKey}`).catch(() => null);

    return res.status(200).json({
        wallet: walletKey,
        ton:    0, // native TON balance isn't tracked server-side; client reads it on-chain
        gstd:   balRaw ? parseFloat(balRaw as string) : 0,
    });
}
