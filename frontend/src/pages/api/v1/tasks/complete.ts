/**
 * POST /api/v1/tasks/complete
 *
 * Called by gstdbot after finishing a task.
 * - Updates node earnings and task count
 * - Records campaign task completion
 * - Accumulates protocol treasury from campaign fee
 *
 * Body: { node_id, task_id, result }. Reward and campaign metadata come from
 * the server-side task assignment; client-supplied reward fields are ignored.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncrByFloat, kvCompleteAssignedTask } from '../../../../lib/kv';
import { COMMUNITY_TAX, BASE_TASK_FEE } from '../../../../lib/rewards';
import { probeResultMatches } from '../../../../lib/verifyProbe';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import type { TaskAssignment } from '../../../../lib/task-assignment';
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

        // Verify the registered wallet before consuming the one-time assignment.
        const headerWallet = ((req.headers['x-wallet-address'] as string) || '').trim().toLowerCase();

        const nodeRaw = await kvGet(`node:${nodeId}`);
        if (!nodeRaw) return res.status(403).json({ error: 'Unknown node — register first' });
        const storedWallet = ((JSON.parse(nodeRaw) as NodeRecord).wallet_address || '').trim().toLowerCase();
        if (!storedWallet) return res.status(403).json({ error: 'Wallet required for paid task completions' });
        if (storedWallet && storedWallet !== headerWallet) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
        const auth = await requireNodeSignature(nodeId, req.headers as any);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

        if (!body.task_id) {
            return res.status(400).json({ error: 'task_id required' });
        }
        const result = body.result;
        const hasResult = typeof result === 'string'
            ? result.trim().length > 0
            : Array.isArray(result)
                ? result.length > 0
                : typeof result === 'object' && result !== null
                    ? Object.keys(result).length > 0
                    : result !== undefined && result !== null;
        if (body.error || !hasResult) {
            return res.status(422).json({ error: 'A non-empty successful task result is required' });
        }
        const completion = await kvCompleteAssignedTask(
            body.task_id, nodeId, storedWallet, BASE_TASK_FEE, COMMUNITY_TAX, NODE_TTL, 86400 * 7,
        );
        if (completion.status === 'invalid') {
            return res.status(409).json({ error: 'Task is not assigned to this node' });
        }
        if (completion.status === 'wallet_mismatch') {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
        if (completion.status === 'duplicate') {
            return res.status(200).json({ ok: true, task_id: body.task_id, duplicate: true });
        }
        let assignment: TaskAssignment;
        try {
            assignment = JSON.parse(completion.assignment) as TaskAssignment;
        } catch {
            return res.status(409).json({ error: 'Invalid task assignment' });
        }
        const rewardGstd = Number.isFinite(assignment.reward_gstd) && assignment.reward_gstd >= 0
            ? assignment.reward_gstd
            : BASE_TASK_FEE;
        const protocolFee = Number.isFinite(assignment.protocol_fee_gstd) && assignment.protocol_fee_gstd >= 0
            ? assignment.protocol_fee_gstd
            : 0;
        if (assignment.expected_hash) {
            await kvIncrByFloat(probeResultMatches(assignment.expected_hash, body.result) ? 'stats:probe_verified' : 'stats:probe_failed', 1);
        }
        const campaignId = assignment.campaign_id;
        const campaignRaw = campaignId ? await kvGet(`campaign:${campaignId}`) : null;

        const writes: Promise<void>[] = [];

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
        if (protocolFee > 0) writes.push(kvIncrByFloat('stats:protocol_treasury_gstd', protocolFee).then(() => {}));

        // Advance training job if this was a finetune shard
        const trainingJobId = assignment.job_id;
        if (trainingJobId) {
            writes.push((async () => {
                const jobRaw = await kvGet(`training:job:${trainingJobId}`);
                if (!jobRaw) return;
                const job = JSON.parse(jobRaw);
                job.shards_done = (job.shards_done || 0) + 1;
                job.gradients   = job.gradients || [];
                job.gradients.push({
                    shard_id:             assignment.shard_id || body.task_id,
                    node_id:              nodeId,
                    metacognitive_score:  body.result?.metacognitive_score  ?? 0.5,
                    gradient_norm:        body.result?.gradient_norm        ?? 1.0,
                    val_loss_improvement: body.result?.val_loss_improvement ?? 0.05,
                    lora_path:            body.result?.lora_path            ?? '',
                    submitted_at:         new Date().toISOString(),
                });
                if (job.shards_done >= job.shards_total) {
                    job.status = 'done';
                } else if (job.status === 'pending') {
                    job.status = 'training';
                }
                job.updated_at = new Date().toISOString();
                const ttl = Math.max(3600, Math.ceil((new Date(job.created_at).getTime() + 7 * 24 * 3600_000 - Date.now()) / 1000));
                await kvSet(`training:job:${trainingJobId}`, JSON.stringify(job), ttl);
            })());
        }

        // Accumulate the server-assigned reward in the node's pending balance.
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
