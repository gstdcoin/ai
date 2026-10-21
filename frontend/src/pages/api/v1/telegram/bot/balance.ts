/**
 * GET /api/v1/telegram/bot/balance?telegram_id=<id>
 * Returns the GSTD balance and pending rewards for a Telegram user.
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
        if (!wallet) {
            return res.status(200).json({ balance_gstd: 0, swarm_balance: 0, pending_gstd: 0 });
        }

        const key = wallet.toLowerCase();
        const [balRaw, pendRaw, swarmRaw] = await Promise.all([
            kvGet(`balance:${key}`),
            kvGet(`rewards:pending:${key}`),
            kvGet(`swarm_balance:${key}`),
        ]);
        const balance = balRaw ? Number(balRaw) : 0;
        const pending = pendRaw ? Number(pendRaw) : 0;
        const swarmBalance = swarmRaw ? Number(swarmRaw) : 0;
        if (![balance, pending, swarmBalance].every(Number.isFinite) ||
            balance < 0 || pending < 0 || swarmBalance < 0) {
            throw new Error('Invalid stored Telegram wallet balance');
        }

        return res.status(200).json({
            balance_gstd: balance,
            swarm_balance: swarmBalance,
            pending_gstd: pending,
            wallet,
        });
    } catch (err: any) {
        console.error('[telegram/bot/balance]', err?.message || err);
        return res.status(500).json({ error: 'Could not load Telegram wallet balance' });
    }
}
