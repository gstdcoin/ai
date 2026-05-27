/**
 * POST /api/v1/nodes/rewards/settle
 *
 * Weekly settlement endpoint — computes F1 reward distribution and returns
 * the list of TON Jetton transfers to execute.
 *
 * Auth: TREASURY_SECRET header (set in Vercel env vars).
 *
 * In dry_run mode (default): returns the settlement plan without clearing balances.
 * In execute mode: marks balances as settled (actual TON transfer is done off-chain
 * via a separate script that reads this response and calls the TON Jetton contract).
 *
 * Request body:
 *   { dry_run?: boolean; min_amount?: number }
 *
 * Response:
 *   {
 *     epoch:    string   // YYYY-WW settlement epoch
 *     entries:  { wallet, amount_gstd, node_ids }[]
 *     treasury: number   // community tax accumulated
 *     total:    number   // sum of all entries
 *     dry_run:  boolean
 *   }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { computeSettlement, getTreasuryBalance, clearSettledRewards } from '../../../../../lib/rewards';

function currentEpoch(): string {
    const now  = new Date();
    const year = now.getUTCFullYear();
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const secret = process.env.TREASURY_SECRET || '';
    const auth   = req.headers['x-treasury-secret'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!secret || auth !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const dryRun    = req.body?.dry_run !== false;  // default: dry_run = true
        const minAmount = Number(req.body?.min_amount) || 0.01;
        const epoch     = currentEpoch();

        const [entries, treasury] = await Promise.all([
            computeSettlement(minAmount),
            getTreasuryBalance(),
        ]);

        const total = entries.reduce((sum, e) => sum + e.amount, 0);

        if (!dryRun && entries.length > 0) {
            await clearSettledRewards(entries.map((e) => e.wallet), epoch);
        }

        return res.status(200).json({
            epoch,
            entries: entries.map((e) => ({
                wallet:      e.wallet,
                amount_gstd: Math.round(e.amount * 1e6) / 1e6,
                node_ids:    e.nodeIds,
            })),
            treasury:    Math.round(treasury * 1e6) / 1e6,
            total:       Math.round(total * 1e6) / 1e6,
            dry_run:     dryRun,
            settled_at:  dryRun ? null : new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('[nodes/rewards/settle]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
