/**
 * GET /api/v1/referrals/stats?telegram_id=<id>
 *
 * Returns referral stats for a Telegram user.
 * Tracks: how many users they invited, GSTD earned from referrals,
 * and how many referrals are still active (linked wallet).
 *
 * Stats accumulate via POST /api/v1/telegram/bot/link when a
 * referred user links their wallet (ref_{inviter_id} in start param).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';

interface ReferralStats {
    telegram_id:      string;
    total_referrals:  number;
    active_referrals: number;
    total_earned:     number;
    referral_link:    string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { telegram_id } = req.query;
    if (!telegram_id || typeof telegram_id !== 'string') {
        return res.status(400).json({ error: 'telegram_id query param required' });
    }

    const statsRaw = await kvGet(`referral_stats:${telegram_id}`).catch(() => null);
    const stats: ReferralStats = statsRaw
        ? (JSON.parse(statsRaw as string) as ReferralStats)
        : {
            telegram_id,
            total_referrals:  0,
            active_referrals: 0,
            total_earned:     0,
            referral_link:    `https://t.me/gstdtoken_bot?start=ref_${telegram_id}`,
        };

    if (!stats.referral_link) {
        stats.referral_link = `https://t.me/gstdtoken_bot?start=ref_${telegram_id}`;
    }

    return res.status(200).json(stats);
}
