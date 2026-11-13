import type { NextApiRequest, NextApiResponse } from 'next';
import { acceptCampaignProposal, campaignProposal, MoneyError } from '../../../../lib/money';
import { sessionWallet } from '../../../../lib/walletSession';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const task = req.method === 'GET' ? req.query.task_id : req.body?.task_id;
    if (typeof task !== 'string' || !/^[a-f0-9]{32}$/.test(task)) return res.status(400).json({ error: 'invalid_task_id' });
    try {
        const payer = await sessionWallet(req.headers);
        if (!payer) return res.status(401).json({ error: 'verified_wallet_required' });
        if (req.method === 'GET') {
            const { job, proposal } = await campaignProposal(task, payer);
            return res.status(200).json({ state: job.state, ready: !!proposal, result: proposal?.result, result_hash: proposal?.hash });
        }
        const hash = req.body?.result_hash;
        if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) return res.status(400).json({ error: 'invalid_result_hash' });
        const job = await acceptCampaignProposal(task, payer, hash);
        return res.status(200).json({ state: job.state, result_hash: hash });
    } catch (error) {
        if (!(error instanceof MoneyError)) return res.status(503).json({ error: 'marketplace_unavailable' });
        return res.status(error.code === 'reservation_not_found' ? 404 : 409).json({ error: error.code });
    }
}
