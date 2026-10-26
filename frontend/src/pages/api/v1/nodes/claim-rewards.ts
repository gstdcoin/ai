import type { NextApiRequest, NextApiResponse } from 'next';
import { claimMoney, units } from '../../../../lib/money';
import { sessionWallet } from '../../../../lib/walletSession';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const result = await claimMoney(wallet);
        return res.status(200).json({ ok: result.amount > 0n, claimed_gstd: Number(units(result.amount)),
            new_balance: Number(units(result.balance)), fee_gstd: 0, ledger_version: 2,
            note: 'Backed internal GSTD credits; this is not an on-chain withdrawal.' });
    } catch { return res.status(503).json({ error: 'ledger_unavailable' }); }
}
