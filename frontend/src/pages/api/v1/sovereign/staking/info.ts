/**
 * GET /api/v1/sovereign/staking/info
 * Global staking info (and per-wallet if ?wallet= provided).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.toLowerCase() : null;

    try {
        const [totalStakedRaw, totalStakersRaw] = await Promise.all([
            kvGet('stats:total_staked'),
            kvGet('stats:active_stakers'),
        ]);

        const total_staked   = totalStakedRaw   ? parseFloat(totalStakedRaw)  : 0;
        const active_stakers = totalStakersRaw  ? parseInt(totalStakersRaw)   : 0;

        // platform shape matches what the Telegram bot reads: data.platform.apy / min_stake / lock_period_days
        const platform = {
            apy:               12,
            apy_pct:           12,
            min_stake:         100,
            min_stake_gstd:    100,
            lock_period_days:  0,
            contracts_live:    false,
            status:            'pending_contract',
            note:              'Staking activates after TON smart contract deployment.',
        };

        const global = {
            total_staked,
            active_stakers,
            platform,
            ...platform,
        };

        if (!wallet) return res.status(200).json({ ...global, timestamp: Date.now() });

        const [balRaw, stakedRaw, rewardsRaw] = await Promise.all([
            kvGet(`balance:${wallet}`),
            kvGet(`staked:${wallet}`),
            kvGet(`rewards:pending:${wallet}`),
        ]);

        return res.status(200).json({
            ...global,
            wallet,
            wallet_balance:  balRaw    ? parseFloat(balRaw)    : 0,
            wallet_staked:   stakedRaw ? parseFloat(stakedRaw) : 0,
            pending_rewards: rewardsRaw ? parseFloat(rewardsRaw) : 0,
            timestamp:       Date.now(),
        });
    } catch (err: any) {
        console.error('[sovereign/staking/info]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
