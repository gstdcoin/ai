/**
 * GET /api/v1/nodes/my
 *
 * Returns nodes registered to the requesting wallet.
 * Requires a verified TON wallet session.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvGet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';
import type { NodeRecord } from './register';
import { parseNodeRecords } from '../../../../lib/node-status';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const wallet = await sessionWallet(req.headers);
    if (!wallet) {
        return res.status(401).json({ error: 'Verified wallet session required' });
    }

    const requestedWallet = req.query.wallet ?? req.query.wallet_address;
    if (requestedWallet !== undefined) {
        if (typeof requestedWallet !== 'string' || !requestedWallet.trim()) {
            return res.status(400).json({ error: 'wallet query param must be a single address' });
        }
        if (requestedWallet.trim().toLowerCase() !== wallet) {
            return res.status(403).json({ error: 'Wallet does not match the authenticated session' });
        }
    }

    try {
        const keys = (await kvKeys('node:')).filter(k => !k.slice(5).includes(':'));
        const nodeRaws = await Promise.all(keys.map(k => kvGet(k)));

        const myNodes = parseNodeRecords<NodeRecord>(nodeRaws)
            .filter(n => typeof n.wallet_address === 'string' && n.wallet_address.toLowerCase() === wallet);

        return res.status(200).json({
            nodes: myNodes,
            total: myNodes.length,
        });
    } catch (err: any) {
        console.error('[nodes/my]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
