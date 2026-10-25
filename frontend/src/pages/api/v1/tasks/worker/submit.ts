/**
 * POST /api/v1/tasks/worker/submit
 *
 * Called by gstd-a2a SDK (GSTDClient.submit_result) after task completion.
 *
 * Body: {
 *   task_id:          string
 *   node_id:          string
 *   result:           any     — task output; disabled training task results are rejected
 *   proof?:           string  — reserved for future verification; not currently checked
 *   reward_gstd?:     number — ignored; reward is fixed when the server assigns the task
 *   execution_time_ms?: number
 * }
 *
 * Training assignments are rejected by the atomic completion path before reward or job mutation.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvIncr, kvIncrByFloat, kvCompleteAssignedTask } from '../../../../../lib/kv';
import { COMMUNITY_TAX, BASE_TASK_FEE } from '../../../../../lib/rewards';
import type { TaskAssignment } from '../../../../../lib/task-assignment';
import type { NodeRecord } from '../../nodes/register';
import type { Campaign } from '../../campaigns/create';
import { requireNodeSignature } from '../../../../../lib/nodeAuth';
import { hasTaskResult } from '../../../../../lib/taskValidation';

const NODE_TTL    = 600;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const taskId:  string = body.task_id  || '';
        const nodeId:  string = body.node_id  || (req.headers['x-node-id'] as string) || '';
        const result:  any    = body.result;

        if (!taskId || !nodeId) {
            return res.status(400).json({ error: 'task_id and node_id required' });
        }

        // Verify the registered wallet before consuming the one-time assignment.
        const headerWallet = ((req.headers['x-wallet-address'] as string) || '').trim().toLowerCase();
        const nodeRaw = await kvGet(`node:${nodeId}`);
        if (!nodeRaw) return res.status(403).json({ error: 'Unknown node — register first' });
        const nodeRecord: NodeRecord = JSON.parse(nodeRaw);
        const walletAddress = (nodeRecord.wallet_address || '').trim();
        if (!walletAddress) return res.status(403).json({ error: 'Wallet required for paid task submissions' });
        if (walletAddress.toLowerCase() !== headerWallet) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
        const auth = await requireNodeSignature(nodeId, req.headers as any);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        if (body.error || !hasTaskResult(result)) {
            return res.status(422).json({ error: 'A non-empty successful task result is required' });
        }

        const completion = await kvCompleteAssignedTask(
            taskId,
            nodeId,
            walletAddress,
            BASE_TASK_FEE,
            COMMUNITY_TAX,
            NODE_TTL,
            86400 * 7,
            typeof result?.hash === 'string' ? result.hash : '',
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
            return res.status(200).json({ ok: true, task_id: taskId, duplicate: true });
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
        const nodeWrites: Promise<any>[] = [];
        if (assignment.expected_hash) {
            nodeWrites.push(kvIncrByFloat('stats:probe_verified', 1));
        }
        if (assignment.protocol_fee_gstd > 0) {
            nodeWrites.push(kvIncrByFloat('stats:protocol_treasury_gstd', assignment.protocol_fee_gstd).then(() => {}));
        }
        if (assignment.campaign_id) nodeWrites.push(kvIncr(`cstats:${assignment.campaign_id}:tasks`));

        await Promise.all(nodeWrites);

        return res.status(200).json({
            ok:               true,
            task_id:          taskId,
            reward_gstd:      rewardGstd,
        });
    } catch (err: any) {
        console.error('[tasks/worker/submit]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
