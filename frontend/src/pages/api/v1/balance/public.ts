/**
 * GET /api/v1/balance/public?wallet=<address>
 * Public GSTD balance for a wallet (from Redis cache, updated by on-chain indexer).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.query;
    if (!wallet || typeof wallet !== 'string') {
        return res.status(400).json({ error: 'wallet query param required' });
    }

    try {
        const balanceRaw = await kvGet(`balance:${wallet.toLowerCase()}`);
        const stakedRaw  = await kvGet(`staked:${wallet.toLowerCase()}`);

        return res.status(200).json({
            wallet,
            balance_gstd: balanceRaw ? parseFloat(balanceRaw) : 0,
            staked_gstd:  stakedRaw  ? parseFloat(stakedRaw)  : 0,
            note:         !balanceRaw ? 'Balance tracking activates after TON contract deployment.' : null,
            timestamp:    Date.now(),
        });
    } catch (err: any) {
        console.error('[balance/public]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
