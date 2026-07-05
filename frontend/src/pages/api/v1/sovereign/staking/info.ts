/**
 * GET /api/v1/sovereign/staking/info
 * Staking info — staking is discontinued (on-chain contract not deployed).
 * Returns current status so UI can show accurate state.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.toLowerCase() : null;

    const base = {
        status:           'discontinued',
        contracts_live:   false,
        apy:              0,
        apy_pct:          0,
        min_stake:        0,
        note:             'On-chain staking contract has not been deployed. Earn GSTD by running a node instead.',
        alternative:      'Run a node and earn GSTD from AI inference: app.gstdtoken.com/nodes',
        timestamp:        Date.now(),
    };

    if (!wallet) return res.status(200).json(base);

    try {
        const stakedRaw = await kvGet(`staked:${wallet}`);
        return res.status(200).json({
            ...base,
            wallet,
            wallet_staked:   stakedRaw ? parseFloat(stakedRaw) : 0,
            pending_rewards: 0,
        });
    } catch (err: any) {
        console.error('[sovereign/staking/info]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
