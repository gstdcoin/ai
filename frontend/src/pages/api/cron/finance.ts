import type { NextApiRequest, NextApiResponse } from 'next';
import { isValidOpenIntelligenceCronRequest } from '../../../lib/openIntelligenceAuth';
import { readMoneySystem, reapMoney, refreshBacking, getWithdrawal, confirmWithdrawal } from '../../../lib/money';
import { custodySnapshot, findWithdrawalReceipt } from '../../../lib/custody';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isValidOpenIntelligenceCronRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    // Refund recovery must run even when the chain API or backing check fails.
    const refunds = await reapMoney(5);
    const system = await readMoneySystem();
    if (!system) return res.status(200).json({ ...refunds, backing: 'awaiting_inventory_review' });
    try {
        if(system.payoutInFlight) {
            const withdrawal=await getWithdrawal(system.payoutInFlight);
            if(withdrawal){
                const proof=await findWithdrawalReceipt(withdrawal,system.owner);
                if(proof)await confirmWithdrawal(withdrawal.id,proof,await custodySnapshot(system.owner));
            }
        }
        const snapshot = await custodySnapshot(system.owner);
        const next = await refreshBacking(snapshot);
        const covered = BigInt(next.reserve) >= BigInt(next.allocated) + BigInt(next.legacyHold);
        return res.status(covered ? 200 : 409).json({ ...refunds, covered });
    } catch { return res.status(503).json({ ...refunds, error: 'backing_refresh_failed' }); }
}
