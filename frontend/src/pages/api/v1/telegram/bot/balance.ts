/**
 * GET /api/v1/telegram/bot/balance?telegram_id=<id>
 * Returns the GSTD balance and pending rewards for a Telegram user.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const telegramId = req.query.telegram_id;
    if (!telegramId) return res.status(400).json({ error: 'telegram_id required' });

    const wallet = await kvGet(`tg_wallet:${telegramId}`).catch(() => null);
    if (!wallet) {
        return res.status(200).json({ balance_gstd: 0, swarm_balance: 0, pending_gstd: 0 });
    }

    const key = wallet.toLowerCase();
    const [balRaw, pendRaw, swarmRaw] = await Promise.all([
        kvGet(`balance:${key}`).catch(() => null),
        kvGet(`rewards:pending:${key}`).catch(() => null),
        kvGet(`swarm_balance:${key}`).catch(() => null),
    ]);

    return res.status(200).json({
        balance_gstd:  balRaw   ? parseFloat(balRaw)   : 0,
        swarm_balance: swarmRaw ? parseFloat(swarmRaw)  : 0,
        pending_gstd:  pendRaw  ? parseFloat(pendRaw)   : 0,
        wallet,
    });
}
