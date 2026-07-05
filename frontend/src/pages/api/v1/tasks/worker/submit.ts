/**
 * POST /api/v1/tasks/worker/submit
 *
 * Called by gstd-a2a SDK (GSTDClient.submit_result) after task completion.
 *
 * Body: {
 *   task_id:          string
 *   node_id:          string
 *   result:           any     — task output; finetune results carry gradient metadata
 *   proof?:           string  — Ed25519 signature (optional, validated if present)
 *   reward_gstd?:     number
 *   execution_time_ms?: number
 * }
 *
 * If result contains metacognitive_score (finetune task), this endpoint
 * also forwards the gradient to update the training job.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../../lib/kv';
import { accrueReward, BASE_TASK_FEE } from '../../../../../lib/rewards';
import type { NodeRecord } from '../../nodes/register';
import type { TrainingJob, GradientRecord } from '../../training/jobs';

const NODE_TTL    = 600;
const JOB_TTL     = 7 * 24 * 3600;
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
        const rewardGstd = Number(body.reward_gstd) || 0;

        if (!taskId || !nodeId) {
            return res.status(400).json({ error: 'task_id and node_id required' });
        }

        // ── Node earnings ────────────────────────────────────────────────────
        const nodeRaw = await kvGet(`node:${nodeId}`);
        const nodeWrites: Promise<any>[] = [];

        if (nodeRaw) {
            const record: NodeRecord = JSON.parse(nodeRaw);
            record.tasks_completed = (record.tasks_completed || 0) + 1;
            record.gstd_earned     = Math.round(((record.gstd_earned || 0) + rewardGstd) * 1e6) / 1e6;
            record.last_seen       = new Date().toISOString();
            nodeWrites.push(kvSet(`node:${nodeId}`, JSON.stringify(record), NODE_TTL));

            if (record.wallet_address) {
                nodeWrites.push(
                    accrueReward(nodeId, record.wallet_address, rewardGstd || BASE_TASK_FEE, taskId)
                        .catch(() => {})
                );
            }
        }

        nodeWrites.push(kvIncr('stats:total_tasks_completed').then(() => {}));

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
