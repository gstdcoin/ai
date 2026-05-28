/**
 * POST /api/v1/monitor/signals/:id/sponsor
 *
 * Records a sponsorship intent for a market signal analysis.
 * Called by the Telegram bot before sending a Stars invoice.
 * Non-critical — failure is logged as warning, never blocks user flow.
 *
 * Body: { user_id, telegram_id, stars_paid, gstd_reward, gstd_gold_fee }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvSet, kvIncr } from '../../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'signal id required in path' });
    }

    const {
        user_id,
        telegram_id,
        stars_paid   = 0,
        gstd_reward  = 0,
        gstd_gold_fee = 0,
    } = req.body as {
        user_id?: string;
        telegram_id?: string | number;
        stars_paid?: number;
        gstd_reward?: number;
        gstd_gold_fee?: number;
    };

    const record = {
        signal_id:    id,
        user_id:      user_id || `tg_${telegram_id}`,
        telegram_id,
        stars_paid:   Number(stars_paid),
        gstd_reward:  Number(gstd_reward),
        gstd_gold_fee: Number(gstd_gold_fee),
        created_at:   Date.now(),
        status:       'pending',
    };

    await Promise.all([
        kvSet(`sponsor:${id}:${record.user_id}`, JSON.stringify(record), 86400),
        kvIncr('stats:total_sponsors'),
    ]);

    return res.status(200).json({ ok: true, signal_id: id });
}
