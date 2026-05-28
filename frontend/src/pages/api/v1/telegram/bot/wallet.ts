/**
 * GET  /api/v1/telegram/bot/wallet?telegram_id=<id>
 * Returns the linked TON wallet for a Telegram user.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const telegramId = req.query.telegram_id;
    if (!telegramId) return res.status(400).json({ error: 'telegram_id required' });

    const wallet = await kvGet(`tg_wallet:${telegramId}`).catch(() => null);
    return res.status(200).json({
        telegram_id: telegramId,
        wallet:      wallet || '',
        linked:      !!wallet,
    });
}
