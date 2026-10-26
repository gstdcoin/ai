import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control','public, max-age=300');
    return res.status(200).json({ program_name: 'GSTD accepted funded work', status: 'funded_work_only',
        ledger_version: 2, split: { executor: 85, protocol: 10, reserve: 5 }, claim_fee_pct: 0,
        base_rate_per_hour: 0, tiers: [], bonuses: [], withdrawal_enabled: true, withdrawal_mode: 'owner_signed',
        note: 'No presence rewards. Paid work requires reconciled reserves. Legacy balances remain available for review.' });
}
