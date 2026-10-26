import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';
import { moneyBalance } from '../../../../../lib/money';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });
    try {
        const wallet = await kvGet('tg_wallet:' + String(req.query.telegram_id || ''));
        res.setHeader('Cache-Control','private, no-store');
        if (!wallet) return res.status(200).json({ balance_gstd: 0, pending_gstd: 0, swarm_balance: 0 });
        return res.status(200).json({ ...await moneyBalance(wallet), swarm_balance: 0 });
    } catch { return res.status(503).json({ error: 'ledger_unavailable' }); }
}
