/**
 * GET /api/v1/fund/epoch
 * Current fund distribution epoch — determines payout cycle.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

const EPOCH_DAYS = 30;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');

    try {
        const genesis        = new Date('2025-01-01').getTime();
        const elapsed_days   = (Date.now() - genesis) / 86400_000;
        const epoch          = Math.floor(elapsed_days / EPOCH_DAYS) + 1;
        const day_in_epoch   = Math.floor(elapsed_days % EPOCH_DAYS) + 1;
        const days_remaining = EPOCH_DAYS - day_in_epoch + 1;

        const [epochRewardRaw] = await Promise.all([
            kvGet(`fund:epoch:${epoch}:reward`),
        ]);

        return res.status(200).json({
            epoch,
            day_in_epoch,
            days_remaining,
            epoch_days: EPOCH_DAYS,
            epoch_started_at:  new Date(genesis + (epoch - 1) * EPOCH_DAYS * 86400_000).toISOString(),
            epoch_ends_at:     new Date(genesis + epoch * EPOCH_DAYS * 86400_000).toISOString(),
            epoch_reward_gstd: epochRewardRaw ? parseFloat(epochRewardRaw) : 0,
            next_distribution: new Date(genesis + epoch * EPOCH_DAYS * 86400_000).toISOString(),
            timestamp:         Date.now(),
        });
    } catch (err: any) {
        console.error('[fund/epoch]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
