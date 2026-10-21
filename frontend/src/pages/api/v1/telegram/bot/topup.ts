/**
 * POST /api/v1/telegram/bot/topup
 * Credits GSTD to a user's wallet after a Telegram Stars payment.
 * Idempotent — same telegram_payment_charge_id never credited twice.
 *
 * Body: { telegram_id, stars_amount, telegram_payment_charge_id, provider_payment_charge_id?, payload? }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSetNX, kvIncrByFloat } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';

const STAR_USD   = 0.013;   // 1 Telegram Star ≈ $0.013 USD

// No price fallback: crediting at a guessed price would mint unbacked GSTD.
async function getGstdPriceUsd(): Promise<number> {
    const cached = await kvGet('market:gstd_price_usd').catch(() => null);
    const price = cached ? parseFloat(cached) : NaN;
    return Number.isFinite(price) && price > 0 ? price : 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    // stars_amount/charge_id are trusted as coming from a real Telegram
    // successful_payment webhook -- that's only true if the caller really is
    // gstdbot (which independently verified the payment with Telegram before
    // forwarding here). Without this check, anyone could credit themselves
    // GSTD with a fabricated charge_id and no real Stars payment at all.
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });

    const { telegram_id, stars_amount, telegram_payment_charge_id } = req.body as {
        telegram_id?: string | number;
        stars_amount?: number;
        telegram_payment_charge_id?: string;
        provider_payment_charge_id?: string;
        payload?: string;
    };

    if (!telegram_id)               return res.status(400).json({ error: 'telegram_id required' });
    if (!stars_amount || stars_amount <= 0) return res.status(400).json({ error: 'stars_amount required' });
    if (!telegram_payment_charge_id) return res.status(400).json({ error: 'telegram_payment_charge_id required' });

    if (!Number.isFinite(Number(stars_amount))) return res.status(400).json({ error: 'stars_amount invalid' });

    const gstdPrice = await getGstdPriceUsd();
    if (gstdPrice <= 0) return res.status(503).json({ error: 'GSTD price unavailable, retry later' });

    const userId = String(telegram_id);
    const wallet = await kvGet(`tg_wallet:${userId}`).catch(() => null);

    const gstdPerStar = STAR_USD / gstdPrice;
    const gstdAmount  = Math.floor(Number(stars_amount) * gstdPerStar * 100) / 100;

    // Atomic idempotency: only the first request for a charge id credits (kept 90 days for reconciliation).
    const dedupeKey = `topup_seen:${telegram_payment_charge_id}`;
    if (!(await kvSetNX(dedupeKey, String(gstdAmount), 86400 * 90))) {
        const seen = await kvGet(dedupeKey).catch(() => null);
        return res.status(200).json({ ok: true, already_processed: true, gstd_credited: seen ? parseFloat(seen) : 0 });
    }

    if (wallet) {
        const key = wallet.toLowerCase();
        await kvIncrByFloat(`balance:${key}`, gstdAmount).catch(() => {});
    } else {
        // No wallet linked — store in internal balance keyed by telegram_id
        await kvIncrByFloat(`tg_balance:${userId}`, gstdAmount).catch(() => {});
    }

    console.log(`[topup] ✅ ${stars_amount}⭐ → ${gstdAmount} GSTD for user ${userId}${wallet ? ' (wallet: ' + wallet.slice(0,8) + '...)' : ' (internal)'}`);

    return res.status(200).json({
        ok:               true,
        telegram_id:      userId,
        stars_amount,
        gstd_credited:    gstdAmount,
        wallet_address:   wallet || '',
        rate_gstd_per_star: gstdPerStar,
    });
}
