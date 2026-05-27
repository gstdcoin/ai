/**
 * GET /api/v1/fund/status
 * Golden Reserve Fund — collects 50% of all protocol fees.
 * Funds staking rewards, buybacks, and ecosystem grants.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    try {
        const [balRaw, totalInRaw, totalOutRaw, stakersRaw] = await Promise.all([
            kvGet('fund:balance'),
            kvGet('fund:total_collected'),
            kvGet('fund:total_distributed'),
            kvGet('stats:active_stakers'),
        ]);

        const balance           = balRaw      ? parseFloat(balRaw)      : 0;
        const total_collected   = totalInRaw  ? parseFloat(totalInRaw)  : 0;
        const total_distributed = totalOutRaw ? parseFloat(totalOutRaw) : 0;
        const active_stakers    = stakersRaw  ? parseInt(stakersRaw)    : 0;

        return res.status(200).json({
            balance_gstd:        balance,
            total_collected_gstd: total_collected,
            total_distributed_gstd: total_distributed,
            active_stakers,
            fee_split: {
                node_operators_pct: 85,
                golden_reserve_pct: 15,
            },
            reserve_usage: {
                staking_rewards_pct: 60,
                buyback_burn_pct:    0,
                ecosystem_grants_pct: 40,
            },
            note: 'Golden Reserve activates after TON smart contract deployment.',
            contracts_live: false,
            timestamp: Date.now(),
        });
    } catch (err: any) {
        console.error('[fund/status]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
