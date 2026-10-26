import type { NextApiRequest, NextApiResponse } from 'next';
import { sessionWallet } from '../../../../lib/walletSession';
import { moneyBalance, walletId } from '../../../../lib/money';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Not authenticated' });
    try {
        if (req.query.wallet !== undefined && (typeof req.query.wallet !== 'string' || walletId(req.query.wallet) !== walletId(wallet)))
            return res.status(403).json({ error: 'Wallet mismatch' });
        const balance = await moneyBalance(wallet);
        res.setHeader('Cache-Control','private, no-store');
        return res.status(200).json({ ...balance, gstd: balance.balance_gstd, ton: 0,
            pending_rewards_gstd: balance.pending_gstd, currency: 'GSTD' });
    } catch { return res.status(503).json({ error: 'ledger_unavailable' }); }
}
