/**
 * POST /api/v1/nodes/deregister
 * Called by gstdbot on graceful shutdown.
 * Removes the node record from KV — wallet ownership verified.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvDel } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body         = req.body as any;
    const nodeId:string = body.node_id || (req.headers['x-node-id'] as string) || '';
    const headerWallet = ((req.headers['x-wallet-address'] as string) || '').trim().toLowerCase();

    if (!nodeId) return res.status(400).json({ error: 'node_id required' });
    if (!headerWallet) return res.status(401).json({ error: 'X-Wallet-Address header required' });

    const nodeRaw = await kvGet(`node:${nodeId}`).catch(() => null);
    if (nodeRaw) {
        const node = JSON.parse(nodeRaw);
        const storedWallet = (node.wallet_address || '').toLowerCase();
        if (storedWallet && storedWallet !== headerWallet) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
    }

    await kvDel(`node:${nodeId}`).catch(() => {});
    return res.status(200).json({ ok: true });
}
