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
import { kvGet, kvSetNX, kvIncr, kvIncrByFloat, kvCompleteAssignedTask } from '../../../../lib/kv';
import { COMMUNITY_TAX, BASE_TASK_FEE } from '../../../../lib/rewards';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import { hasTaskResult, declaredTaskModelMismatch } from '../../../../lib/taskValidation';
import { captureMoney, releaseMoney, moneyJob, splitNano, units, walletId, digest } from '../../../../lib/money';
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
        const assignedRaw = await kvGet('task_assigned:' + body.task_id);
        let assigned = assignedRaw ? JSON.parse(assignedRaw) : null;
        // A retry validates against the same frozen assignment in its receipt.
        // Never consume an assignment before a correctable declared-model error.
        if (!assigned) {
            const completedRaw = await kvGet('task_completed:' + body.task_id);
            const completed = completedRaw ? JSON.parse(completedRaw) : null;
            if (completed?.node_id === nodeId && typeof completed.assignment === 'string')
                assigned = JSON.parse(completed.assignment);
        }
        if (!assigned || assigned.node_id !== nodeId)
            return res.status(409).json({ error: 'Task is not assigned to this node' });
        if (body.error && assigned?.node_id === nodeId && assigned?.funding_id) await releaseMoney(assigned.funding_id);
        if (body.error || !hasTaskResult(body.result)) {
            return res.status(422).json({ error: 'A non-empty successful task result is required' });
        }
        if (declaredTaskModelMismatch(assigned.expected_model, body)) {
            return res.status(422).json({ error: 'model_mismatch', requested_model: assigned.expected_model });
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

        let assignment: TaskAssignment;
        try {
            assignment = JSON.parse(completion.assignment) as TaskAssignment;
        } catch {
            return res.status(409).json({ error: 'Invalid task assignment' });
        }
        let rewardGstd = 0;
        const protocolFee = 0; // Protocol/reserve shares commit atomically inside captureMoney.
        if (assignment.funding_id) {
            const funding = await moneyJob(assignment.funding_id);
            if (!funding) return res.status(409).json({ error: 'funding_not_found' });
            await captureMoney(assignment.funding_id, walletId(assignment.payout_wallet || (JSON.parse(nodeRaw) as NodeRecord).wallet_address),
                { task_id: body.task_id, node_id: nodeId, result_hash: digest(body.result) });
            rewardGstd = Number(units(splitNano(BigInt(funding.amount)).executor));
        }
        if (completion.status === 'duplicate') return res.status(200).json({ ok: true, task_id: body.task_id, duplicate: true, reward_gstd: rewardGstd });
        if (assignment.expected_hash) {
            await kvIncrByFloat('stats:probe_verified', 1);
        }
        const campaignId = assignment.campaign_id;
        // PlatformLink and other workers use completion as their single reporting path.
        // Preserve an earlier authenticated result if one is already present.
        await kvSetNX(`task:result:${body.task_id}`, JSON.stringify({
            ready: true, result: body.result, node_id: nodeId,
            latency_ms: body.latency_ms || 0, model: body.model,
        }), 120);


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
