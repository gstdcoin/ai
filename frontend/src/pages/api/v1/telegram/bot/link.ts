/**
 * POST /api/v1/telegram/bot/link
 * Links a TON wallet address to a Telegram user ID.
 * Also grants +0.5 GSTD welcome bonus on first link.
 *
 * Body: { telegram_id, wallet_address, username?, first_name? }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../../lib/kv';
import { kvIncrByFloat } from '../../../../../lib/kv';

const TON_ADDRESS_RE = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
const WELCOME_BONUS  = 0.5;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { telegram_id, wallet_address, username, first_name } = req.body as {
        telegram_id?: string | number;
        wallet_address?: string;
        username?: string;
        first_name?: string;
    };

    if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
    if (!wallet_address || !TON_ADDRESS_RE.test(wallet_address)) {
        return res.status(400).json({ error: 'Valid TON wallet address required (EQ.../UQ.../0:...)' });
    }

    const userId  = String(telegram_id);
    const walletKey = wallet_address.toLowerCase();
    const existing  = await kvGet(`tg_wallet:${userId}`).catch(() => null);
    const isNew     = !existing;

    await Promise.all([
        kvSet(`tg_wallet:${userId}`, wallet_address),
        kvSet(`tg_meta:${userId}`, JSON.stringify({ username: username || '', first_name: first_name || '', linked_at: Date.now() })),
    ]);

    let subsidized = false;
    if (isNew) {
        await kvIncrByFloat(`balance:${walletKey}`, WELCOME_BONUS).catch(() => {});
        subsidized = true;
    }

    return res.status(200).json({
        success:    true,
        wallet:     wallet_address,
        telegram_id: userId,
        is_new_link: isNew,
        subsidized,
    });
}
