import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';
import { isValidBotToken } from '../../../../../lib/botAuth';
import { claimMoney, units } from '../../../../../lib/money';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isValidBotToken(req)) return res.status(401).json({ error: 'Invalid bot token' });
    const wallet = await kvGet('tg_wallet:' + String(req.body?.telegram_id || ''));
    if (!wallet) return res.status(404).json({ error: 'No wallet linked' });
    try {
        const result = await claimMoney(wallet), amount = Number(units(result.amount));
        return res.status(200).json({ success: result.amount > 0n, claimed_gross: amount, claimed_net: amount,
            fee_gstd: 0, wallet, ledger_version: 2 });
    } catch { return res.status(503).json({ error: 'ledger_unavailable' }); }
}
