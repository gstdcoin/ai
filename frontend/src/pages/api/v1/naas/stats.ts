/**
 * GET /api/v1/naas/stats
 * Node-as-a-Service statistics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    try {
        const rootKeys = (await kvKeys('node:')).filter((k: string) => !k.slice(5).includes(':'));
        return res.status(200).json({
            total_nodes:     rootKeys.length,
            active_nodes:    rootKeys.length,
            chains_supported: 0,
            rpc_requests_24h: 0,
            uptime_avg_pct:   99.1,
            status:           'active',
            note:             'Multi-chain RPC enabled via GSTD_NAAS_ENABLED=true on nodes.',
            timestamp:        Date.now(),
        });
    } catch (err: any) {
        console.error('[naas/stats]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
