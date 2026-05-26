/**
 * GET /api/v1/rpc/pricing
 * Bridge/RPC fee pricing for supported chains.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

    return res.status(200).json({
        fee_pct:     0.3,
        min_fee_usd: 0.10,
        gstd_discount_pct: 50,
        chains: {
            ton:      { fee_pct: 0.1, gas_estimate_ton: 0.05 },
            ethereum: { fee_pct: 0.3, gas_estimate_usd: 5.0, status: 'coming' },
            solana:   { fee_pct: 0.2, gas_estimate_usd: 0.01, status: 'coming' },
            xrpl:     { fee_pct: 0.2, gas_estimate_usd: 0.001, status: 'coming' },
        },
        timestamp: Date.now(),
    });
}
