/**
 * GET  /api/v1/telegram/bot/wallet?telegram_id=<id>
 * Returns the linked TON wallet for a Telegram user.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });
    res.setHeader('Cache-Control', 'private, no-store');

    const telegramId = String(req.query.telegram_id || '');
    if (!/^\d{1,15}$/.test(telegramId)) return res.status(400).json({ error: 'telegram_id required' });

    try {
        const wallet = await kvGet(`tg_wallet:${telegramId}`);
        return res.status(200).json({
            telegram_id: telegramId,
            wallet:      wallet || '',
            linked:      !!wallet,
        });
    } catch (err: any) {
        console.error('[telegram/bot/wallet]', err?.message || err);
        return res.status(500).json({ error: 'Could not resolve linked Telegram wallet' });
    }
}
