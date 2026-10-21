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
import { kvGet, kvIncr, kvIncrByFloat, kvCompleteAssignedTask } from '../../../../lib/kv';
import { COMMUNITY_TAX, BASE_TASK_FEE } from '../../../../lib/rewards';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import { hasTaskResult } from '../../../../lib/taskValidation';
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
        if (body.error || !hasTaskResult(body.result)) {
            return res.status(422).json({ error: 'A non-empty successful task result is required' });
        }
        const completion = await kvCompleteAssignedTask(
            body.task_id,
            nodeId,
            storedWallet,
            BASE_TASK_FEE,
            COMMUNITY_TAX,
            NODE_TTL,
            86400 * 7,
            typeof body.result?.hash === 'string' ? body.result.hash : '',
        );
        if (completion.status === 'invalid_result') {
            await kvIncrByFloat('stats:probe_failed', 1);
            return res.status(422).json({ error: 'Task result does not match the server verification probe' });
        }
        if (completion.status === 'invalid') {
            return res.status(409).json({ error: 'Task is not assigned to this node' });
        }
        if (completion.status === 'wallet_mismatch') {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
        if (completion.status === 'disabled_task') {
            return res.status(410).json({ error: 'Task execution is disabled' });
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
            await kvIncrByFloat('stats:probe_verified', 1);
        }
        const campaignId = assignment.campaign_id;

        const writes: Promise<void>[] = [];

        // Separate counter: rewriting the campaign blob would race with budget reservations.
        if (campaignId) writes.push(kvIncr(`cstats:${campaignId}:tasks`).then(() => {}));

        // Global stats
        if (protocolFee > 0) writes.push(kvIncrByFloat('stats:protocol_treasury_gstd', protocolFee).then(() => {}));

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
