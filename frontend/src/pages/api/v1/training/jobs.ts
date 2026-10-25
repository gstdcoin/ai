/**
 * GET  /api/v1/training/jobs        — list the authenticated wallet's jobs
 * POST /api/v1/training/jobs        — disabled until worker sandboxing exists
 * GET  /api/v1/training/jobs/:id    — handled via [id].ts
 *
 * Historical job reads require a verified TON wallet session.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../lib/kv';
import { sessionWallet } from '../../../../lib/walletSession';

export interface TrainingJob {
    job_id:       string;
    model:        string;
    dataset_url:  string;
    domain:       string;
    epochs:       number;
    steps:        number;
    wallet:       string;
    status:       'pending' | 'training' | 'aggregating' | 'done' | 'failed';
    shards_total: number;
    shards_done:  number;
    cost_gstd:    number;
    created_at:   string;
    updated_at:   string;
    lora_url?:    string;
    error?:       string;
    gradients:    GradientRecord[];
}

export interface GradientRecord {
    shard_id:            string;
    node_id:             string;
    metacognitive_score: number;
    gradient_norm:       number;
    val_loss_improvement: number;
    lora_path:           string;
    submitted_at:        string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        return handleSubmit(req, res);
    }
    if (req.method === 'GET') {
        return handleList(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSubmit(_req: NextApiRequest, res: NextApiResponse) {
    return res.status(410).json({
        error: 'training_disabled',
        message: 'Fine-tuning submissions are disabled until workers can process datasets in an isolated sandbox.',
    });
}

async function handleList(req: NextApiRequest, res: NextApiResponse) {
    try {
        const wallet = await sessionWallet(req.headers);
        if (!wallet) return res.status(401).json({ error: 'Not authenticated' });

        // Get all job IDs for this wallet (stored as a list)
        const raw = await kvGet(`training:wallet:${wallet}`);
        const jobIds: string[] = raw ? raw.split('\n').filter(Boolean) : [];

        const jobs = await Promise.all(
            jobIds.slice(-20).map(async (id) => {
                const jobRaw = await kvGet(`training:job:${id}`);
                return jobRaw ? JSON.parse(jobRaw) as TrainingJob : null;
            })
        );
        const ownedJobs = jobs
            .filter((job): job is TrainingJob => Boolean(job)
                && typeof job?.wallet === 'string'
                && job.wallet.toLowerCase() === wallet)
            .reverse();

        return res.status(200).json({
            jobs: ownedJobs,
            total: ownedJobs.length,
        });
    } catch (err: any) {
        console.error('[training/jobs GET]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
