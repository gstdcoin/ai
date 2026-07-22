/**
 * GET /api/v1/settlement/pending
 *
 * Returns all wallets with pending (unsettled) GSTD rewards.
 * Used by the admin to see what needs to be settled on-chain.
 * After SettlementMaster is deployed, the trigger endpoint uses this data.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { computeSettlement, getTreasuryBalance } from '../../../../lib/rewards';
import { SETTLEMENT_MASTER_ADDRESS } from '../../../../lib/config';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const secret = req.headers['x-admin-secret'] || req.query.secret;
    const expectedSecret = process.env.TREASURY_SECRET || '';
    if (!expectedSecret || secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const [entries, treasury] = await Promise.all([
            computeSettlement(0),
            getTreasuryBalance(),
        ]);

        const totalPending = entries.reduce((sum, e) => sum + e.amount, 0);

        return res.status(200).json({
            entries,
            total_pending_gstd: totalPending,
            treasury_gstd:      treasury,
            count:              entries.length,
            settlement_master:  SETTLEMENT_MASTER_ADDRESS,
        });
    } catch (err: any) {
        console.error('[settlement/pending]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
