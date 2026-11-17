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
import { kvGet, kvSet, kvSetNX, kvIncr, kvIncrByFloat, kvCompleteAssignedTask } from '../../../../lib/kv';
import { COMMUNITY_TAX, BASE_TASK_FEE } from '../../../../lib/rewards';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import { hasTaskResult, declaredTaskModelMismatch } from '../../../../lib/taskValidation';
import { captureMoney, releaseMoney, MoneyError, splitNano, units, walletId, digest } from '../../../../lib/money';
import { completeMainnetJob } from '../../../../lib/mainnetJobs';
import { completePilotJob } from '../../../../lib/escrowJobs';
import type { TaskAssignment } from '../../../../lib/task-assignment';
import type { NodeRecord } from '../nodes/register';
import type { Campaign } from '../campaigns/create';

const NODE_TTL = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body ?? {};
        const nodeId = body.node_id || req.headers['x-node-id'];

        if (typeof nodeId !== 'string' || !nodeId.trim() || nodeId.length > 200) {
            return res.status(400).json({ error: 'node_id required' });
        }

        // Verify the registered wallet before consuming the one-time assignment.
        const walletHeader = req.headers['x-wallet-address'];
        const headerWallet = typeof walletHeader === 'string' ? walletHeader.trim().toLowerCase() : '';

        const nodeRaw = await kvGet(`node:${nodeId}`);
        if (!nodeRaw) return res.status(403).json({ error: 'Unknown node — register first' });
        const storedWallet = ((JSON.parse(nodeRaw) as NodeRecord).wallet_address || '').trim().toLowerCase();
        if (!storedWallet) return res.status(403).json({ error: 'Wallet required for paid task completions' });
        if (storedWallet && storedWallet !== headerWallet) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }
        const auth = await requireNodeSignature(nodeId, req.headers as any);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

        if (typeof body.task_id !== 'string' || !body.task_id.trim() || body.task_id.length > 200) {
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
        // Older SDKs submit explicit failure on this route. Release and capture
        // arbitrate against the same money job; only a reserved job can change.
        if (body.error && assigned.funding_id === body.task_id) await releaseMoney(assigned.funding_id);
        if (body.error || !hasTaskResult(body.result)) {
            return res.status(422).json({ error: 'A non-empty successful task result is required' });
        }
        if (declaredTaskModelMismatch(assigned.expected_model, body)) {
            return res.status(422).json({ error: 'model_mismatch', requested_model: assigned.expected_model });
        }
        if (assigned.task_type === 'finetune' || assigned.task_type === 'bridge_verify' || assigned.job_id || assigned.shard_id)
            return res.status(410).json({ error: 'Task execution is disabled' });
        let escrowReceipt;
        if (assigned.settlement_mode === 'testnet_contract') {
            if (assigned.funding_id || !assigned.escrow_job) return res.status(409).json({error:'invalid_escrow_job'});
            try { escrowReceipt = await completePilotJob(assigned.escrow_job,nodeId,body.model,body.result,body.latency_ms); }
            catch { return res.status(422).json({error:'invalid_escrow_job_result'}); }
        }
        if(assigned.settlement_mode==='mainnet_contract'){
            if(assigned.funding_id||!assigned.escrow_job)return res.status(409).json({error:'invalid_mainnet_job'});
            try{escrowReceipt=await completeMainnetJob(assigned.escrow_job,nodeId,body.model,body.result,body.latency_ms);}
            catch{return res.status(422).json({error:'invalid_mainnet_result'});}
        }
        let rewardGstd = 0;
        let fundedResultTtl = 0;
        if (assigned.funding_id) {
            if (assigned.expected_hash || assigned.funding_id !== body.task_id || !assigned.payout_wallet)
                return res.status(409).json({ error: 'invalid_funded_assignment' });
            // Funded work can only become visible as completed after capture.
            const funding = await captureMoney(assigned.funding_id, walletId(assigned.payout_wallet),
                { task_id: body.task_id, node_id: nodeId, result_hash: digest(body.result) });
            rewardGstd = Number(units(splitNano(BigInt(funding.amount)).executor));
            if (funding.finishedAt) fundedResultTtl = Math.floor((funding.finishedAt + 120_000 - Date.now()) / 1000);
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
        if (escrowReceipt) return res.status(200).json({ok:true,task_id:body.task_id,duplicate:completion.status==='duplicate',reward_gstd:0,escrow_receipt:escrowReceipt});
        const resultTtl = assignment.funding_id ? fundedResultTtl : completion.status === 'duplicate' ? 0 : 120;
        if (resultTtl > 0) {
            const writeResult = assignment.funding_id ? kvSet : kvSetNX;
            await writeResult(`task:result:${body.task_id}`, JSON.stringify({
                ready: true, result: body.result, node_id: nodeId,
                latency_ms: body.latency_ms || 0, model: body.model,
            }), resultTtl);
        }
        if (completion.status === 'duplicate') return res.status(200).json({ ok: true, task_id: body.task_id, duplicate: true, reward_gstd: rewardGstd });
        if (assignment.expected_hash) {
            await kvIncrByFloat('stats:probe_verified', 1);
        }
        if (assignment.campaign_id) await kvIncr(`cstats:${assignment.campaign_id}:tasks`);

        return res.status(200).json({
            ok:          true,
            task_id:     body.task_id,
            reward_gstd: rewardGstd,
        });
    } catch (error) {
        if (error instanceof MoneyError && ['idempotency_conflict', 'reservation_expired', 'reservation_not_found'].includes(error.code))
            return res.status(409).json({ error: error.code });
        console.error('[tasks/complete] Unable to finalize task');
        return res.status(500).json({ error: 'Internal error' });
    }
}
