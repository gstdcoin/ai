/**
 * GET /api/v1/sovereign/tokenomics
 * Token supply, mint, burn, and halving metrics.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

const MAX_SUPPLY    = 1_000_000_000;
const WORKER_POOL   = 400_000_000;
const BASE_REWARD   = 0.5;            // GSTD per hour per node
const EPOCH_DAYS    = 365;
// No token burning — all fees route to node operator reward pool

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    try {
        const [burnedRaw, mintedRaw, stakedRaw, stakersRaw] = await Promise.all([
            kvGet('stats:total_burned'),
            kvGet('stats:total_minted'),
            kvGet('stats:total_staked'),
            kvGet('stats:active_stakers'),
        ]);

        const total_burned    = burnedRaw  ? parseFloat(burnedRaw)  : 0;
        const total_minted    = mintedRaw  ? parseFloat(mintedRaw)  : 0;
        const total_staked    = stakedRaw  ? parseFloat(stakedRaw)  : 0;
        const active_stakers  = stakersRaw ? parseInt(stakersRaw)   : 0;

        const circulating_supply  = total_minted;
        const remaining_supply    = MAX_SUPPLY - total_minted;
        const supply_mined_pct    = (total_minted / MAX_SUPPLY) * 100;

        // Epoch 1 started at project genesis; halving every EPOCH_DAYS days
        const genesis = new Date('2025-01-01').getTime();
        const elapsed_days = (Date.now() - genesis) / (1000 * 60 * 60 * 24);
        const epoch = Math.floor(elapsed_days / EPOCH_DAYS) + 1;
        const next_halving_in_days = Math.ceil(EPOCH_DAYS - (elapsed_days % EPOCH_DAYS));

        return res.status(200).json({
            max_supply:            MAX_SUPPLY,
            worker_pool:           WORKER_POOL,
            circulating_supply,
            total_minted,
            total_staked,
            active_stakers,
            remaining_supply,
            supply_mined_pct,
            burn_rate_pct:         0,
            base_reward_per_hour:  BASE_REWARD,
            epoch,
            next_halving_in_days,
            halving_reduction_pct: 50,
            contracts_live:        true,
            note:                  'No token burning. All fees flow to node operator reward pool. Contracts live on TON mainnet (Jul 2026).',
            timestamp:             Date.now(),
        });
    } catch (err: any) {
        console.error('[sovereign/tokenomics]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
