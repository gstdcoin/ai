import type { NextApiRequest, NextApiResponse } from 'next';
import { sessionWallet } from '../../../../lib/walletSession';
import { moneyBalance } from '../../../../lib/money';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const balance = await moneyBalance(wallet);
        return res.status(200).json({ ...balance, pending_balance: balance.pending_gstd, claimable: balance.pending_gstd > 0 });
    } catch { return res.status(503).json({ error: 'ledger_unavailable' }); }
}
