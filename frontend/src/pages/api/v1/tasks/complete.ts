/**
 * POST /api/v1/tasks/complete
 *
 * Called by gstdbot after finishing a task.
 * - Updates node earnings and task count
 * - Records campaign task completion
 * - Accumulates protocol treasury from campaign fee
 *
 * Body: { node_id, task_id, result?, reward_gstd?, campaign_id? }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';
import { accrueReward, BASE_TASK_FEE } from '../../../../lib/rewards';
import type { NodeRecord } from '../nodes/register';
import type { Campaign } from '../campaigns/create';

const NODE_TTL = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body   = req.body as any;
        const nodeId: string = body.node_id || (req.headers['x-node-id'] as string);

        if (!nodeId) {
            return res.status(400).json({ error: 'node_id required' });
        }

        const rewardGstd    = Number(body.reward_gstd) || 0;
        const protocolFee   = Number(body.protocol_fee) || 0;
        const campaignId    = body.campaign_id as string | undefined;

        // Parallel: update node record + campaign + global stats
        const [nodeRaw, campaignRaw] = await Promise.all([
            kvGet(`node:${nodeId}`),
            campaignId ? kvGet(`campaign:${campaignId}`) : Promise.resolve(null),
        ]);

        const writes: Promise<void>[] = [];

        // Update node earnings
        if (nodeRaw) {
            const record: NodeRecord = JSON.parse(nodeRaw);
            record.tasks_completed = (record.tasks_completed || 0) + 1;
            record.gstd_earned     = Math.round(((record.gstd_earned || 0) + rewardGstd) * 1e6) / 1e6;
            record.last_seen       = new Date().toISOString();
            writes.push(kvSet(`node:${nodeId}`, JSON.stringify(record), NODE_TTL));
        }

        // Update campaign stats
        if (campaignRaw && campaignId) {
            const campaign: Campaign = JSON.parse(campaignRaw);
            campaign.tasks_completed = (campaign.tasks_completed || 0) + 1;
            const remaining = Math.ceil((new Date(campaign.expires_at).getTime() - Date.now()) / 1000);
            if (remaining > 0) {
                writes.push(kvSet(`campaign:${campaignId}`, JSON.stringify(campaign), remaining + 3600));
            }
        }

        // Global stats
        writes.push(kvIncr('stats:total_tasks_completed').then(() => {}));
        if (rewardGstd > 0) writes.push(kvIncr('stats:total_gstd_paid').then(() => {}));
        if (protocolFee > 0) writes.push(kvIncr('stats:protocol_treasury_gstd').then(() => {}));

        // F1 reward accrual — accumulate per-node pending balance
        const walletAddr = nodeRaw ? (JSON.parse(nodeRaw) as NodeRecord).wallet_address : '';
        if (walletAddr) {
            writes.push(
                accrueReward(nodeId, walletAddr, rewardGstd || BASE_TASK_FEE, body.task_id)
                    .then(() => {})
                    .catch(() => {})
            );
        }

        await Promise.all(writes);

        return res.status(200).json({
            ok:          true,
            task_id:     body.task_id,
            reward_gstd: rewardGstd,
        });
    } catch (err: any) {
        console.error('[tasks/complete]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
