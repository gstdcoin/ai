import type { NextApiRequest, NextApiResponse } from 'next';
import { sessionWallet } from '../../../../lib/walletSession';
import { releaseMoney, MoneyError } from '../../../../lib/money';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const wallet = await sessionWallet(req.headers);
    if (!wallet) return res.status(401).json({ error: 'Not authenticated' });
    try {
        const job = await releaseMoney('campaign:' + String(req.body?.campaign_id || ''),wallet);
        return res.status(200).json({ ok: true, state: job.state, fee_gstd: 0,
            note: 'Unused budget released. Already reserved tasks complete or refund separately.' });
    } catch (e) { return res.status(409).json({ error: e instanceof MoneyError ? e.code : 'release_failed' }); }
}
