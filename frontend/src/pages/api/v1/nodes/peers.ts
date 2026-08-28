/**
 * GET /api/v1/nodes/peers
 *
 * Returns P2P multiaddrs of active nodes.
 * Used by gstdbot as bootstrap peer list for libp2p WAN discovery.
 *
 * gstdbot config: GSTD_BOOTSTRAP_PEERS=$(curl -s https://platform.gstdtoken.com/api/v1/nodes/peers | jq -r '.addrs[]' | tr '\n' ',')
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet } from '../../../../lib/kv';
import type { NodeRecord } from './register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const keys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        let addrs: string[] = [];
        let peers: { node_id: string; multiaddrs: string[] }[] = [];

        if (keys.length > 0) {
            const values = await kvMGet(keys);
            const nodes = values
                .filter((v): v is string => v !== null)
                .map(v => JSON.parse(v) as NodeRecord)
                .filter(n => n.multiaddrs?.length > 0);

            peers = nodes.map(n => ({ node_id: n.node_id, multiaddrs: n.multiaddrs }));
            addrs = nodes.flatMap(n => n.multiaddrs);
        }

        return res.status(200).json({ addrs, peers, count: peers.length });
    } catch (err: any) {
        console.error('[nodes/peers]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
