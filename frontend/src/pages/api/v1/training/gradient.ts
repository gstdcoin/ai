/**
 * POST /api/v1/training/gradient
 *
 * Called by TrainingNode (gstd-a2a) after completing a fine-tuning shard.
 * Records gradient quality, advances job progress, marks job done when all shards complete.
 *
 * Body:
 *   job_id               string
 *   shard_id             string   — task_id from the finetune task
 *   node_id              string
 *   domain               string
 *   metacognitive_score  number   0.0–1.0
 *   gradient_norm        number
 *   val_loss_improvement number
 *   lora_path            string   — local path or IPFS URL to LoRA adapter
 *
 * Minimum quality threshold: metacognitive_score >= 0.3
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../../../lib/kv';
import type { TrainingJob, GradientRecord } from './jobs';

const MIN_SCORE = 0.3;
const JOB_TTL   = 7 * 24 * 3600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = req.body as any;
        const job_id:              string = body.job_id   || body.jobId   || '';
        const shard_id:            string = body.shard_id || body.shardId || body.task_id || '';
        const node_id:             string = body.node_id  || body.nodeId  || '';
        const metacognitive_score: number = Number(body.metacognitive_score ?? body.metacognitiveScore ?? 0);
        const gradient_norm:       number = Number(body.gradient_norm      ?? body.gradientNorm      ?? 0);
        const val_loss_improvement:number = Number(body.val_loss_improvement ?? body.valLossImprovement ?? 0);
        const lora_path:           string = body.lora_path || body.loraPath || '';
        const domain:              string = body.domain || 'general';

        if (!job_id || !node_id) {
            return res.status(400).json({ error: 'job_id and node_id required' });
        }

        // Verify node ownership
        const headerWallet = ((req.headers['x-wallet-address'] as string) || '').trim().toLowerCase();
        if (headerWallet) {
            const nodeRaw = await kvGet(`node:${node_id}`).catch(() => null);
            if (nodeRaw) {
                const storedWallet = (JSON.parse(nodeRaw).wallet_address || '').toLowerCase();
                if (storedWallet && storedWallet !== headerWallet) {
                    return res.status(403).json({ error: 'Wallet mismatch' });
                }
            }
        }

        // Quality gate — reject low-quality gradients
        if (metacognitive_score < MIN_SCORE) {
            return res.status(200).json({
                accepted: false,
                reason:   `Score ${metacognitive_score.toFixed(3)} below threshold ${MIN_SCORE}`,
                job_id,
            });
        }

        const raw = await kvGet(`training:job:${job_id}`);
        if (!raw) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const job: TrainingJob = JSON.parse(raw);

        // Reject duplicate shard submissions
        if (job.gradients.some(g => g.shard_id === shard_id)) {
            return res.status(200).json({
                accepted: false,
                reason:   'Shard already submitted',
                job_id,
            });
        }

        const gradient: GradientRecord = {
            shard_id,
            node_id,
            metacognitive_score,
            gradient_norm,
            val_loss_improvement,
            lora_path,
            submitted_at: new Date().toISOString(),
        };

        job.gradients.push(gradient);
        job.shards_done = Math.min(job.shards_total, job.shards_done + 1);
        job.updated_at  = new Date().toISOString();

        if (job.shards_done >= job.shards_total) {
            // All shards done — pick best lora_path by metacognitive_score
            const best = [...job.gradients].sort((a, b) => b.metacognitive_score - a.metacognitive_score)[0];
            job.status   = 'done';
            job.lora_url = best?.lora_path || '';
        } else {
            job.status = 'training';
        }

        await kvSet(`training:job:${job_id}`, JSON.stringify(job), JOB_TTL);

        return res.status(200).json({
            accepted:            true,
            job_id,
            shard_id,
            shards_done:         job.shards_done,
            shards_total:        job.shards_total,
            status:              job.status,
            metacognitive_score,
            weight: Math.round(metacognitive_score * 100) / 100,
        });
    } catch (err: any) {
        console.error('[training/gradient]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
