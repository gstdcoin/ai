/**
 * GET /api/v1/nodes/my
 *
 * Returns nodes registered to the requesting wallet.
 * Requires X-Wallet-Address header.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet } from '../../../../lib/kv';
import type { NodeRecord } from './register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const wallet = (req.headers['x-wallet-address'] as string || req.query.wallet as string || '').trim();
    if (!wallet) {
        return res.status(400).json({ error: 'X-Wallet-Address header or wallet query param required' });
    }

    try {
        const keys = await kvKeys('node:*');
        const nodeRaws = await Promise.all(keys.map(k => kvGet(k)));

        const myNodes = nodeRaws
            .filter(Boolean)
            .map(raw => {
                try { return JSON.parse(raw!) as NodeRecord; } catch { return null; }
            })
            .filter((n): n is NodeRecord => n !== null && n.wallet_address === wallet);

        return res.status(200).json({
            nodes: myNodes,
            total: myNodes.length,
        });
    } catch (err: any) {
        console.error('[nodes/my]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
