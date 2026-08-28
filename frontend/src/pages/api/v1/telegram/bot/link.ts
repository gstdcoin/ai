/**
 * POST /api/v1/telegram/bot/link
 * Links a TON wallet address to a Telegram user ID.
 * Grants +0.5 GSTD welcome bonus on first link.
 * If referrer_id supplied and this is a first link, awards 1 GSTD to the referrer
 * and records referral stats (referral_stats:{referrer_id}).
 *
 * Body: { telegram_id, wallet_address, username?, first_name?, referrer_id? }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr, kvIncrByFloat } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';

const TON_ADDRESS_RE = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
const WELCOME_BONUS    = 0.5;
const REFERRER_BONUS   = 1.0;
const INVITEE_BONUS    = 0.2;  // extra for the new user (on top of welcome bonus)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    // Without this, anyone could re-point an arbitrary telegram_id's wallet
    // mapping (hijacking future payouts) or farm welcome/referral bonuses
    // with fabricated telegram_ids that were never real Telegram accounts.
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });

    const { telegram_id, wallet_address, username, first_name, referrer_id } = req.body as {
        telegram_id?:  string | number;
        wallet_address?: string;
        username?:     string;
        first_name?:   string;
        referrer_id?:  string | number;
    };

    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    if (!wallet_address || !TON_ADDRESS_RE.test(wallet_address)) {
        return res.status(400).json({ error: 'Valid TON wallet address required (EQ.../UQ.../0:...)' });
    }

    const userId    = String(telegram_id);
    const walletKey = wallet_address.toLowerCase();
    const existing  = await kvGet(`tg_wallet:${userId}`).catch(() => null);
    const isNew     = !existing;

    await Promise.all([
        kvSet(`tg_wallet:${userId}`, wallet_address),
        kvSet(`tg_meta:${userId}`, JSON.stringify({
            username:    username   || '',
            first_name:  first_name || '',
            linked_at:   Date.now(),
        })),
    ]);

    let subsidized      = false;
    let referral_bonus  = 0;

    if (isNew) {
        const bonuses: Promise<any>[] = [
            kvIncrByFloat(`balance:${walletKey}`, WELCOME_BONUS).catch(() => {}),
            kvIncr('stats:total_users').catch(() => {}),
        ];
        subsidized = true;

        // Referral: only credit if this is user's first wallet link and referrer != self
        if (referrer_id && String(referrer_id) !== userId) {
            const refId = String(referrer_id);

            // Get referrer's wallet to credit them
            const refWalletRaw = await kvGet(`tg_wallet:${refId}`).catch(() => null);
            if (refWalletRaw) {
                const refWalletKey = String(refWalletRaw).toLowerCase();
                bonuses.push(
                    kvIncrByFloat(`balance:${refWalletKey}`, REFERRER_BONUS).catch(() => {})
                );
            }

            // Extra bonus for the invitee
            bonuses.push(
                kvIncrByFloat(`balance:${walletKey}`, INVITEE_BONUS).catch(() => {})
            );
            referral_bonus = INVITEE_BONUS;

            // Update referrer stats
            const statsKey = `referral_stats:${refId}`;
            const statsRaw = await kvGet(statsKey).catch(() => null);
            const stats = statsRaw
                ? JSON.parse(statsRaw as string)
                : { telegram_id: refId, total_referrals: 0, active_referrals: 0, total_earned: 0, referral_link: `https://t.me/gstdtoken_bot?start=ref_${refId}` };
            stats.total_referrals  = (stats.total_referrals  || 0) + 1;
            stats.active_referrals = (stats.active_referrals || 0) + 1;
            stats.total_earned     = (stats.total_earned     || 0) + REFERRER_BONUS;
            bonuses.push(kvSet(statsKey, JSON.stringify(stats)));
        }

        await Promise.all(bonuses);
    }

    return res.status(200).json({
        success:       true,
        wallet:        wallet_address,
        telegram_id:   userId,
        is_new_link:   isNew,
        subsidized,
        referral_bonus,
    });
}
