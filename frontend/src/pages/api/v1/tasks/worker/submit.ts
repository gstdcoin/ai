/**
 * POST /api/v1/tasks/worker/submit
 *
 * Called by gstd-a2a SDK (GSTDClient.submit_result) after task completion.
 *
 * Body: {
 *   task_id:          string
 *   node_id:          string
 *   result:           any     — task output; finetune results carry gradient metadata
 *   proof?:           string  — reserved for future verification; not currently checked
 *   reward_gstd?:     number — ignored; reward is fixed when the server assigns the task
 *   execution_time_ms?: number
 * }
 *
 * If result contains metacognitive_score (finetune task), this endpoint
 * also forwards the gradient to update the training job.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvGetDelForNode, kvSet, kvIncr, kvIncrByFloat } from '../../../../../lib/kv';
import { accrueReward, BASE_TASK_FEE } from '../../../../../lib/rewards';
import type { TaskAssignment } from '../../../../../lib/task-assignment';
import type { NodeRecord } from '../../nodes/register';
import type { TrainingJob, GradientRecord } from '../../training/jobs';
import type { Campaign } from '../../campaigns/create';

const NODE_TTL    = 600;
const JOB_TTL     = 7 * 24 * 3600;
const CAMPAIGN_TTL_BUF = 3600;
const MIN_MC_SCORE = 0.3;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const taskId:  string = body.task_id  || '';
        const nodeId:  string = body.node_id  || (req.headers['x-node-id'] as string) || '';
        const result:  any    = body.result   || {};

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

        const assignedRaw = await kvGetDelForNode(`task_assigned:${taskId}`, nodeId);
        if (!assignedRaw) return res.status(409).json({ error: 'Task is not assigned to this node or was already completed' });
        let assignment: TaskAssignment;
        try {
            assignment = JSON.parse(assignedRaw) as TaskAssignment;
        } catch {
            return res.status(409).json({ error: 'Invalid task assignment' });
        }
        const rewardGstd = Number.isFinite(assignment.reward_gstd) && assignment.reward_gstd >= 0
            ? assignment.reward_gstd
            : BASE_TASK_FEE;
        const campaignRaw = assignment.campaign_id
            ? await kvGet(`campaign:${assignment.campaign_id}`)
            : null;

        const nodeWrites: Promise<any>[] = [];

        nodeRecord.tasks_completed = (nodeRecord.tasks_completed || 0) + 1;
        nodeRecord.gstd_earned     = Math.round(((nodeRecord.gstd_earned || 0) + rewardGstd) * 1e6) / 1e6;
        nodeRecord.last_seen       = new Date().toISOString();
        nodeWrites.push(kvSet(`node:${nodeId}`, JSON.stringify(nodeRecord), NODE_TTL));

        if (rewardGstd > 0) {
            nodeWrites.push(accrueReward(nodeId, walletAddress, rewardGstd, taskId));
        }

        nodeWrites.push(kvIncr('stats:total_tasks_completed').then(() => {}));
        if (assignment.protocol_fee_gstd > 0) {
            nodeWrites.push(kvIncrByFloat('stats:protocol_treasury_gstd', assignment.protocol_fee_gstd).then(() => {}));
        }
        if (campaignRaw && assignment.campaign_id) {
            const campaign: Campaign = JSON.parse(campaignRaw);
            campaign.tasks_completed = (campaign.tasks_completed || 0) + 1;
            const remaining = Math.ceil((new Date(campaign.expires_at).getTime() - Date.now()) / 1000);
            if (remaining > 0) {
                nodeWrites.push(kvSet(`campaign:${assignment.campaign_id}`, JSON.stringify(campaign), remaining + CAMPAIGN_TTL_BUF));
            }
        }

        // ── Finetune gradient handling ────────────────────────────────────────
        let gradientAccepted = false;
        let jobStatus = '';

        const mcScore: number = Number(result.metacognitive_score ?? result.score ?? -1);
        const jobId: string   = result.job_id   || body.job_id   || '';
        const shardId: string = result.shard_id || body.shard_id || taskId;

        if (jobId && mcScore >= 0) {
            // This is a finetune result — update training job
            if (mcScore >= MIN_MC_SCORE) {
                const jobRaw = await kvGet(`training:job:${jobId}`);
                if (jobRaw) {
                    const job: TrainingJob = JSON.parse(jobRaw);

                    // Reject duplicate shard
                    if (!job.gradients.some(g => g.shard_id === shardId)) {
                        const gradient: GradientRecord = {
                            shard_id:             shardId,
                            node_id:              nodeId,
                            metacognitive_score:  mcScore,
                            gradient_norm:        Number(result.gradient_norm ?? 0),
                            val_loss_improvement: Number(result.val_loss_improvement ?? 0),
                            lora_path:            result.lora_path || '',
                            submitted_at:         new Date().toISOString(),
                        };

                        job.gradients.push(gradient);
                        job.shards_done = Math.min(job.shards_total, job.shards_done + 1);
                        job.updated_at  = new Date().toISOString();

                        if (job.shards_done >= job.shards_total) {
                            const best = [...job.gradients]
                                .sort((a, b) => b.metacognitive_score - a.metacognitive_score)[0];
                            job.status   = 'done';
                            job.lora_url = best?.lora_path || '';
                        } else {
                            job.status = 'training';
                        }

                        nodeWrites.push(kvSet(`training:job:${jobId}`, JSON.stringify(job), JOB_TTL));
                        gradientAccepted = true;
                        jobStatus = job.status;
                    }
                }
            }
            nodeWrites.push(kvIncr('stats:training_gradients_submitted').then(() => {}));
        }

        await Promise.all(nodeWrites);

        return res.status(200).json({
            ok:               true,
            task_id:          taskId,
            reward_gstd:      rewardGstd,
            gradient_accepted: gradientAccepted,
            job_status:       jobStatus || undefined,
        });
    } catch (err: any) {
        console.error('[tasks/worker/submit]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
